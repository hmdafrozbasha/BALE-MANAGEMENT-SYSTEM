-- =============================================================================
-- BALE MANAGEMENT SYSTEM — Complete Database Schema
-- Migration: 001_initial_schema.sql
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────
-- UTILITY FUNCTION: safe search_path
-- ─────────────────────────────────────────────────────────────────
SET search_path = public, extensions, pg_catalog;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: profiles (linked to auth.users)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'accountant', 'staff')),
  phone           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: app_settings
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT NOT NULL DEFAULT 'Sri Balaji Agro Bales',
  gstin               TEXT DEFAULT '36AAAAA0000A1Z5',
  phone               TEXT DEFAULT '+91 98765 43210',
  address             TEXT DEFAULT 'Plot 45, Industrial Area, Warangal, Telangana - 506001',
  fermentation_days   INTEGER NOT NULL DEFAULT 30 CHECK (fermentation_days > 0 AND fermentation_days <= 180),
  currency_symbol     TEXT NOT NULL DEFAULT 'INR',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Insert default settings row
INSERT INTO public.app_settings (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: suppliers
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  city            TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  gst_number      TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.suppliers(is_active);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: raw_materials
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.raw_materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  base_unit       TEXT NOT NULL DEFAULT 'kg' CHECK (base_unit IN ('kg', 'ton', 'load', 'bale')),
  stock_kg        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (stock_kg >= 0),
  min_stock_kg    NUMERIC(14,2) DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

-- Default material
INSERT INTO public.raw_materials (name, base_unit, stock_kg)
VALUES ('Hay (loose)', 'ton', 0)
ON CONFLICT (name) DO UPDATE SET stock_kg = 0;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: purchases
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         UUID NOT NULL REFERENCES public.suppliers(id),
  purchase_date       DATE NOT NULL,
  invoice_no          TEXT NOT NULL,
  material_id         UUID REFERENCES public.raw_materials(id),
  material_name       TEXT NOT NULL,
  quantity            NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit                TEXT NOT NULL CHECK (unit IN ('ton', 'kg', 'load', 'bale')),
  kg_conversion       NUMERIC(14,3) NOT NULL DEFAULT 1,
  quantity_kg         NUMERIC(14,3) GENERATED ALWAYS AS (quantity * kg_conversion) STORED,
  rate_per_unit       NUMERIC(14,2) NOT NULL CHECK (rate_per_unit >= 0),
  material_cost       NUMERIC(14,2) GENERATED ALWAYS AS (quantity * rate_per_unit) STORED,
  transport           NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport >= 0),
  loading             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (loading >= 0),
  commission          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (commission >= 0),
  other_charges       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_charges >= 0),
  gst_rate            NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 28),
  gst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  actual_cost         NUMERIC(14,2) NOT NULL,
  amount_paid         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_pending     NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_due_date    DATE,
  notes               TEXT DEFAULT '',
  rate_vs_last        TEXT DEFAULT 'neutral' CHECK (rate_vs_last IN ('up', 'down', 'neutral')),
  rate_difference     NUMERIC(14,2) DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id),
  UNIQUE(supplier_id, invoice_no)
);
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON public.purchases(purchase_date DESC);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: purchase_payments (append-only ledger)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES public.purchases(id),
  supplier_id     UUID NOT NULL REFERENCES public.suppliers(id),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL,
  payment_mode    TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  reference_no    TEXT DEFAULT '',
  note            TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.purchase_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_purch_pay_purchase ON public.purchase_payments(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purch_pay_supplier ON public.purchase_payments(supplier_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: plots
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_name       TEXT NOT NULL UNIQUE,
  section         TEXT NOT NULL CHECK (section IN ('A','B','C','D','E','F')),
  description     TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plots ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_plots_section ON public.plots(section);
CREATE INDEX IF NOT EXISTS idx_plots_name ON public.plots(plot_name);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: production_batches
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_batches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number        TEXT NOT NULL UNIQUE,
  production_date     DATE NOT NULL,
  material_id         UUID REFERENCES public.raw_materials(id),
  raw_material_kg     NUMERIC(14,2) NOT NULL CHECK (raw_material_kg > 0),
  raw_material_cost   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (raw_material_cost >= 0),
  labour_cost         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (labour_cost >= 0),
  wrapping_cost       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (wrapping_cost >= 0),
  machinery_cost      NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (machinery_cost >= 0),
  other_cost          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_cost >= 0),
  total_production_cost NUMERIC(14,2) NOT NULL,
  finished_bales      INTEGER NOT NULL CHECK (finished_bales > 0),
  cost_per_bale       NUMERIC(14,4) NOT NULL,
  plot_id             UUID REFERENCES public.plots(id),
  plot_name           TEXT,
  fermentation_start  DATE NOT NULL,
  fermentation_days   INTEGER NOT NULL DEFAULT 30,
  ready_date          DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'Fermenting' CHECK (status IN ('Fermenting', 'Ready', 'Sold Out')),
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.production_batches ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_batches_status ON public.production_batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_date ON public.production_batches(production_date DESC);
CREATE INDEX IF NOT EXISTS idx_batches_number ON public.production_batches(batch_number);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: plot_inventory (current stock per plot)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plot_inventory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plot_id         UUID NOT NULL UNIQUE REFERENCES public.plots(id),
  batch_id        UUID REFERENCES public.production_batches(id),
  bales_original  INTEGER NOT NULL DEFAULT 0 CHECK (bales_original >= 0),
  bales_remaining INTEGER NOT NULL DEFAULT 0 CHECK (bales_remaining >= 0),
  cost_per_bale   NUMERIC(14,4) NOT NULL DEFAULT 0,
  ferm_start      DATE,
  ready_date      DATE,
  status          TEXT NOT NULL DEFAULT 'Empty' CHECK (status IN ('Empty', 'Fermenting', 'Ready')),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.plot_inventory ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_plot_inv_status ON public.plot_inventory(status);
CREATE INDEX IF NOT EXISTS idx_plot_inv_batch ON public.plot_inventory(batch_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: customers
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  gst_number      TEXT DEFAULT '',
  credit_limit    NUMERIC(14,2) NOT NULL DEFAULT 300000,
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: sales (invoices)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  TEXT NOT NULL UNIQUE,
  customer_id     UUID NOT NULL REFERENCES public.customers(id),
  invoice_date    DATE NOT NULL,
  due_date        DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_rate        NUMERIC(5,2) NOT NULL DEFAULT 0,
  gst_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  invoice_total   NUMERIC(14,2) NOT NULL,
  cogs_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_pending NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Partially Paid', 'Paid')),
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sales_customer ON public.sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: sale_line_items
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  plot_id         UUID REFERENCES public.plots(id),
  batch_id        UUID REFERENCES public.production_batches(id),
  plot_name       TEXT,
  batch_number    TEXT,
  bales_sold      INTEGER NOT NULL CHECK (bales_sold > 0),
  rate_per_bale   NUMERIC(14,2) NOT NULL CHECK (rate_per_bale > 0),
  cost_per_bale   NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sale_line_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_line_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_batch ON public.sale_line_items(batch_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: sale_payments (append-only ledger)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES public.sales(id),
  customer_id     UUID NOT NULL REFERENCES public.customers(id),
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date    DATE NOT NULL,
  payment_mode    TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  reference_no    TEXT DEFAULT '',
  note            TEXT DEFAULT '',
  balance_after   NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_sale_pay_sale ON public.sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_pay_customer ON public.sale_payments(customer_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: expenses
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paid_to         TEXT NOT NULL,
  reason          TEXT NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  expense_date    DATE NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Miscellaneous' CHECK (category IN (
    'Production', 'Employees', 'Transport', 'Factory',
    'Sales', 'Office and admin', 'Miscellaneous'
  )),
  payment_mode    TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque')),
  related_batch_id UUID REFERENCES public.production_batches(id),
  related_batch_number TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: attachments
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('purchase', 'expense', 'sale', 'payment')),
  entity_id       UUID NOT NULL,
  storage_path    TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_attach_entity ON public.attachments(entity_type, entity_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: inventory_movements (audit ledger)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type   TEXT NOT NULL CHECK (movement_type IN (
    'purchase_receipt', 'raw_material_consumption', 'production_output',
    'plot_assignment', 'sale_deduction', 'adjustment'
  )),
  reference_id    UUID,
  reference_type  TEXT,
  material_id     UUID REFERENCES public.raw_materials(id),
  quantity_kg     NUMERIC(14,3),
  bales_delta     INTEGER DEFAULT 0,
  plot_id         UUID REFERENCES public.plots(id),
  batch_id        UUID REFERENCES public.production_batches(id),
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_inv_mov_type ON public.inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inv_mov_ref ON public.inventory_movements(reference_id);

-- =============================================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================================

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Helper function: check if current user is owner
CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner' AND is_active = true);
$$;

-- Helper function: check if owner or accountant
CREATE OR REPLACE FUNCTION public.is_finance_role()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'accountant') AND is_active = true
  );
