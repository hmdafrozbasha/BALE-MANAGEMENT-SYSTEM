-- =============================================================================
-- BMS — Migration 002: Fixes for invoice auto-generation & storage
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────
-- FIX 1: Reliable purchase invoice number generation (DB sequence)
-- ─────────────────────────────────────────────────────────────────

-- Create a dedicated sequence for purchase invoice numbers (concurrency-safe)
CREATE SEQUENCE IF NOT EXISTS public.purchase_invoice_seq START 1;

-- Function to generate a purchase invoice number atomically
CREATE OR REPLACE FUNCTION public.generate_purchase_invoice_no(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT;
  v_seq  BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq  := nextval('public.purchase_invoice_seq');
  RETURN 'PUR-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_purchase_invoice_no(DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- FIX 2: Update save_purchase RPC to auto-generate invoice_no
--         when caller passes an empty string
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_purchase(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_supplier_id UUID;
  v_material_id UUID;
  v_kg_conversion NUMERIC;
  v_quantity NUMERIC;
  v_rate NUMERIC;
  v_transport NUMERIC;
  v_loading NUMERIC;
  v_commission NUMERIC;
  v_other NUMERIC;
  v_gst_rate NUMERIC;
  v_subtotal NUMERIC;
  v_gst_amount NUMERIC;
  v_actual_cost NUMERIC;
  v_amount_paid NUMERIC;
  v_balance_pending NUMERIC;
  v_last_rate NUMERIC;
  v_rate_vs_last TEXT := 'neutral';
  v_rate_diff NUMERIC := 0;
  v_purchase_id UUID;
  v_unit TEXT;
  v_quantity_kg NUMERIC;
  v_invoice_no TEXT;
  v_purchase_date DATE;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'Access denied: only owner or accountant can record purchases';
  END IF;

  v_supplier_id := (p_data->>'supplier_id')::UUID;
  IF v_supplier_id IS NULL THEN
    INSERT INTO public.suppliers(name, phone, city, created_by)
    VALUES(p_data->>'supplier_name', p_data->>'supplier_phone', 'Local', v_user_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_id;
    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id FROM public.suppliers WHERE name = p_data->>'supplier_name' LIMIT 1;
    END IF;
  END IF;

  v_material_id := (p_data->>'material_id')::UUID;
  IF v_material_id IS NULL THEN
    SELECT id INTO v_material_id FROM public.raw_materials WHERE name = p_data->>'material_name' LIMIT 1;
    IF v_material_id IS NULL THEN
      INSERT INTO public.raw_materials(name, base_unit) VALUES(p_data->>'material_name', 'ton')
      RETURNING id INTO v_material_id;
    END IF;
  END IF;

  v_purchase_date := COALESCE(NULLIF(p_data->>'purchase_date', '')::DATE, CURRENT_DATE);

  -- Auto-generate invoice number when not provided
  v_invoice_no := NULLIF(trim(COALESCE(p_data->>'invoice_no', '')), '');
  IF v_invoice_no IS NULL THEN
    v_invoice_no := public.generate_purchase_invoice_no(v_purchase_date);
  END IF;

  v_unit := p_data->>'unit';
  v_quantity := (p_data->>'quantity')::NUMERIC;
  v_rate := (p_data->>'rate_per_unit')::NUMERIC;
  v_transport := COALESCE((p_data->>'transport')::NUMERIC, 0);
  v_loading := COALESCE((p_data->>'loading')::NUMERIC, 0);
  v_commission := COALESCE((p_data->>'commission')::NUMERIC, 0);
  v_other := COALESCE((p_data->>'other_charges')::NUMERIC, 0);
  v_gst_rate := COALESCE((p_data->>'gst_rate')::NUMERIC, 0);
  v_amount_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);

  CASE v_unit
    WHEN 'ton' THEN v_kg_conversion := 1000;
    WHEN 'load' THEN v_kg_conversion := 5000;
    WHEN 'bale' THEN v_kg_conversion := 28;
    ELSE v_kg_conversion := 1;
  END CASE;
  v_quantity_kg := v_quantity * v_kg_conversion;

  v_subtotal := (v_quantity * v_rate) + v_transport + v_loading + v_commission + v_other;
  v_gst_amount := ROUND((v_subtotal * v_gst_rate / 100), 2);
  v_actual_cost := v_subtotal + v_gst_amount;
  v_balance_pending := GREATEST(0, v_actual_cost - v_amount_paid);

  SELECT rate_per_unit INTO v_last_rate FROM public.purchases
  WHERE material_name = p_data->>'material_name' ORDER BY purchase_date DESC LIMIT 1;
  IF v_last_rate IS NOT NULL THEN
    v_rate_diff := v_rate - v_last_rate;
    IF v_rate_diff > 0 THEN v_rate_vs_last := 'up';
    ELSIF v_rate_diff < 0 THEN v_rate_vs_last := 'down';
    END IF;
  END IF;

  INSERT INTO public.purchases(
    supplier_id, purchase_date, invoice_no, material_id, material_name,
    quantity, unit, kg_conversion, rate_per_unit,
    transport, loading, commission, other_charges,
    gst_rate, gst_amount, actual_cost, amount_paid, balance_pending,
    payment_due_date, notes, rate_vs_last, rate_difference, created_by
  ) VALUES(
    v_supplier_id, v_purchase_date, v_invoice_no, v_material_id, p_data->>'material_name',
    v_quantity, v_unit, v_kg_conversion, v_rate,
    v_transport, v_loading, v_commission, v_other,
    v_gst_rate, v_gst_amount, v_actual_cost, v_amount_paid, v_balance_pending,
    NULLIF(p_data->>'payment_due_date', '')::DATE,
    COALESCE(p_data->>'notes', ''),
    v_rate_vs_last, v_rate_diff, v_user_id
  ) RETURNING id INTO v_purchase_id;

  IF v_amount_paid > 0 THEN
    INSERT INTO public.purchase_payments(
      purchase_id, supplier_id, amount, payment_date, payment_mode, note, created_by
    ) VALUES(
      v_purchase_id, v_supplier_id, v_amount_paid, v_purchase_date,
      COALESCE(p_data->>'payment_mode', 'Cash'), 'Initial payment at purchase', v_user_id
    );
  END IF;

  UPDATE public.raw_materials SET stock_kg = stock_kg + v_quantity_kg, updated_at = now()
  WHERE id = v_material_id;

  INSERT INTO public.inventory_movements(
    movement_type, reference_id, reference_type, material_id, quantity_kg, notes, created_by
  ) VALUES(
    'purchase_receipt', v_purchase_id, 'purchase', v_material_id, v_quantity_kg,
    'Purchase from ' || COALESCE(p_data->>'supplier_name', 'supplier'), v_user_id
  );

  RETURN jsonb_build_object('success', true, 'purchase_id', v_purchase_id, 'invoice_no', v_invoice_no);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- FIX 3: Storage bucket — ensure jpg/pdf allowed
-- ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES(
  'bms-attachments', 'bms-attachments', false, 5242880,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  allowed_mime_types = ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf'],
  file_size_limit = 5242880;

DROP POLICY IF EXISTS "Finance roles can upload attachments" ON storage.objects;
DROP POLICY IF EXISTS "Finance roles can view attachments" ON storage.objects;
DROP POLICY IF EXISTS "Owner can delete attachments" ON storage.objects;

CREATE POLICY "Finance roles can upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bms-attachments' AND public.is_finance_role());

CREATE POLICY "Finance roles can view attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'bms-attachments' AND public.is_finance_role());

CREATE POLICY "Owner can delete attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'bms-attachments' AND public.is_owner());

-- ─────────────────────────────────────────────────────────────────
-- FIX 4: Ensure sales status consistency and safe invoice numbering
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_sale(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_sale_id UUID;
  v_customer_id UUID;
  v_invoice_num TEXT;
  v_subtotal NUMERIC := 0;
  v_gst_rate NUMERIC;
  v_gst_amount NUMERIC;
  v_invoice_total NUMERIC;
  v_cogs_total NUMERIC := 0;
  v_amount_paid NUMERIC;
  v_balance_pending NUMERIC;
  v_line JSONB;
  v_plot_id UUID;
  v_batch_id UUID;
  v_bales_sold INTEGER;
  v_rate NUMERIC;
  v_cost_per_bale NUMERIC;
  v_line_sub NUMERIC;
  v_avail INTEGER;
  v_invoice_count INTEGER;
  v_status TEXT;
BEGIN
  -- Permission
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'Access denied: only owner or accountant can create sales';
  END IF;

  v_customer_id := (p_data->>'customer_id')::UUID;
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required for sale';
  END IF;

  v_gst_rate := COALESCE((p_data->>'gst_rate')::NUMERIC, 0);
  v_amount_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);

  -- Concurrency-safe invoice number generation
  v_invoice_num := NULLIF(trim(COALESCE(p_data->>'invoice_number', '')), '');
  IF v_invoice_num IS NULL THEN
    SELECT 'INV-' || LPAD((COALESCE(MAX(NULLIF(regexp_replace(invoice_number, '\D', '', 'g'), '')::INT), 1000) + 1)::TEXT, 4, '0')
    INTO v_invoice_num FROM public.sales;
    IF v_invoice_num IS NULL THEN
      v_invoice_num := 'INV-1001';
    END IF;
  END IF;

  -- Process line items (lock plots for update)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'line_items')
  LOOP
    v_plot_id := (v_line->>'plot_id')::UUID;
    v_bales_sold := (v_line->>'bales_sold')::INTEGER;
    v_rate := (v_line->>'rate_per_bale')::NUMERIC;

    SELECT pi.bales_remaining, pi.cost_per_bale, pi.batch_id
    INTO v_avail, v_cost_per_bale, v_batch_id
    FROM public.plot_inventory pi
    WHERE pi.plot_id = v_plot_id AND pi.status = 'Ready'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plot % is not ready for sale or does not exist', v_plot_id;
    END IF;
    IF v_avail < v_bales_sold THEN
      RAISE EXCEPTION 'Insufficient stock in plot. Available: %, Requested: %', v_avail, v_bales_sold;
    END IF;

    v_line_sub := v_bales_sold * v_rate;
    v_subtotal := v_subtotal + v_line_sub;
    v_cogs_total := v_cogs_total + (v_bales_sold * v_cost_per_bale);

    UPDATE public.plot_inventory
    SET bales_remaining = bales_remaining - v_bales_sold,
        status = CASE WHEN bales_remaining - v_bales_sold <= 0 THEN 'Empty' ELSE status END,
        updated_at = now()
    WHERE plot_id = v_plot_id;
  END LOOP;

  v_gst_amount := ROUND((v_subtotal * v_gst_rate / 100), 2);
  v_invoice_total := v_subtotal + v_gst_amount;
  v_balance_pending := GREATEST(0, v_invoice_total - v_amount_paid);

  IF v_balance_pending = 0 THEN
    v_status := 'Paid';
  ELSIF v_amount_paid > 0 THEN
    v_status := 'Partially Paid';
  ELSE
    v_status := 'Pending';
  END IF;

  INSERT INTO public.sales(
    invoice_number, customer_id, invoice_date, due_date,
    subtotal, gst_rate, gst_amount, invoice_total, cogs_total,
    amount_paid, balance_pending, status, notes, created_by
  ) VALUES(
    v_invoice_num, v_customer_id,
    COALESCE(NULLIF(p_data->>'invoice_date', '')::DATE, CURRENT_DATE),
    NULLIF(p_data->>'due_date', '')::DATE,
    v_subtotal, v_gst_rate, v_gst_amount, v_invoice_total, v_cogs_total,
    v_amount_paid, v_balance_pending,
    v_status,
    COALESCE(p_data->>'notes', ''),
    v_user_id
  ) RETURNING id INTO v_sale_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'line_items')
  LOOP
    v_plot_id := (v_line->>'plot_id')::UUID;
    v_bales_sold := (v_line->>'bales_sold')::INTEGER;
    v_rate := (v_line->>'rate_per_bale')::NUMERIC;

    SELECT pi.cost_per_bale, pi.batch_id INTO v_cost_per_bale, v_batch_id
    FROM public.plot_inventory pi WHERE pi.plot_id = v_plot_id;

    INSERT INTO public.sale_line_items(
      sale_id, plot_id, batch_id,
      plot_name, batch_number,
      bales_sold, rate_per_bale, cost_per_bale, subtotal
    ) VALUES(
      v_sale_id, v_plot_id, v_batch_id,
      (SELECT plot_name FROM public.plots WHERE id = v_plot_id),
      (SELECT batch_number FROM public.production_batches WHERE id = v_batch_id),
      v_bales_sold, v_rate, v_cost_per_bale, v_bales_sold * v_rate
    );

    INSERT INTO public.inventory_movements(movement_type, reference_id, reference_type, bales_delta, plot_id, batch_id, notes, created_by)
    VALUES('sale_deduction', v_sale_id, 'sale', -v_bales_sold, v_plot_id, v_batch_id, 'Sold ' || v_bales_sold || ' bales', v_user_id);
  END LOOP;

  IF v_amount_paid > 0 THEN
    INSERT INTO public.sale_payments(
      sale_id, customer_id, amount, payment_date, payment_mode, note, balance_after, created_by
    ) VALUES(
      v_sale_id, v_customer_id, v_amount_paid,
      COALESCE(NULLIF(p_data->>'invoice_date', '')::DATE, CURRENT_DATE),
      COALESCE(p_data->>'payment_mode', 'Cash'),
      'Advance payment at sale',
      v_balance_pending,
      v_user_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'invoice_number', v_invoice_num);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;
