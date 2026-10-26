-- =============================================================================
-- BALE MANAGEMENT SYSTEM — Migration 006: Independent Napier Management Module
-- Strictly isolated cultivation, repeated harvesting, stock ledger, sales,
-- independent expenses, payments/receivables, and financial accounting.
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

SET search_path = public, extensions, pg_catalog;

-- ─────────────────────────────────────────────────────────────────
-- SEQUENCES FOR CONCURRENCY-SAFE DOCUMENT IDENTIFIERS
-- ─────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.napier_plot_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.napier_harvest_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.napier_sale_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.napier_expense_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.napier_payment_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.napier_adj_seq START 1;

-- Reference generator functions
CREATE OR REPLACE FUNCTION public.generate_napier_plot_code()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  v_seq := nextval('public.napier_plot_seq');
  RETURN 'NAP-PLT-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_napier_plot_code() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_napier_harvest_ref(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.napier_harvest_seq');
  RETURN 'NAP-HRV-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_napier_harvest_ref(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_napier_sale_invoice_no(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.napier_sale_seq');
  RETURN 'NAP-SAL-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_napier_sale_invoice_no(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_napier_expense_ref(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.napier_expense_seq');
  RETURN 'NAP-EXP-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_napier_expense_ref(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_napier_payment_ref(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.napier_payment_seq');
  RETURN 'NAP-PAY-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_napier_payment_ref(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_napier_adj_ref(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.napier_adj_seq');
  RETURN 'NAP-ADJ-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_napier_adj_ref(DATE) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_plots (Cultivation Plots)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_plots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_code           TEXT NOT NULL UNIQUE,
  plot_name           TEXT NOT NULL,
  location            TEXT DEFAULT '',
  area                NUMERIC(10,2) NOT NULL DEFAULT 1.0 CHECK (area > 0),
  area_unit           TEXT NOT NULL DEFAULT 'Acres' CHECK (area_unit IN ('Acres', 'Hectares', 'Guntas', 'Cents', 'Sq.Meters')),
  napier_variety      TEXT NOT NULL DEFAULT 'Super Napier',
  planting_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  establishment_cost  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (establishment_cost >= 0),
  irrigation_type     TEXT DEFAULT 'Drip' CHECK (irrigation_type IN ('Drip', 'Sprinkler', 'Flood', 'Rainfed', 'Other')),
  status              TEXT NOT NULL DEFAULT 'Growing' CHECK (status IN ('Preparing', 'Growing', 'Ready for Harvest', 'Inactive')),
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_plots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_plots_code ON public.napier_plots(plot_code);
CREATE INDEX IF NOT EXISTS idx_napier_plots_status ON public.napier_plots(status);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_customers (Dedicated Napier Buyers)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  phone               TEXT DEFAULT '',
  address             TEXT DEFAULT '',
  notes               TEXT DEFAULT '',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_customers_name ON public.napier_customers(name);