$$;

-- Helper function: check if any valid role (active user)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true);
$$;

-- ── profiles ──
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Owner can view all profiles" ON public.profiles
  FOR SELECT USING (public.is_owner());
CREATE POLICY "Owner can manage profiles" ON public.profiles
  FOR ALL USING (public.is_owner());
CREATE POLICY "Users can update own non-role fields" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- ── app_settings ──
CREATE POLICY "Active users can view settings" ON public.app_settings
  FOR SELECT USING (public.is_active_user());
CREATE POLICY "Owner can update settings" ON public.app_settings
  FOR UPDATE USING (public.is_owner());

-- ── suppliers ──
CREATE POLICY "Finance roles can view suppliers" ON public.suppliers
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert suppliers" ON public.suppliers
  FOR INSERT WITH CHECK (public.is_finance_role());
CREATE POLICY "Finance roles can update suppliers" ON public.suppliers
  FOR UPDATE USING (public.is_finance_role());
CREATE POLICY "Owner can delete suppliers" ON public.suppliers
  FOR DELETE USING (public.is_owner());

-- ── raw_materials ──
CREATE POLICY "Active users can view materials" ON public.raw_materials
  FOR SELECT USING (public.is_active_user());
CREATE POLICY "Finance roles can manage materials" ON public.raw_materials
  FOR ALL USING (public.is_finance_role());

-- ── purchases ──
CREATE POLICY "Finance roles can view purchases" ON public.purchases
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert purchases" ON public.purchases
  FOR INSERT WITH CHECK (public.is_finance_role());
CREATE POLICY "Owner can update purchases" ON public.purchases
  FOR UPDATE USING (public.is_owner());
CREATE POLICY "Owner can delete purchases" ON public.purchases
  FOR DELETE USING (public.is_owner());

-- ── purchase_payments ──
CREATE POLICY "Finance roles can view purchase payments" ON public.purchase_payments
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert purchase payments" ON public.purchase_payments
  FOR INSERT WITH CHECK (public.is_finance_role());

-- ── plots ──
CREATE POLICY "Active users can view plots" ON public.plots
  FOR SELECT USING (public.is_active_user());
