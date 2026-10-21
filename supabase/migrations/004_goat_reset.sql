-- =============================================================================
-- BALE MANAGEMENT SYSTEM — Migration 004: Goat Farming Reset RPC
-- Modular, concurrency-safe deletion function to reset goat farming data
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

SET search_path = public, extensions, pg_catalog;

CREATE OR REPLACE FUNCTION public.reset_goat_data(p_options JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wipe_all BOOLEAN;
  v_wipe_sales BOOLEAN;
  v_wipe_purchases BOOLEAN;
  v_wipe_expenses BOOLEAN;
  v_wipe_goats BOOLEAN;
  v_wipe_contacts BOOLEAN;
  v_reset_seq BOOLEAN;
BEGIN
  -- Empty or missing options implies wiping all goat module data
  v_wipe_all := (p_options IS NULL OR p_options = '{}'::jsonb);
  v_wipe_sales := v_wipe_all OR COALESCE((p_options->>'sales')::BOOLEAN, false);
  v_wipe_purchases := v_wipe_all OR COALESCE((p_options->>'purchases')::BOOLEAN, false);
  v_wipe_expenses := v_wipe_all OR COALESCE((p_options->>'expenses')::BOOLEAN, false);
  v_wipe_goats := v_wipe_all OR COALESCE((p_options->>'goats')::BOOLEAN, false);
  v_wipe_contacts := v_wipe_all OR COALESCE((p_options->>'contacts')::BOOLEAN, false);
  v_reset_seq := v_wipe_all OR COALESCE((p_options->>'sequences')::BOOLEAN, false);

  -- If contacts (suppliers/customers) are being wiped, foreign key constraints
  -- require dependent sales & purchases to also be cleared first.
  IF v_wipe_contacts THEN
    v_wipe_sales := true;
    v_wipe_purchases := true;
  END IF;

  -- 1. Wipe Sales, Items & Customer Payments if selected
  IF v_wipe_sales THEN
    DELETE FROM public.goat_customer_payments WHERE id IS NOT NULL;
    DELETE FROM public.goat_sale_items WHERE id IS NOT NULL;
    DELETE FROM public.goat_sales WHERE id IS NOT NULL;
  END IF;

  -- 2. Wipe Goat Expenses if selected
  IF v_wipe_expenses THEN
    DELETE FROM public.goat_expenses WHERE id IS NOT NULL;
  END IF;

  -- 3. Wipe Health, Weight, Goats & Groups if selected
  IF v_wipe_goats THEN
    DELETE FROM public.goat_health_records WHERE id IS NOT NULL;
    DELETE FROM public.goat_weight_records WHERE id IS NOT NULL;
    DELETE FROM public.goats WHERE id IS NOT NULL;
    DELETE FROM public.goat_groups WHERE id IS NOT NULL;
  END IF;

  -- 4. Wipe Purchases & Supplier Payments if selected
  IF v_wipe_purchases THEN
    DELETE FROM public.goat_supplier_payments WHERE id IS NOT NULL;
    DELETE FROM public.goat_purchases WHERE id IS NOT NULL;
  END IF;

  -- 5. Wipe Contacts (Suppliers & Customers) if selected
  IF v_wipe_contacts THEN
    DELETE FROM public.goat_customers WHERE id IS NOT NULL;
    DELETE FROM public.goat_suppliers WHERE id IS NOT NULL;
  END IF;

  -- 6. Reset Sequences if requested
  IF v_reset_seq THEN
    IF v_wipe_purchases THEN
      BEGIN
        ALTER SEQUENCE IF EXISTS public.goat_purchase_seq RESTART WITH 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF v_wipe_sales THEN
      BEGIN
        ALTER SEQUENCE IF EXISTS public.goat_sale_seq RESTART WITH 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF v_wipe_expenses THEN
      BEGIN
        ALTER SEQUENCE IF EXISTS public.goat_expense_seq RESTART WITH 1;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
    IF v_wipe_goats THEN
      BEGIN
        ALTER SEQUENCE IF EXISTS public.goat_group_seq RESTART WITH 1;
        ALTER SEQUENCE IF EXISTS public.goat_tag_seq RESTART WITH 101;
      EXCEPTION WHEN OTHERS THEN NULL;
      END;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Goat farming data reset successfully'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_goat_data(JSONB) TO authenticated, anon;