CREATE INDEX IF NOT EXISTS idx_napier_customers_active ON public.napier_customers(is_active);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_harvests (Repeated Harvests from Plots)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_harvests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  harvest_ref           TEXT NOT NULL UNIQUE,
  harvest_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  plot_id               UUID NOT NULL REFERENCES public.napier_plots(id) ON DELETE RESTRICT,
  quantity_kg           NUMERIC(12,2) NOT NULL CHECK (quantity_kg > 0),
  input_quantity        NUMERIC(12,2) NOT NULL CHECK (input_quantity > 0),
  input_unit            TEXT NOT NULL DEFAULT 'kg' CHECK (input_unit IN ('kg', 'tonnes')),
  labour_cost           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (labour_cost >= 0),
  harvesting_cost       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (harvesting_cost >= 0),
  transport_cost        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_cost >= 0),
  other_cost            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  total_production_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_production_cost >= 0),
  cost_per_kg           NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (cost_per_kg >= 0),
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_harvests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_harvests_ref ON public.napier_harvests(harvest_ref);
CREATE INDEX IF NOT EXISTS idx_napier_harvests_plot ON public.napier_harvests(plot_id);
CREATE INDEX IF NOT EXISTS idx_napier_harvests_date ON public.napier_harvests(harvest_date);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_stock_movements (Source of Truth Inventory Ledger)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_stock_movements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  movement_type         TEXT NOT NULL CHECK (movement_type IN ('HARVEST_IN', 'SALE_OUT', 'ADJUSTMENT_ADD', 'ADJUSTMENT_SUB', 'WASTAGE')),
  quantity_kg           NUMERIC(12,2) NOT NULL, -- positive for additions, negative for deductions
  unit_cost             NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_cost            NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference_id          UUID,
  reference_no          TEXT NOT NULL,
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_movements_date ON public.napier_stock_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_napier_movements_ref ON public.napier_stock_movements(reference_no);
CREATE INDEX IF NOT EXISTS idx_napier_movements_type ON public.napier_stock_movements(movement_type);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_sales (Invoices & Outgoing Sales)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_sales (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no            TEXT NOT NULL UNIQUE,
  sale_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id           UUID NOT NULL REFERENCES public.napier_customers(id) ON DELETE RESTRICT,
  pricing_method        TEXT NOT NULL CHECK (pricing_method IN ('weight_based', 'fixed_bundle')),
  sale_unit             TEXT NOT NULL DEFAULT 'kg' CHECK (sale_unit IN ('kg', 'tonnes', 'bundle', 'load')),
  quantity_sold         NUMERIC(12,2) NOT NULL CHECK (quantity_sold > 0),
  rate_per_unit         NUMERIC(14,2) NOT NULL CHECK (rate_per_unit >= 0),
  quantity_deducted_kg  NUMERIC(12,2) NOT NULL CHECK (quantity_deducted_kg > 0),
  cogs_amount           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cogs_amount >= 0),
  subtotal              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  transport_charges     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_charges >= 0),
  other_charges         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  total_amount          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_pending       NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_status        TEXT NOT NULL DEFAULT 'Unpaid' CHECK (payment_status IN ('Paid', 'Partial', 'Unpaid')),
  due_date              DATE,
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_sales ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_sales_invoice ON public.napier_sales(invoice_no);
CREATE INDEX IF NOT EXISTS idx_napier_sales_customer ON public.napier_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_napier_sales_date ON public.napier_sales(sale_date);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_payments (Customer Payment Receipts)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_ref           TEXT NOT NULL UNIQUE,
  sale_id               UUID NOT NULL REFERENCES public.napier_sales(id) ON DELETE CASCADE,
  customer_id           UUID NOT NULL REFERENCES public.napier_customers(id) ON DELETE RESTRICT,
  payment_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method        TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other')),
  reference_no          TEXT DEFAULT '',
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_payments_sale ON public.napier_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_napier_payments_customer ON public.napier_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_napier_payments_date ON public.napier_payments(payment_date);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_expenses (Dedicated Napier Expenses)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_expenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_ref           TEXT NOT NULL UNIQUE,
  expense_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  category              TEXT NOT NULL CHECK (category IN (
                          'Planting Material', 'Land Preparation', 'Fertilizer & Soil Inputs',
                          'Irrigation & Water', 'Labour', 'Cultivation Maintenance',
                          'Harvesting', 'Transport', 'Equipment & Maintenance', 'Other Expenses'
                        )),
  amount                NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payee                 TEXT DEFAULT '',
  payment_method        TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other')),
  plot_id               UUID REFERENCES public.napier_plots(id) ON DELETE SET NULL,
  harvest_id            UUID REFERENCES public.napier_harvests(id) ON DELETE SET NULL,
  description           TEXT DEFAULT '',
  notes                 TEXT DEFAULT '',
  attachment_url        TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_expenses_ref ON public.napier_expenses(expense_ref);
CREATE INDEX IF NOT EXISTS idx_napier_expenses_date ON public.napier_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_napier_expenses_cat ON public.napier_expenses(category);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: napier_stock_adjustments (Traceable Adjustments & Wastage)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.napier_stock_adjustments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adj_ref               TEXT NOT NULL UNIQUE,
  adj_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  adj_type              TEXT NOT NULL CHECK (adj_type IN ('ADDITION', 'REDUCTION', 'WASTAGE')),
  quantity_kg           NUMERIC(12,2) NOT NULL CHECK (quantity_kg > 0),
  reason                TEXT NOT NULL,
  notes                 TEXT DEFAULT '',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.napier_stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_napier_adjustments_ref ON public.napier_stock_adjustments(adj_ref);
CREATE INDEX IF NOT EXISTS idx_napier_adjustments_date ON public.napier_stock_adjustments(adj_date);

-- ─────────────────────────────────────────────────────────────────
-- INVENTORY & FINANCIAL HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────