CREATE POLICY "Owner can manage plots" ON public.plots
  FOR ALL USING (public.is_owner());

-- ── plot_inventory ──
CREATE POLICY "Active users can view plot inventory" ON public.plot_inventory
  FOR SELECT USING (public.is_active_user());
CREATE POLICY "Finance and staff can update plot inventory" ON public.plot_inventory
  FOR UPDATE USING (public.is_active_user());
CREATE POLICY "Finance roles can insert plot inventory" ON public.plot_inventory
  FOR INSERT WITH CHECK (public.is_finance_role());

-- ── production_batches ──
CREATE POLICY "Active users can view batches" ON public.production_batches
  FOR SELECT USING (public.is_active_user());
CREATE POLICY "Active users can insert batches" ON public.production_batches
  FOR INSERT WITH CHECK (public.is_active_user());
CREATE POLICY "Finance roles can update batches" ON public.production_batches
  FOR UPDATE USING (public.is_finance_role());
CREATE POLICY "Owner can delete batches" ON public.production_batches
  FOR DELETE USING (public.is_owner());

-- ── customers ──
CREATE POLICY "Finance roles can view customers" ON public.customers
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can manage customers" ON public.customers
  FOR ALL USING (public.is_finance_role());
CREATE POLICY "Owner can delete customers" ON public.customers
  FOR DELETE USING (public.is_owner());

-- ── sales ──
CREATE POLICY "Finance roles can view sales" ON public.sales
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert sales" ON public.sales
  FOR INSERT WITH CHECK (public.is_finance_role());
CREATE POLICY "Finance roles can update sales" ON public.sales
  FOR UPDATE USING (public.is_finance_role());
CREATE POLICY "Owner can delete sales" ON public.sales
  FOR DELETE USING (public.is_owner());

-- ── sale_line_items ──
CREATE POLICY "Finance roles can view sale items" ON public.sale_line_items
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert sale items" ON public.sale_line_items
  FOR INSERT WITH CHECK (public.is_finance_role());

-- ── sale_payments ──
CREATE POLICY "Finance roles can view sale payments" ON public.sale_payments
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert sale payments" ON public.sale_payments
  FOR INSERT WITH CHECK (public.is_finance_role());

-- ── expenses ──
CREATE POLICY "Finance roles can view expenses" ON public.expenses
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert expenses" ON public.expenses
  FOR INSERT WITH CHECK (public.is_finance_role());
CREATE POLICY "Finance roles can update expenses" ON public.expenses
  FOR UPDATE USING (public.is_finance_role());
CREATE POLICY "Owner can delete expenses" ON public.expenses
  FOR DELETE USING (public.is_owner());

-- ── attachments ──
CREATE POLICY "Finance roles can view attachments" ON public.attachments
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "Finance roles can insert attachments" ON public.attachments
  FOR INSERT WITH CHECK (public.is_finance_role());
CREATE POLICY "Owner can delete attachments" ON public.attachments
  FOR DELETE USING (public.is_owner());

-- ── inventory_movements ──
CREATE POLICY "Finance roles can view inventory movements" ON public.inventory_movements
  FOR SELECT USING (public.is_finance_role());
CREATE POLICY "System can insert inventory movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (public.is_active_user());

-- =============================================================================
-- TRANSACTIONAL RPC FUNCTIONS
-- =============================================================================

-- ── Function: Generate batch number safely ──
CREATE OR REPLACE FUNCTION public.generate_batch_number(prod_date DATE)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y TEXT;
  m TEXT;
  seq_num INTEGER;
  batch_num TEXT;
BEGIN
  y := TO_CHAR(prod_date, 'YYYY');
  m := TO_CHAR(prod_date, 'MM');
  
  SELECT COUNT(*) + 1 INTO seq_num
  FROM public.production_batches
  WHERE batch_number LIKE 'HB-' || y || '-' || m || '-%';
  
  batch_num := 'HB-' || y || '-' || m || '-' || LPAD(seq_num::TEXT, 3, '0');
  RETURN batch_num;
END;
$$;

-- ── RPC: save_purchase (atomic transaction) ──
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
  v_material_cost NUMERIC;
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
BEGIN
  -- Check permissions
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'Access denied: only owner or accountant can record purchases';
  END IF;

  -- Resolve supplier
  v_supplier_id := (p_data->>'supplier_id')::UUID;
  IF v_supplier_id IS NULL THEN
    -- Auto-create supplier if not found
    INSERT INTO public.suppliers(name, phone, city, created_by)
    VALUES(p_data->>'supplier_name', p_data->>'supplier_phone', 'Local', v_user_id)
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_supplier_id;

    IF v_supplier_id IS NULL THEN
      SELECT id INTO v_supplier_id FROM public.suppliers WHERE name = p_data->>'supplier_name' LIMIT 1;
    END IF;
  END IF;

  -- Resolve material
  v_material_id := (p_data->>'material_id')::UUID;
  IF v_material_id IS NULL THEN
    SELECT id INTO v_material_id FROM public.raw_materials WHERE name = p_data->>'material_name' LIMIT 1;
    IF v_material_id IS NULL THEN
      INSERT INTO public.raw_materials(name, base_unit) VALUES(p_data->>'material_name', 'ton')
      RETURNING id INTO v_material_id;
    END IF;
  END IF;

  -- Parse values
  v_unit := p_data->>'unit';
  v_quantity := (p_data->>'quantity')::NUMERIC;
  v_rate := (p_data->>'rate_per_unit')::NUMERIC;
  v_transport := COALESCE((p_data->>'transport')::NUMERIC, 0);
  v_loading := COALESCE((p_data->>'loading')::NUMERIC, 0);
  v_commission := COALESCE((p_data->>'commission')::NUMERIC, 0);
  v_other := COALESCE((p_data->>'other_charges')::NUMERIC, 0);
  v_gst_rate := COALESCE((p_data->>'gst_rate')::NUMERIC, 0);
  v_amount_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);

  -- kg conversion
  CASE v_unit
    WHEN 'ton' THEN v_kg_conversion := 1000;
    WHEN 'load' THEN v_kg_conversion := 5000;
    WHEN 'bale' THEN v_kg_conversion := 28;
    ELSE v_kg_conversion := 1;
  END CASE;
  v_quantity_kg := v_quantity * v_kg_conversion;

  -- Calculations
  v_material_cost := v_quantity * v_rate;
  v_subtotal := v_material_cost + v_transport + v_loading + v_commission + v_other;
  v_gst_amount := ROUND((v_subtotal * v_gst_rate / 100), 2);
  v_actual_cost := v_subtotal + v_gst_amount;
  v_balance_pending := GREATEST(0, v_actual_cost - v_amount_paid);

  -- Rate comparison
  SELECT rate_per_unit INTO v_last_rate
  FROM public.purchases
  WHERE material_name = p_data->>'material_name'
  ORDER BY purchase_date DESC LIMIT 1;

  IF v_last_rate IS NOT NULL THEN
    v_rate_diff := v_rate - v_last_rate;
    IF v_rate_diff > 0 THEN v_rate_vs_last := 'up';
    ELSIF v_rate_diff < 0 THEN v_rate_vs_last := 'down';
    END IF;
  END IF;

  -- Insert purchase
  INSERT INTO public.purchases(
    supplier_id, purchase_date, invoice_no, material_id, material_name,
    quantity, unit, kg_conversion, rate_per_unit,
    transport, loading, commission, other_charges,
    gst_rate, gst_amount, actual_cost, amount_paid, balance_pending,
    payment_due_date, notes, rate_vs_last, rate_difference, created_by
  ) VALUES(
    v_supplier_id,
    (p_data->>'purchase_date')::DATE,
    p_data->>'invoice_no',
    v_material_id,
    p_data->>'material_name',
    v_quantity, v_unit, v_kg_conversion, v_rate,
    v_transport, v_loading, v_commission, v_other,
    v_gst_rate, v_gst_amount, v_actual_cost, v_amount_paid, v_balance_pending,
    NULLIF(p_data->>'payment_due_date', '')::DATE,
    COALESCE(p_data->>'notes', ''),
    v_rate_vs_last, v_rate_diff,
    v_user_id
  ) RETURNING id INTO v_purchase_id;

  -- Record initial payment
  IF v_amount_paid > 0 THEN
    INSERT INTO public.purchase_payments(
      purchase_id, supplier_id, amount, payment_date, payment_mode, note, created_by
    ) VALUES(
      v_purchase_id, v_supplier_id, v_amount_paid,
      (p_data->>'purchase_date')::DATE,
      COALESCE(p_data->>'payment_mode', 'Cash'),
      'Initial payment at purchase',
      v_user_id
    );
  END IF;

  -- Update raw material stock
  UPDATE public.raw_materials
  SET stock_kg = stock_kg + v_quantity_kg, updated_at = now()
  WHERE id = v_material_id;

  -- Log inventory movement
  INSERT INTO public.inventory_movements(
    movement_type, reference_id, reference_type, material_id,
    quantity_kg, notes, created_by
  ) VALUES(
    'purchase_receipt', v_purchase_id, 'purchase', v_material_id,
    v_quantity_kg,
    'Purchase from ' || COALESCE(p_data->>'supplier_name', 'supplier'),
    v_user_id
  );

  RETURN jsonb_build_object('success', true, 'purchase_id', v_purchase_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ── RPC: delete_purchase ──
CREATE OR REPLACE FUNCTION public.delete_purchase(p_purchase_id UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase RECORD;
  v_qty_kg NUMERIC;
BEGIN
  -- Permission check
  IF NOT (public.is_owner() OR public.is_finance_role()) THEN
    RAISE EXCEPTION 'Access denied. Only Owner or Accountant can delete purchases.';
  END IF;

  SELECT * INTO v_purchase FROM public.purchases WHERE id = p_purchase_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found.';
  END IF;

  v_qty_kg := COALESCE(v_purchase.quantity_kg, v_purchase.quantity * v_purchase.kg_conversion);

  -- 1. Deduct raw material stock
  IF v_purchase.material_id IS NOT NULL AND v_qty_kg > 0 THEN
    UPDATE public.raw_materials
    SET stock_kg = GREATEST(0, stock_kg - v_qty_kg), updated_at = now()
    WHERE id = v_purchase.material_id;
  END IF;

  -- 2. Delete payments
  DELETE FROM public.purchase_payments WHERE purchase_id = p_purchase_id;

  -- 3. Delete inventory movements
  DELETE FROM public.inventory_movements WHERE reference_id = p_purchase_id;

  -- 4. Delete the purchase record
  DELETE FROM public.purchases WHERE id = p_purchase_id;

  RETURN jsonb_build_object('success', true, 'deleted_purchase_id', p_purchase_id, 'invoice_no', v_purchase.invoice_no);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ── RPC: save_production_batch (atomic transaction) ──
CREATE OR REPLACE FUNCTION public.save_production_batch(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_batch_id UUID;
  v_plot_id UUID;
  v_material_id UUID;
  v_batch_number TEXT;
  v_raw_kg NUMERIC;
  v_raw_cost NUMERIC;
  v_labour NUMERIC;
  v_wrapping NUMERIC;
  v_machinery NUMERIC;
  v_other NUMERIC;
  v_total_cost NUMERIC;
  v_finished_bales INTEGER;
  v_cost_per_bale NUMERIC;
  v_ferm_start DATE;
  v_ferm_days INTEGER;
  v_ready_date DATE;
  v_current_stock NUMERIC;
BEGIN
  -- Permission check
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant', 'staff') OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id = v_user_id AND is_active = true) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Get material
  SELECT id INTO v_material_id FROM public.raw_materials WHERE name = 'Hay (loose)' LIMIT 1;

  -- Parse values
  v_raw_kg := (p_data->>'raw_material_kg')::NUMERIC;
  v_raw_cost := COALESCE((p_data->>'raw_material_cost')::NUMERIC, 0);
  v_labour := COALESCE((p_data->>'labour_cost')::NUMERIC, 0);
  v_wrapping := COALESCE((p_data->>'wrapping_cost')::NUMERIC, 0);
  v_machinery := COALESCE((p_data->>'machinery_cost')::NUMERIC, 0);
  v_other := COALESCE((p_data->>'other_cost')::NUMERIC, 0);
  v_finished_bales := (p_data->>'finished_bales')::INTEGER;
  v_ferm_start := (p_data->>'fermentation_start')::DATE;

  SELECT fermentation_days INTO v_ferm_days FROM public.app_settings LIMIT 1;
  v_ferm_days := COALESCE(v_ferm_days, 30);
  v_ready_date := v_ferm_start + v_ferm_days;

  -- Check raw material stock
  SELECT stock_kg INTO v_current_stock FROM public.raw_materials WHERE id = v_material_id FOR UPDATE;
  IF v_current_stock < v_raw_kg THEN
    RAISE EXCEPTION 'Insufficient raw material stock. Available: % kg, Required: % kg', v_current_stock, v_raw_kg;
  END IF;

  -- Calculations
  v_total_cost := v_raw_cost + v_labour + v_wrapping + v_machinery + v_other;
  v_cost_per_bale := CASE WHEN v_finished_bales > 0 THEN v_total_cost / v_finished_bales ELSE 0 END;

  -- Generate batch number
  v_batch_number := COALESCE(
    NULLIF(p_data->>'batch_number', ''),
    public.generate_batch_number((p_data->>'production_date')::DATE)
  );

  -- Get plot
  v_plot_id := NULL;
  IF (p_data->>'plot_id') IS NOT NULL AND (p_data->>'plot_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_plot_id := (p_data->>'plot_id')::UUID;
  END IF;
  IF v_plot_id IS NULL AND (p_data->>'plot_name') IS NOT NULL THEN
    SELECT id INTO v_plot_id FROM public.plots WHERE UPPER(plot_name) = UPPER(p_data->>'plot_name') LIMIT 1;
  END IF;

  -- Ensure plot is not already occupied by an active batch
  IF v_plot_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.plot_inventory
      WHERE plot_id = v_plot_id AND status IN ('Fermenting', 'Ready') AND bales_remaining > 0
    ) OR EXISTS (
      SELECT 1 FROM public.production_batches
      WHERE (plot_id = v_plot_id OR UPPER(plot_name) = UPPER(p_data->>'plot_name'))
        AND status IN ('Fermenting', 'Ready')
    ) THEN
      RAISE EXCEPTION 'Plot % is already occupied by an active batch. A plot cannot be assigned multiple production batches.', COALESCE(p_data->>'plot_name', '');
    END IF;
  END IF;

  -- Insert batch
  INSERT INTO public.production_batches(
    batch_number, production_date, material_id,
    raw_material_kg, raw_material_cost, labour_cost, wrapping_cost,
    machinery_cost, other_cost, total_production_cost,
    finished_bales, cost_per_bale,
    plot_id, plot_name, fermentation_start, fermentation_days, ready_date,
    status, notes, created_by
  ) VALUES(
    v_batch_number,
    (p_data->>'production_date')::DATE,
    v_material_id,
    v_raw_kg, v_raw_cost, v_labour, v_wrapping,
    v_machinery, v_other, v_total_cost,
    v_finished_bales, v_cost_per_bale,
    v_plot_id, p_data->>'plot_name',
    v_ferm_start, v_ferm_days, v_ready_date,
    'Fermenting',
    COALESCE(p_data->>'notes', ''),
    v_user_id
  ) RETURNING id INTO v_batch_id;

  -- Deduct raw material stock
  UPDATE public.raw_materials
  SET stock_kg = stock_kg - v_raw_kg, updated_at = now()
  WHERE id = v_material_id;

  -- Update/insert plot_inventory
  IF v_plot_id IS NOT NULL THEN
    INSERT INTO public.plot_inventory(plot_id, batch_id, bales_original, bales_remaining, cost_per_bale, ferm_start, ready_date, status, updated_at)
    VALUES(v_plot_id, v_batch_id, v_finished_bales, v_finished_bales, v_cost_per_bale, v_ferm_start, v_ready_date, 'Fermenting', now())
    ON CONFLICT (plot_id) DO UPDATE SET
      batch_id = v_batch_id, bales_original = v_finished_bales,
      bales_remaining = v_finished_bales, cost_per_bale = v_cost_per_bale,
      ferm_start = v_ferm_start, ready_date = v_ready_date,
      status = 'Fermenting', updated_at = now();
  END IF;

  -- Log inventory movements
  INSERT INTO public.inventory_movements(movement_type, reference_id, reference_type, material_id, quantity_kg, batch_id, notes, created_by)
  VALUES('raw_material_consumption', v_batch_id, 'batch', v_material_id, v_raw_kg, v_batch_id, 'Consumed for batch ' || v_batch_number, v_user_id);

  INSERT INTO public.inventory_movements(movement_type, reference_id, reference_type, bales_delta, plot_id, batch_id, notes, created_by)
  VALUES('production_output', v_batch_id, 'batch', v_finished_bales, v_plot_id, v_batch_id, 'Produced ' || v_finished_bales || ' bales in ' || COALESCE(p_data->>'plot_name', ''), v_user_id);

  RETURN jsonb_build_object('success', true, 'batch_id', v_batch_id, 'batch_number', v_batch_number);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ── RPC: delete_production_batch ──
CREATE OR REPLACE FUNCTION public.delete_production_batch(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_batch RECORD;
  v_sale_count INTEGER;
BEGIN
  -- Permission check
  IF NOT (public.is_owner() OR public.is_finance_role()) THEN
    RAISE EXCEPTION 'Access denied. Only Owner can delete production batches.';
  END IF;

  SELECT * INTO v_batch FROM public.production_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found.';
  END IF;

  -- Ensure batch was not sold
  SELECT COUNT(*) INTO v_sale_count FROM public.sale_line_items WHERE batch_id = p_batch_id;
  IF v_sale_count > 0 THEN
    RAISE EXCEPTION 'Cannot delete batch % because it has already been invoiced in sales.', v_batch.batch_number;
  END IF;

  -- 1. Restore consumed raw material stock
  IF v_batch.material_id IS NOT NULL AND v_batch.raw_material_kg > 0 THEN
    UPDATE public.raw_materials
    SET stock_kg = stock_kg + v_batch.raw_material_kg, updated_at = now()
    WHERE id = v_batch.material_id;
  END IF;

  -- 2. Release plot_inventory
  UPDATE public.plot_inventory
  SET batch_id = NULL,
      bales_original = 0,
      bales_remaining = 0,
      cost_per_bale = 0,
      ferm_start = NULL,
      ready_date = NULL,
      status = 'Empty',
      updated_at = now()
  WHERE batch_id = p_batch_id
     OR (plot_id = v_batch.plot_id AND status IN ('Fermenting', 'Ready'));

  -- 3. Clear references
  UPDATE public.expenses SET related_batch_id = NULL WHERE related_batch_id = p_batch_id;
  DELETE FROM public.inventory_movements WHERE batch_id = p_batch_id;

  -- 4. Delete the batch
  DELETE FROM public.production_batches WHERE id = p_batch_id;

  RETURN jsonb_build_object('success', true, 'deleted_batch_id', p_batch_id, 'batch_number', v_batch.batch_number);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ── RPC: mark_plot_fermented ──
CREATE OR REPLACE FUNCTION public.mark_plot_fermented(p_plot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
BEGIN
  UPDATE public.plot_inventory
  SET status = 'Ready',
      ready_date = CURRENT_DATE,
      updated_at = now()
  WHERE plot_id = p_plot_id
  RETURNING batch_id INTO v_batch_id;

  IF v_batch_id IS NOT NULL THEN
    UPDATE public.production_batches
    SET status = 'Ready',
        ready_date = CURRENT_DATE,
        updated_at = now()
    WHERE id = v_batch_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'plot_id', p_plot_id, 'batch_id', v_batch_id);
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$$;

-- ── RPC: save_sale (atomic transaction) ──
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
  v_credit_limit NUMERIC;
  v_current_pending NUMERIC;
BEGIN
  -- Permission
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'Access denied: only owner or accountant can create sales';
  END IF;

  -- Customer
  v_customer_id := (p_data->>'customer_id')::UUID;
  SELECT credit_limit INTO v_credit_limit FROM public.customers WHERE id = v_customer_id;

  -- Check credit limit
  SELECT COALESCE(SUM(balance_pending), 0) INTO v_current_pending
  FROM public.sales WHERE customer_id = v_customer_id;

  v_gst_rate := COALESCE((p_data->>'gst_rate')::NUMERIC, 0);
  v_amount_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);

  -- Generate invoice number
  SELECT COUNT(*) INTO v_invoice_count FROM public.sales;
  v_invoice_num := 'INV-' || LPAD((v_invoice_count + 1)::TEXT, 4, '0');

  -- Process line items (lock plots for update)
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'line_items')
  LOOP
    v_plot_id := (v_line->>'plot_id')::UUID;
    v_bales_sold := (v_line->>'bales_sold')::INTEGER;
    v_rate := (v_line->>'rate_per_bale')::NUMERIC;

    -- Lock and check availability
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

    -- Deduct plot stock
    UPDATE public.plot_inventory
    SET bales_remaining = bales_remaining - v_bales_sold,
        status = CASE WHEN bales_remaining - v_bales_sold <= 0 THEN 'Empty' ELSE status END,
        updated_at = now()
    WHERE plot_id = v_plot_id;
  END LOOP;

  v_gst_amount := ROUND((v_subtotal * v_gst_rate / 100), 2);
  v_invoice_total := v_subtotal + v_gst_amount;
  v_balance_pending := GREATEST(0, v_invoice_total - v_amount_paid);

  -- Credit check warning (not blocking, just stored in notes)
  -- Insert sale
  INSERT INTO public.sales(
    invoice_number, customer_id, invoice_date, due_date,
    subtotal, gst_rate, gst_amount, invoice_total, cogs_total,
    amount_paid, balance_pending, status, notes, created_by
  ) VALUES(
    v_invoice_num, v_customer_id,
    (p_data->>'invoice_date')::DATE,
    NULLIF(p_data->>'due_date', '')::DATE,
    v_subtotal, v_gst_rate, v_gst_amount, v_invoice_total, v_cogs_total,
    v_amount_paid, v_balance_pending,
    CASE WHEN v_balance_pending = 0 THEN 'Paid'
         WHEN v_amount_paid > 0 THEN 'Partially Paid'
         ELSE 'Pending' END,
    COALESCE(p_data->>'notes', ''),
    v_user_id
  ) RETURNING id INTO v_sale_id;

  -- Insert line items + log movements
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'line_items')
  LOOP
    v_plot_id := (v_line->>'plot_id')::UUID;
    v_bales_sold := (v_line->>'bales_sold')::INTEGER;
    v_rate := (v_line->>'rate_per_bale')::NUMERIC;

    SELECT pi.cost_per_bale, pi.batch_id INTO v_cost_per_bale, v_batch_id
    FROM public.plot_inventory pi WHERE pi.plot_id = v_plot_id;

    SELECT pb.batch_number INTO v_line FROM public.production_batches pb WHERE pb.id = v_batch_id;

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

  -- Initial payment
  IF v_amount_paid > 0 THEN
    INSERT INTO public.sale_payments(
      sale_id, customer_id, amount, payment_date, payment_mode, note, balance_after, created_by
    ) VALUES(
      v_sale_id, v_customer_id, v_amount_paid,
      (p_data->>'invoice_date')::DATE,
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

-- ── RPC: add_sale_payment (atomic transaction) ──
CREATE OR REPLACE FUNCTION public.add_sale_payment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_sale_id UUID;
  v_customer_id UUID;
  v_amount NUMERIC;
  v_current_pending NUMERIC;
  v_new_pending NUMERIC;
  v_payment_id UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_sale_id := (p_data->>'sale_id')::UUID;
  v_amount := (p_data->>'amount')::NUMERIC;

  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero';
  END IF;

  SELECT balance_pending, customer_id INTO v_current_pending, v_customer_id
  FROM public.sales WHERE id = v_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale not found';
  END IF;

  IF v_amount > v_current_pending THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds outstanding balance (%)', v_amount, v_current_pending;
  END IF;

  v_new_pending := v_current_pending - v_amount;

  UPDATE public.sales
  SET amount_paid = amount_paid + v_amount,
      balance_pending = v_new_pending,
      status = CASE WHEN v_new_pending = 0 THEN 'Paid' ELSE 'Partially Paid' END,
      updated_at = now()
  WHERE id = v_sale_id;

  INSERT INTO public.sale_payments(
    sale_id, customer_id, amount, payment_date, payment_mode, reference_no, note, balance_after, created_by
  ) VALUES(
    v_sale_id, v_customer_id, v_amount,
    (p_data->>'payment_date')::DATE,
    COALESCE(p_data->>'payment_mode', 'Cash'),
    COALESCE(p_data->>'reference_no', ''),
    COALESCE(p_data->>'note', ''),
    v_new_pending,
    v_user_id
  ) RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'new_balance', v_new_pending);
END;
$$;

-- ── RPC: add_purchase_payment ──
CREATE OR REPLACE FUNCTION public.add_purchase_payment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_role TEXT;
  v_purchase_id UUID;
  v_supplier_id UUID;
  v_amount NUMERIC;
  v_current_pending NUMERIC;
  v_new_pending NUMERIC;
  v_payment_id UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
  IF v_role NOT IN ('owner', 'accountant') THEN RAISE EXCEPTION 'Access denied'; END IF;

  v_purchase_id := (p_data->>'purchase_id')::UUID;
  v_amount := (p_data->>'amount')::NUMERIC;

  SELECT balance_pending, supplier_id INTO v_current_pending, v_supplier_id
  FROM public.purchases WHERE id = v_purchase_id FOR UPDATE;

  IF v_amount > v_current_pending THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance of %', v_current_pending;
  END IF;

  v_new_pending := v_current_pending - v_amount;

  UPDATE public.purchases
  SET amount_paid = amount_paid + v_amount, balance_pending = v_new_pending, updated_at = now()
  WHERE id = v_purchase_id;

  INSERT INTO public.purchase_payments(purchase_id, supplier_id, amount, payment_date, payment_mode, reference_no, note, created_by)
  VALUES(v_purchase_id, v_supplier_id, v_amount, (p_data->>'payment_date')::DATE,
    COALESCE(p_data->>'payment_mode', 'Cash'),
    COALESCE(p_data->>'reference_no', ''),
    COALESCE(p_data->>'note', ''),
    v_user_id) RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('success', true, 'payment_id', v_payment_id, 'new_balance', v_new_pending);
END;
$$;

-- ── RPC: get_dashboard_metrics ──
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_month TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month TEXT := COALESCE(p_month, TO_CHAR(CURRENT_DATE, 'YYYY-MM'));
  v_today DATE := CURRENT_DATE;
  v_ferm_days INTEGER;
  v_ready_bales INTEGER := 0;
  v_fermenting_bales INTEGER := 0;
  v_customer_dues NUMERIC := 0;
  v_supplier_dues NUMERIC := 0;
  v_month_sales NUMERIC := 0;
  v_month_cogs NUMERIC := 0;
  v_month_expenses NUMERIC := 0;
  v_gross_profit NUMERIC := 0;
  v_net_profit NUMERIC := 0;
  v_raw_stock NUMERIC := 0;
  v_month_sold_bales INTEGER := 0;
BEGIN
  SELECT fermentation_days INTO v_ferm_days FROM public.app_settings LIMIT 1;
  v_ferm_days := COALESCE(v_ferm_days, 30);

  -- Auto-update plot status based on fermentation
  UPDATE public.plot_inventory
  SET status = 'Ready', updated_at = now()
  WHERE status = 'Fermenting' AND ferm_start IS NOT NULL
    AND (ferm_start + v_ferm_days) <= v_today;

  -- Update batch status
  UPDATE public.production_batches
  SET status = 'Ready', updated_at = now()
  WHERE status = 'Fermenting'
    AND (fermentation_start + fermentation_days) <= v_today;

  SELECT COALESCE(SUM(bales_remaining), 0) INTO v_ready_bales FROM public.plot_inventory WHERE status = 'Ready';
  SELECT COALESCE(SUM(bales_remaining), 0) INTO v_fermenting_bales FROM public.plot_inventory WHERE status = 'Fermenting';
  SELECT COALESCE(SUM(balance_pending), 0) INTO v_customer_dues FROM public.sales;
  SELECT COALESCE(SUM(balance_pending), 0) INTO v_supplier_dues FROM public.purchases;
  SELECT COALESCE(SUM(invoice_total), 0) INTO v_month_sales FROM public.sales WHERE TO_CHAR(invoice_date, 'YYYY-MM') = v_month;
  SELECT COALESCE(SUM(cogs_total), 0) INTO v_month_cogs FROM public.sales WHERE TO_CHAR(invoice_date, 'YYYY-MM') = v_month;
  SELECT COALESCE(SUM(amount), 0) INTO v_month_expenses FROM public.expenses WHERE TO_CHAR(expense_date, 'YYYY-MM') = v_month;
  SELECT COALESCE(SUM(bales_sold), 0) INTO v_month_sold_bales
  FROM public.sale_line_items sli JOIN public.sales s ON s.id = sli.sale_id WHERE TO_CHAR(s.invoice_date, 'YYYY-MM') = v_month;
  SELECT COALESCE(stock_kg, 0) INTO v_raw_stock FROM public.raw_materials ORDER BY created_at LIMIT 1;

  v_gross_profit := v_month_sales - v_month_cogs;
  v_net_profit := v_gross_profit - v_month_expenses;

  RETURN jsonb_build_object(
    'ready_bales', v_ready_bales,
    'fermenting_bales', v_fermenting_bales,
    'customer_dues', v_customer_dues,
    'supplier_dues', v_supplier_dues,
    'month_sales', v_month_sales,
    'month_cogs', v_month_cogs,
    'month_expenses', v_month_expenses,
    'gross_profit', v_gross_profit,
    'net_profit', v_net_profit,
    'raw_material_kg', v_raw_stock,
    'month_sold_bales', v_month_sold_bales,
    'ferm_days', v_ferm_days
  );
END;
$$;

-- ── Trigger: auto-update updated_at ──
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_batches_updated_at BEFORE UPDATE ON public.production_batches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sales_updated_at BEFORE UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plots_updated_at BEFORE UPDATE ON public.plots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Trigger: auto-create profile on new user ──
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, role)
  VALUES(NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.raw_user_meta_data->>'role', 'staff'))
  ON CONFLICT(id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- STORAGE BUCKET
-- =============================================================================
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES('bms-attachments', 'bms-attachments', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS
CREATE POLICY "Finance roles can upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'bms-attachments' AND public.is_finance_role());

CREATE POLICY "Finance roles can view attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'bms-attachments' AND public.is_finance_role());

CREATE POLICY "Owner can delete attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'bms-attachments' AND public.is_owner());

-- =============================================================================
-- SEED: Default Plots (A1-A20, B1-B10, C1-C2, D1)
-- =============================================================================
INSERT INTO public.plots(plot_name, section) VALUES
  ('A1','A'),('A2','A'),('A3','A'),('A4','A'),('A5','A'),
  ('A6','A'),('A7','A'),('A8','A'),('A9','A'),('A10','A'),
  ('A11','A'),('A12','A'),('A13','A'),('A14','A'),('A15','A'),
  ('A16','A'),('A17','A'),('A18','A'),('A19','A'),('A20','A'),
  ('B1','B'),('B2','B'),('B3','B'),('B4','B'),('B5','B'),
  ('B6','B'),('B7','B'),('B8','B'),('B9','B'),('B10','B'),
  ('C1','C'),('C2','C'),('D1','D')
ON CONFLICT (plot_name) DO NOTHING;

-- Initialize plot_inventory rows for all plots (Empty)
INSERT INTO public.plot_inventory(plot_id, bales_original, bales_remaining, cost_per_bale, status)
SELECT id, 0, 0, 0, 'Empty' FROM public.plots
ON CONFLICT (plot_id) DO NOTHING;

-- Sync plot_inventory with existing active production batches
UPDATE public.plot_inventory pi
SET 
  batch_id = pb.id,
  bales_original = pb.finished_bales,
  bales_remaining = pb.finished_bales,
  cost_per_bale = pb.cost_per_bale,
  ferm_start = pb.fermentation_start,
  ready_date = pb.ready_date,
  status = pb.status,
  updated_at = now()
FROM public.production_batches pb
WHERE (pi.plot_id = pb.plot_id OR pi.plot_id = (SELECT id FROM public.plots WHERE UPPER(plot_name) = UPPER(pb.plot_name) LIMIT 1))
  AND pb.status IN ('Fermenting', 'Ready')
  AND (pi.status = 'Empty' OR pi.bales_remaining = 0);

-- =============================================================================
-- GRANT execute on RPCs to authenticated users
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.save_purchase(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_purchase(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_production_batch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_production_batch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_sale(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_sale_payment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_purchase_payment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_batch_number(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated;