-- 1. Get current available stock and weighted average cost
CREATE OR REPLACE FUNCTION public.get_napier_stock_summary()
RETURNS TABLE (
  available_stock_kg NUMERIC,
  available_stock_tonnes NUMERIC,
  total_harvested_kg NUMERIC,
  total_sold_kg NUMERIC,
  total_wastage_kg NUMERIC,
  total_adjustments_kg NUMERIC,
  weighted_avg_cost_per_kg NUMERIC,
  inventory_valuation NUMERIC
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_available_kg NUMERIC := 0;
  v_harvested_kg NUMERIC := 0;
  v_sold_kg NUMERIC := 0;
  v_wastage_kg NUMERIC := 0;
  v_adj_kg NUMERIC := 0;
  v_harvest_total_cost NUMERIC := 0;
  v_avg_cost NUMERIC := 0;
  v_valuation NUMERIC := 0;
BEGIN
  -- Total available stock is the sum of all movements
  SELECT COALESCE(SUM(quantity_kg), 0) INTO v_available_kg FROM public.napier_stock_movements;
  
  -- Breakdown by movement types
  SELECT COALESCE(SUM(quantity_kg), 0), COALESCE(SUM(total_cost), 0)
    INTO v_harvested_kg, v_harvest_total_cost
    FROM public.napier_stock_movements WHERE movement_type = 'HARVEST_IN';

  SELECT COALESCE(ABS(SUM(quantity_kg)), 0) INTO v_sold_kg
    FROM public.napier_stock_movements WHERE movement_type = 'SALE_OUT';

  SELECT COALESCE(ABS(SUM(quantity_kg)), 0) INTO v_wastage_kg
    FROM public.napier_stock_movements WHERE movement_type = 'WASTAGE';

  SELECT COALESCE(SUM(quantity_kg), 0) INTO v_adj_kg
    FROM public.napier_stock_movements WHERE movement_type IN ('ADJUSTMENT_ADD', 'ADJUSTMENT_SUB');

  -- Weighted average production cost per kg
  IF v_harvested_kg > 0 THEN
    v_avg_cost := ROUND(v_harvest_total_cost / v_harvested_kg, 4);
  ELSE
    v_avg_cost := 0;
  END IF;

  IF v_available_kg > 0 THEN
    v_valuation := ROUND(v_available_kg * v_avg_cost, 2);
  ELSE
    v_valuation := 0;
  END IF;

  RETURN QUERY SELECT
    v_available_kg,
    ROUND(v_available_kg / 1000.0, 3),
    v_harvested_kg,
    v_sold_kg,
    v_wastage_kg,
    v_adj_kg,
    v_avg_cost,
    v_valuation;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_napier_stock_summary() TO authenticated;

-- 2. Atomic Harvest Recording
CREATE OR REPLACE FUNCTION public.record_napier_harvest(
  p_plot_id UUID,
  p_harvest_date DATE,
  p_input_quantity NUMERIC,
  p_input_unit TEXT,
  p_labour_cost NUMERIC DEFAULT 0,
  p_harvesting_cost NUMERIC DEFAULT 0,
  p_transport_cost NUMERIC DEFAULT 0,
  p_other_cost NUMERIC DEFAULT 0,
  p_notes TEXT DEFAULT ''
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref TEXT;
  v_qty_kg NUMERIC;
  v_total_cost NUMERIC;
  v_cost_per_kg NUMERIC;
  v_harvest_id UUID;
  v_result JSON;
BEGIN
  IF p_input_quantity <= 0 THEN
    RAISE EXCEPTION 'Harvest quantity must be greater than zero.';
  END IF;

  -- Convert to canonical kg
  IF LOWER(p_input_unit) = 'tonnes' OR LOWER(p_input_unit) = 'tonne' THEN
    v_qty_kg := p_input_quantity * 1000.0;
  ELSE
    v_qty_kg := p_input_quantity;
  END IF;

  v_total_cost := COALESCE(p_labour_cost, 0) + COALESCE(p_harvesting_cost, 0) + COALESCE(p_transport_cost, 0) + COALESCE(p_other_cost, 0);
  IF v_qty_kg > 0 THEN
    v_cost_per_kg := ROUND(v_total_cost / v_qty_kg, 4);
  ELSE
    v_cost_per_kg := 0;
  END IF;

  v_ref := public.generate_napier_harvest_ref(p_harvest_date);

  -- 1. Insert harvest record
  INSERT INTO public.napier_harvests (
    harvest_ref, harvest_date, plot_id, quantity_kg, input_quantity, input_unit,
    labour_cost, harvesting_cost, transport_cost, other_cost,
    total_production_cost, cost_per_kg, notes, created_by
  ) VALUES (
    v_ref, p_harvest_date, p_plot_id, v_qty_kg, p_input_quantity, p_input_unit,
    p_labour_cost, p_harvesting_cost, p_transport_cost, p_other_cost,
    v_total_cost, v_cost_per_kg, p_notes, auth.uid()
  ) RETURNING id INTO v_harvest_id;

  -- 2. Insert stock ledger movement (positive addition)
  INSERT INTO public.napier_stock_movements (
    movement_date, movement_type, quantity_kg, unit_cost, total_cost,
    reference_id, reference_no, notes, created_by
  ) VALUES (
    p_harvest_date, 'HARVEST_IN', v_qty_kg, v_cost_per_kg, v_total_cost,
    v_harvest_id, v_ref, 'Harvest from plot', auth.uid()
  );

  -- 3. Update plot status to 'Growing' (so it regrows for the next cycle)
  UPDATE public.napier_plots
     SET status = 'Growing', updated_at = now()
   WHERE id = p_plot_id;

  SELECT row_to_json(h) INTO v_result FROM (
    SELECT * FROM public.napier_harvests WHERE id = v_harvest_id
  ) h;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_napier_harvest(UUID, DATE, NUMERIC, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- 3. Atomic Sale Recording
CREATE OR REPLACE FUNCTION public.record_napier_sale(
  p_customer_id UUID,
  p_sale_date DATE,
  p_pricing_method TEXT,
  p_sale_unit TEXT,
  p_quantity_sold NUMERIC,
  p_rate_per_unit NUMERIC,
  p_quantity_deducted_kg NUMERIC,
  p_transport_charges NUMERIC DEFAULT 0,
  p_other_charges NUMERIC DEFAULT 0,
  p_amount_paid NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'Cash',
  p_due_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT ''
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current_stock NUMERIC;
  v_subtotal NUMERIC;
  v_total_amount NUMERIC;
  v_balance NUMERIC;
  v_status TEXT;
  v_invoice_no TEXT;
  v_sale_id UUID;
  v_avg_cost NUMERIC;
  v_cogs NUMERIC;
  v_payment_ref TEXT;
  v_result JSON;
BEGIN
  -- Check available stock
  SELECT COALESCE(SUM(quantity_kg), 0) INTO v_current_stock FROM public.napier_stock_movements;
  IF v_current_stock < p_quantity_deducted_kg THEN
    RAISE EXCEPTION 'Insufficient stock. Available: % kg, Requested sale: % kg.', v_current_stock, p_quantity_deducted_kg;
  END IF;

  -- Calculate weighted average unit cost for COGS
  SELECT weighted_avg_cost_per_kg INTO v_avg_cost FROM public.get_napier_stock_summary();
  v_cogs := ROUND(p_quantity_deducted_kg * COALESCE(v_avg_cost, 0), 2);

  v_subtotal := ROUND(p_quantity_sold * p_rate_per_unit, 2);
  v_total_amount := v_subtotal + COALESCE(p_transport_charges, 0) + COALESCE(p_other_charges, 0);
  v_balance := v_total_amount - COALESCE(p_amount_paid, 0);

  IF v_balance <= 0 THEN
    v_status := 'Paid';
    v_balance := 0;
  ELSIF p_amount_paid > 0 THEN
    v_status := 'Partial';
  ELSE
    v_status := 'Unpaid';
  END IF;

  v_invoice_no := public.generate_napier_sale_invoice_no(p_sale_date);

  -- 1. Insert sale record
  INSERT INTO public.napier_sales (
    invoice_no, sale_date, customer_id, pricing_method, sale_unit,
    quantity_sold, rate_per_unit, quantity_deducted_kg, cogs_amount,
    subtotal, transport_charges, other_charges, total_amount,
    amount_paid, balance_pending, payment_status, due_date, notes, created_by
  ) VALUES (
    v_invoice_no, p_sale_date, p_customer_id, p_pricing_method, p_sale_unit,
    p_quantity_sold, p_rate_per_unit, p_quantity_deducted_kg, v_cogs,
    v_subtotal, COALESCE(p_transport_charges, 0), COALESCE(p_other_charges, 0), v_total_amount,
    COALESCE(p_amount_paid, 0), v_balance, v_status, p_due_date, p_notes, auth.uid()
  ) RETURNING id INTO v_sale_id;

  -- 2. Deduct inventory via stock ledger (negative movement)
  INSERT INTO public.napier_stock_movements (
    movement_date, movement_type, quantity_kg, unit_cost, total_cost,
    reference_id, reference_no, notes, created_by
  ) VALUES (
    p_sale_date, 'SALE_OUT', -p_quantity_deducted_kg, COALESCE(v_avg_cost, 0), -v_cogs,
    v_sale_id, v_invoice_no, 'Sale to customer', auth.uid()
  );

  -- 3. If initial amount paid > 0, record payment entry
  IF p_amount_paid > 0 THEN
    v_payment_ref := public.generate_napier_payment_ref(p_sale_date);
    INSERT INTO public.napier_payments (
      payment_ref, sale_id, customer_id, payment_date, amount,
      payment_method, reference_no, notes, created_by
    ) VALUES (
      v_payment_ref, v_sale_id, p_customer_id, p_sale_date, p_amount_paid,
      p_payment_method, v_invoice_no, 'Initial payment at sale', auth.uid()
    );
  END IF;

  SELECT row_to_json(s) INTO v_result FROM (
    SELECT * FROM public.napier_sales WHERE id = v_sale_id
  ) s;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_napier_sale(UUID, DATE, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT, DATE, TEXT) TO authenticated;

-- 4. Atomic Payment Recording
CREATE OR REPLACE FUNCTION public.record_napier_payment(
  p_sale_id UUID,
  p_payment_date DATE,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'Cash',
  p_reference_no TEXT DEFAULT '',
  p_notes TEXT DEFAULT ''
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sale RECORD;
  v_new_paid NUMERIC;
  v_new_balance NUMERIC;
  v_new_status TEXT;
  v_payment_ref TEXT;
  v_result JSON;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  SELECT * INTO v_sale FROM public.napier_sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale invoice not found.';
  END IF;

  IF p_amount > v_sale.balance_pending THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds outstanding balance (%).', p_amount, v_sale.balance_pending;
  END IF;

  v_new_paid := v_sale.amount_paid + p_amount;
  v_new_balance := v_sale.balance_pending - p_amount;

  IF v_new_balance <= 0 THEN
    v_new_status := 'Paid';
    v_new_balance := 0;
  ELSE
    v_new_status := 'Partial';
  END IF;

  v_payment_ref := public.generate_napier_payment_ref(p_payment_date);

  -- Insert payment record
  INSERT INTO public.napier_payments (
    payment_ref, sale_id, customer_id, payment_date, amount,
    payment_method, reference_no, notes, created_by
  ) VALUES (
    v_payment_ref, p_sale_id, v_sale.customer_id, p_payment_date, p_amount,
    p_payment_method, p_reference_no, p_notes, auth.uid()
  );

  -- Update invoice
  UPDATE public.napier_sales
     SET amount_paid = v_new_paid,
         balance_pending = v_new_balance,
         payment_status = v_new_status,
         updated_at = now()
   WHERE id = p_sale_id;

  SELECT row_to_json(s) INTO v_result FROM (
    SELECT * FROM public.napier_sales WHERE id = p_sale_id
  ) s;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_napier_payment(UUID, DATE, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- 5. Atomic Stock Adjustment & Wastage Recording
CREATE OR REPLACE FUNCTION public.record_napier_stock_adjustment(
  p_adj_date DATE,
  p_adj_type TEXT,
  p_quantity_kg NUMERIC,
  p_reason TEXT,
  p_notes TEXT DEFAULT ''
)
RETURNS JSON LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ref TEXT;
  v_adj_id UUID;
  v_movement_type TEXT;
  v_delta_kg NUMERIC;
  v_curr_stock NUMERIC;
  v_avg_cost NUMERIC;
  v_result JSON;
BEGIN
  IF p_quantity_kg <= 0 THEN
    RAISE EXCEPTION 'Adjustment quantity must be greater than zero.';
  END IF;

  IF p_adj_type NOT IN ('ADDITION', 'REDUCTION', 'WASTAGE') THEN
    RAISE EXCEPTION 'Invalid adjustment type: %', p_adj_type;
  END IF;

  -- Validate stock if reduction or wastage
  IF p_adj_type IN ('REDUCTION', 'WASTAGE') THEN
    SELECT COALESCE(SUM(quantity_kg), 0) INTO v_curr_stock FROM public.napier_stock_movements;
    IF v_curr_stock < p_quantity_kg THEN
      RAISE EXCEPTION 'Insufficient stock to adjust. Available: % kg, Requested: % kg.', v_curr_stock, p_quantity_kg;
    END IF;
  END IF;

  SELECT weighted_avg_cost_per_kg INTO v_avg_cost FROM public.get_napier_stock_summary();

  v_ref := public.generate_napier_adj_ref(p_adj_date);

  INSERT INTO public.napier_stock_adjustments (
    adj_ref, adj_date, adj_type, quantity_kg, reason, notes, created_by
  ) VALUES (
    v_ref, p_adj_date, p_adj_type, p_quantity_kg, p_reason, p_notes, auth.uid()
  ) RETURNING id INTO v_adj_id;

  IF p_adj_type = 'ADDITION' THEN
    v_movement_type := 'ADJUSTMENT_ADD';
    v_delta_kg := p_quantity_kg;
  ELSIF p_adj_type = 'WASTAGE' THEN
    v_movement_type := 'WASTAGE';
    v_delta_kg := -p_quantity_kg;
  ELSE
    v_movement_type := 'ADJUSTMENT_SUB';
    v_delta_kg := -p_quantity_kg;
  END IF;

  INSERT INTO public.napier_stock_movements (
    movement_date, movement_type, quantity_kg, unit_cost, total_cost,
    reference_id, reference_no, notes, created_by
  ) VALUES (
    p_adj_date, v_movement_type, v_delta_kg, COALESCE(v_avg_cost, 0), ROUND(v_delta_kg * COALESCE(v_avg_cost, 0), 2),
    v_adj_id, v_ref, p_reason, auth.uid()
  );

  SELECT row_to_json(a) INTO v_result FROM (
    SELECT * FROM public.napier_stock_adjustments WHERE id = v_adj_id
  ) a;

  RETURN v_result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_napier_stock_adjustment(DATE, TEXT, NUMERIC, TEXT, TEXT) TO authenticated;

-- 6. Napier Dashboard Metrics RPC
CREATE OR REPLACE FUNCTION public.get_napier_dashboard_metrics(p_month TEXT DEFAULT NULL)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month_start DATE;
  v_month_end DATE;
  v_stock_summary RECORD;
  
  v_total_plots INT := 0;
  v_active_plots INT := 0;
  v_ready_plots INT := 0;
  
  v_harvest_qty_month NUMERIC := 0;
  v_harvest_qty_all NUMERIC := 0;
  v_harvest_cost_month NUMERIC := 0;
  v_harvest_cost_all NUMERIC := 0;
  
  v_sold_qty_month NUMERIC := 0;
  v_sold_qty_all NUMERIC := 0;
  v_sales_rev_month NUMERIC := 0;
  v_sales_rev_all NUMERIC := 0;
  v_cogs_month NUMERIC := 0;
  v_cogs_all NUMERIC := 0;
  
  v_operating_exp_month NUMERIC := 0;
  v_operating_exp_all NUMERIC := 0;
  
  v_cash_received_month NUMERIC := 0;
  v_cash_received_all NUMERIC := 0;
  v_receivables_total NUMERIC := 0;
BEGIN
  IF p_month IS NOT NULL AND p_month ~ '^\d{4}-\d{2}$' THEN
    v_month_start := (p_month || '-01')::DATE;
    v_month_end := (date_trunc('month', v_month_start) + interval '1 month - 1 day')::DATE;
  ELSE
    v_month_start := date_trunc('month', CURRENT_DATE)::DATE;
    v_month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::DATE;
  END IF;

  -- Plots count
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status IN ('Growing', 'Ready for Harvest')),
         COUNT(*) FILTER (WHERE status = 'Ready for Harvest')
    INTO v_total_plots, v_active_plots, v_ready_plots
    FROM public.napier_plots;

  -- Stock summary
  SELECT * INTO v_stock_summary FROM public.get_napier_stock_summary();

  -- Harvests
  SELECT COALESCE(SUM(quantity_kg), 0), COALESCE(SUM(total_production_cost), 0)
    INTO v_harvest_qty_month, v_harvest_cost_month
    FROM public.napier_harvests
   WHERE harvest_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(SUM(quantity_kg), 0), COALESCE(SUM(total_production_cost), 0)
    INTO v_harvest_qty_all, v_harvest_cost_all
    FROM public.napier_harvests;

  -- Sales & Invoices
  SELECT COALESCE(SUM(quantity_deducted_kg), 0), COALESCE(SUM(total_amount), 0), COALESCE(SUM(cogs_amount), 0)
    INTO v_sold_qty_month, v_sales_rev_month, v_cogs_month
    FROM public.napier_sales
   WHERE sale_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(SUM(quantity_deducted_kg), 0), COALESCE(SUM(total_amount), 0), COALESCE(SUM(cogs_amount), 0),
         COALESCE(SUM(balance_pending), 0)
    INTO v_sold_qty_all, v_sales_rev_all, v_cogs_all, v_receivables_total
    FROM public.napier_sales;

  -- Expenses
  SELECT COALESCE(SUM(amount), 0) INTO v_operating_exp_month
    FROM public.napier_expenses
   WHERE expense_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_operating_exp_all
    FROM public.napier_expenses;

  -- Cash received via payments
  SELECT COALESCE(SUM(amount), 0) INTO v_cash_received_month
    FROM public.napier_payments
   WHERE payment_date BETWEEN v_month_start AND v_month_end;

  SELECT COALESCE(SUM(amount), 0) INTO v_cash_received_all
    FROM public.napier_payments;

  RETURN json_build_object(
    'month', to_char(v_month_start, 'YYYY-MM'),
    'total_plots', v_total_plots,
    'active_plots', v_active_plots,
    'ready_plots', v_ready_plots,
    'available_stock_kg', v_stock_summary.available_stock_kg,
    'available_stock_tonnes', v_stock_summary.available_stock_tonnes,
    'stock_valuation', v_stock_summary.inventory_valuation,
    'avg_cost_per_kg', v_stock_summary.weighted_avg_cost_per_kg,
    'harvested_month_kg', v_harvest_qty_month,
    'harvested_month_tonnes', ROUND(v_harvest_qty_month / 1000.0, 3),
    'harvested_all_kg', v_harvest_qty_all,
    'sold_month_kg', v_sold_qty_month,
    'sold_month_tonnes', ROUND(v_sold_qty_month / 1000.0, 3),
    'sales_revenue_month', v_sales_rev_month,
    'sales_revenue_all', v_sales_rev_all,
    'cogs_month', v_cogs_month,
    'cogs_all', v_cogs_all,
    'gross_profit_month', v_sales_rev_month - v_cogs_month,
    'net_profit_month', (v_sales_rev_month - v_cogs_month) - v_operating_exp_month,
    'production_cost_month', v_harvest_cost_month,
    'production_cost_all', v_harvest_cost_all,
    'operating_expenses_month', v_operating_exp_month,
    'operating_expenses_all', v_operating_exp_all,
    'cash_received_month', v_cash_received_month,
    'cash_received_all', v_cash_received_all,
    'receivables_total', v_receivables_total
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_napier_dashboard_metrics(TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ─────────────────────────────────────────────────────────────────

-- Generic select for authenticated users on all tables
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'napier_plots', 'napier_customers', 'napier_harvests',
    'napier_stock_movements', 'napier_sales', 'napier_payments',
    'napier_expenses', 'napier_stock_adjustments'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS p_select_all_%s ON public.%I', t, t);
    EXECUTE format('CREATE POLICY p_select_all_%s ON public.%I FOR SELECT TO authenticated USING (true)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS p_insert_finance_%s ON public.%I', t, t);
    EXECUTE format('CREATE POLICY p_insert_finance_%s ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_active_user())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS p_update_finance_%s ON public.%I', t, t);
    EXECUTE format('CREATE POLICY p_update_finance_%s ON public.%I FOR UPDATE TO authenticated USING (public.is_finance_role()) WITH CHECK (public.is_finance_role())', t, t);

    EXECUTE format('DROP POLICY IF EXISTS p_delete_owner_%s ON public.%I', t, t);
    EXECUTE format('CREATE POLICY p_delete_owner_%s ON public.%I FOR DELETE TO authenticated USING (public.is_owner())', t, t);
  END LOOP;
END;
$$;
