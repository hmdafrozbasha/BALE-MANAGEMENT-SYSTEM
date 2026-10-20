-- =============================================================================
-- BALE MANAGEMENT SYSTEM — Migration 003: Goat Farming & Trading Module
-- Comprehensive, strictly independent schema for goat herd, sales, purchases,
-- health, expenses, payments, and financial accounting.
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

SET search_path = public, extensions, pg_catalog;

-- ─────────────────────────────────────────────────────────────────
-- HELPER FUNCTIONS FOR ROLE-BASED ACCESS & AUTHENTICATION
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.is_authenticated() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner' AND is_active = true);
$$;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_finance_role()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('owner', 'accountant') AND is_active = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_finance_role() TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true);
$$;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, anon;

-- ─────────────────────────────────────────────────────────────────
-- SEQUENCES FOR CONCURRENCY-SAFE DOCUMENT IDENTIFIERS
-- ─────────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.goat_purchase_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.goat_sale_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.goat_expense_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.goat_group_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.goat_tag_seq START 101;

-- Reference generator functions
CREATE OR REPLACE FUNCTION public.generate_goat_purchase_ref(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.goat_purchase_seq');
  RETURN 'GOAT-PUR-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_goat_purchase_ref(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_goat_sale_invoice_no(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.goat_sale_seq');
  RETURN 'GOAT-SAL-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_goat_sale_invoice_no(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_goat_expense_ref(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.goat_expense_seq');
  RETURN 'GOAT-EXP-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_goat_expense_ref(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_goat_group_code(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_year TEXT;
  v_seq BIGINT;
BEGIN
  v_year := TO_CHAR(COALESCE(p_date, CURRENT_DATE), 'YYYY');
  v_seq := nextval('public.goat_group_seq');
  RETURN 'GRP-' || v_year || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_goat_group_code(DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_goat_tag_id()
RETURNS TEXT LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq BIGINT;
BEGIN
  v_seq := nextval('public.goat_tag_seq');
  RETURN 'GT-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION public.generate_goat_tag_id() TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_suppliers
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_suppliers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  city            TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_suppliers_name ON public.goat_suppliers(name);
CREATE INDEX IF NOT EXISTS idx_goat_suppliers_active ON public.goat_suppliers(is_active);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_customers
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  address         TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_customers_name ON public.goat_customers(name);
CREATE INDEX IF NOT EXISTS idx_goat_customers_active ON public.goat_customers(is_active);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_purchases
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_purchases (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_ref            TEXT NOT NULL UNIQUE,
  purchase_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id             UUID NOT NULL REFERENCES public.goat_suppliers(id),
  purchase_method         TEXT NOT NULL CHECK (purchase_method IN ('individual', 'group')),
  quantity                INTEGER NOT NULL CHECK (quantity > 0),
  price_per_goat          NUMERIC(14,2) DEFAULT 0 CHECK (price_per_goat >= 0),
  base_amount             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  initial_total_weight    NUMERIC(10,2) DEFAULT 0 CHECK (initial_total_weight >= 0),
  transport_expense       NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transport_expense >= 0),
  other_initial_costs     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (other_initial_costs >= 0),
  total_acquisition_cost  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_acquisition_cost >= 0),
  allocated_cost_per_goat NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated_cost_per_goat >= 0),
  amount_paid             NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_pending         NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_due_date        DATE,
  notes                   TEXT DEFAULT '',
  attachment_url          TEXT DEFAULT '',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_purchases ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_purchases_date ON public.goat_purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_goat_purchases_supplier ON public.goat_purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goat_purchases_ref ON public.goat_purchases(purchase_ref);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_groups (Batches)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_groups (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code              TEXT NOT NULL UNIQUE,
  group_name              TEXT NOT NULL,
  purchase_id             UUID REFERENCES public.goat_purchases(id) ON DELETE SET NULL,
  supplier_id             UUID REFERENCES public.goat_suppliers(id),
  purchase_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  initial_quantity        INTEGER NOT NULL CHECK (initial_quantity > 0),
  current_quantity        INTEGER NOT NULL CHECK (current_quantity >= 0),
  total_cost_basis        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost_basis >= 0),
  unit_cost_basis         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost_basis >= 0),
  initial_total_weight    NUMERIC(10,2) DEFAULT 0,
  current_total_weight    NUMERIC(10,2) DEFAULT 0,
  breed                   TEXT DEFAULT 'Mixed/Local',
  status                  TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Available for Sale', 'Partially Sold', 'Sold Out', 'Archived')),
  notes                   TEXT DEFAULT '',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_groups ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_groups_status ON public.goat_groups(status);
CREATE INDEX IF NOT EXISTS idx_goat_groups_code ON public.goat_groups(group_code);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goats (Individually Tracked Goats)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goats (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id                  TEXT NOT NULL UNIQUE,
  name                    TEXT DEFAULT '',
  group_id                UUID REFERENCES public.goat_groups(id) ON DELETE SET NULL,
  purchase_id             UUID REFERENCES public.goat_purchases(id) ON DELETE SET NULL,
  supplier_id             UUID REFERENCES public.goat_suppliers(id),
  purchase_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  breed                   TEXT NOT NULL DEFAULT 'Boer',
  sex                     TEXT NOT NULL DEFAULT 'Male' CHECK (sex IN ('Male', 'Female', 'Castrated')),
  dob                     DATE,
  age_months              NUMERIC(4,1) DEFAULT 0,
  initial_weight          NUMERIC(6,2) DEFAULT 0,
  latest_weight           NUMERIC(6,2) DEFAULT 0,
  last_weight_date        DATE,
  acquisition_cost        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (acquisition_cost >= 0),
  allocated_costs         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (allocated_costs >= 0),
  total_cost_basis        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cost_basis >= 0),
  status                  TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Available for Sale', 'Sold', 'Deceased')),
  health_status           TEXT NOT NULL DEFAULT 'Healthy' CHECK (health_status IN ('Healthy', 'Under Treatment', 'Vaccinated', 'Quarantined', 'Sick', 'Deceased')),
  deceased_date           DATE,
  deceased_reason         TEXT,
  notes                   TEXT DEFAULT '',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goats ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goats_tag ON public.goats(tag_id);
CREATE INDEX IF NOT EXISTS idx_goats_status ON public.goats(status);
CREATE INDEX IF NOT EXISTS idx_goats_group ON public.goats(group_id);
CREATE INDEX IF NOT EXISTS idx_goats_purchase ON public.goats(purchase_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_weight_records
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_weight_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goat_id         UUID REFERENCES public.goats(id) ON DELETE CASCADE,
  group_id        UUID REFERENCES public.goat_groups(id) ON DELETE CASCADE,
  record_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg       NUMERIC(6,2) NOT NULL CHECK (weight_kg > 0),
  weight_gain     NUMERIC(6,2) DEFAULT 0,
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_weight_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_weights_goat ON public.goat_weight_records(goat_id);
CREATE INDEX IF NOT EXISTS idx_goat_weights_group ON public.goat_weight_records(group_id);
CREATE INDEX IF NOT EXISTS idx_goat_weights_date ON public.goat_weight_records(record_date);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_health_records
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_health_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goat_id             UUID REFERENCES public.goats(id) ON DELETE CASCADE,
  group_id            UUID REFERENCES public.goat_groups(id) ON DELETE CASCADE,
  record_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  record_type         TEXT NOT NULL CHECK (record_type IN ('Vaccination', 'Treatment', 'Vet Visit', 'Deworming', 'General Checkup', 'Note')),
  title_or_vaccine    TEXT NOT NULL,
  dosage              TEXT DEFAULT '',
  administered_by     TEXT DEFAULT '',
  next_scheduled_date DATE,
  cost                NUMERIC(14,2) DEFAULT 0 CHECK (cost >= 0),
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_health_records ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_health_goat ON public.goat_health_records(goat_id);
CREATE INDEX IF NOT EXISTS idx_goat_health_group ON public.goat_health_records(group_id);
CREATE INDEX IF NOT EXISTS idx_goat_health_next ON public.goat_health_records(next_scheduled_date);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_sales
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_sales (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no          TEXT NOT NULL UNIQUE,
  sale_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_id         UUID NOT NULL REFERENCES public.goat_customers(id),
  pricing_method      TEXT NOT NULL CHECK (pricing_method IN ('per_goat', 'by_weight')),
  total_quantity      INTEGER NOT NULL CHECK (total_quantity > 0),
  total_weight_kg     NUMERIC(10,2) DEFAULT 0 CHECK (total_weight_kg >= 0),
  subtotal            NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount            NUMERIC(14,2) DEFAULT 0 CHECK (discount >= 0),
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid         NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance_pending     NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cogs          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_cogs >= 0),
  gross_profit        NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_due_date    DATE,
  notes               TEXT DEFAULT '',
  attachment_url      TEXT DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_sales ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_sales_date ON public.goat_sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_goat_sales_customer ON public.goat_sales(customer_id);
CREATE INDEX IF NOT EXISTS idx_goat_sales_invoice ON public.goat_sales(invoice_no);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_sale_items
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_sale_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES public.goat_sales(id) ON DELETE CASCADE,
  item_type       TEXT NOT NULL CHECK (item_type IN ('individual', 'group')),
  goat_id         UUID REFERENCES public.goats(id) ON DELETE SET NULL,
  group_id        UUID REFERENCES public.goat_groups(id) ON DELETE SET NULL,
  quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  weight_kg       NUMERIC(8,2) DEFAULT 0,
  rate            NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
  cost_basis      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.goat_sale_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_sale_items_sale ON public.goat_sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_goat_sale_items_goat ON public.goat_sale_items(goat_id);
CREATE INDEX IF NOT EXISTS idx_goat_sale_items_group ON public.goat_sale_items(group_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_expenses
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_expenses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_ref         TEXT NOT NULL UNIQUE,
  expense_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  category            TEXT NOT NULL CHECK (category IN (
    'Feed',
    'Medicines & Veterinary',
    'Transport',
    'Labour',
    'Other Expenses',
    'Shelter & Equipment',
    'Breeding Expenses'
  )),
  amount              NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_to             TEXT NOT NULL,
  payment_mode        TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_mode IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Credit')),
  description         TEXT DEFAULT '',
  related_goat_id     UUID REFERENCES public.goats(id) ON DELETE SET NULL,
  related_group_id    UUID REFERENCES public.goat_groups(id) ON DELETE SET NULL,
  attachment_url      TEXT DEFAULT '',
  notes               TEXT DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_expenses ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_expenses_date ON public.goat_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_goat_expenses_cat ON public.goat_expenses(category);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_supplier_payments
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_supplier_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id     UUID NOT NULL REFERENCES public.goat_purchases(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL DEFAULT 'Cash',
  reference_no    TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_supp_payments_pur ON public.goat_supplier_payments(purchase_id);

-- ─────────────────────────────────────────────────────────────────
-- TABLE: goat_customer_payments
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goat_customer_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID NOT NULL REFERENCES public.goat_sales(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method  TEXT NOT NULL DEFAULT 'Cash',
  reference_no    TEXT DEFAULT '',
  notes           TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES public.profiles(id)
);
ALTER TABLE public.goat_customer_payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_goat_cust_payments_sale ON public.goat_customer_payments(sale_id);

-- ─────────────────────────────────────────────────────────────────
-- RLS POLICIES FOR GOAT TABLES
-- ─────────────────────────────────────────────────────────────────
-- Profiles role checks:
-- Owner / Accountant: Full view & manage
-- Staff: Stock/herd inventory view only; no finance / payments / sales prices

CREATE POLICY "Authorized users can view goat suppliers" ON public.goat_suppliers
  FOR SELECT USING (public.is_authenticated());

CREATE POLICY "Finance users can manage goat suppliers" ON public.goat_suppliers
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Authorized users can view goat customers" ON public.goat_customers
  FOR SELECT USING (public.is_authenticated());

CREATE POLICY "Finance users can manage goat customers" ON public.goat_customers
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Finance users can view goat purchases" ON public.goat_purchases
  FOR SELECT USING (public.is_finance_role());

CREATE POLICY "Finance users can manage goat purchases" ON public.goat_purchases
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Authorized users can view goat groups" ON public.goat_groups
  FOR SELECT USING (public.is_authenticated());

CREATE POLICY "Finance users can manage goat groups" ON public.goat_groups
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Authorized users can view goats" ON public.goats
  FOR SELECT USING (public.is_authenticated());

CREATE POLICY "Authorized users can manage goats" ON public.goats
  FOR ALL USING (public.is_authenticated()) WITH CHECK (public.is_authenticated());

CREATE POLICY "Authorized users can view goat weight records" ON public.goat_weight_records
  FOR SELECT USING (public.is_authenticated());

CREATE POLICY "Authorized users can manage goat weight records" ON public.goat_weight_records
  FOR ALL USING (public.is_authenticated()) WITH CHECK (public.is_authenticated());

CREATE POLICY "Authorized users can view goat health records" ON public.goat_health_records
  FOR SELECT USING (public.is_authenticated());

CREATE POLICY "Authorized users can manage goat health records" ON public.goat_health_records
  FOR ALL USING (public.is_authenticated()) WITH CHECK (public.is_authenticated());

CREATE POLICY "Finance users can view goat sales" ON public.goat_sales
  FOR SELECT USING (public.is_finance_role());

CREATE POLICY "Finance users can manage goat sales" ON public.goat_sales
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Finance users can view goat sale items" ON public.goat_sale_items
  FOR SELECT USING (public.is_finance_role());

CREATE POLICY "Finance users can manage goat sale items" ON public.goat_sale_items
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Finance users can view goat expenses" ON public.goat_expenses
  FOR SELECT USING (public.is_finance_role());

CREATE POLICY "Finance users can manage goat expenses" ON public.goat_expenses
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Finance users can view goat supplier payments" ON public.goat_supplier_payments
  FOR SELECT USING (public.is_finance_role());

CREATE POLICY "Finance users can manage goat supplier payments" ON public.goat_supplier_payments
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

CREATE POLICY "Finance users can view goat customer payments" ON public.goat_customer_payments
  FOR SELECT USING (public.is_finance_role());

CREATE POLICY "Finance users can manage goat customer payments" ON public.goat_customer_payments
  FOR ALL USING (public.is_finance_role()) WITH CHECK (public.is_finance_role());

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: save_goat_purchase
-- Handles supplier, purchase, group or individual registration atomically
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_goat_purchase(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_supplier_id UUID;
  v_purchase_id UUID;
  v_group_id UUID;
  v_purchase_ref TEXT;
  v_purchase_date DATE;
  v_method TEXT;
  v_qty INT;
  v_price_per_goat NUMERIC(14,2);
  v_base_amount NUMERIC(14,2);
  v_weight NUMERIC(10,2);
  v_transport NUMERIC(14,2);
  v_other NUMERIC(14,2);
  v_total_cost NUMERIC(14,2);
  v_allocated_per_goat NUMERIC(14,2);
  v_paid NUMERIC(14,2);
  v_balance NUMERIC(14,2);
  v_due_date DATE;
  v_notes TEXT;
  v_attachment TEXT;
  v_group_code TEXT;
  v_group_name TEXT;
  v_breed TEXT;
  v_goats_arr JSONB;
  v_goat_elem JSONB;
  v_tag_id TEXT;
  v_goat_weight NUMERIC(6,2);
  v_goat_breed TEXT;
  v_goat_sex TEXT;
  v_goat_cost NUMERIC(14,2);
BEGIN
  -- Supplier resolution
  BEGIN
    v_supplier_id := NULLIF(p_data->>'supplier_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_supplier_id := NULL;
  END;
  IF v_supplier_id IS NULL THEN
    INSERT INTO public.goat_suppliers(name, phone, city, created_by)
    VALUES (COALESCE(p_data->>'supplier_name', 'General Livestock Supplier'), COALESCE(p_data->>'supplier_phone', ''), COALESCE(p_data->>'supplier_city', 'Local'), v_user_id)
    RETURNING id INTO v_supplier_id;
  END IF;

  v_purchase_date := COALESCE(NULLIF(p_data->>'purchase_date', '')::DATE, CURRENT_DATE);
  v_purchase_ref := NULLIF(trim(COALESCE(p_data->>'purchase_ref', '')), '');
  IF v_purchase_ref IS NULL THEN
    v_purchase_ref := public.generate_goat_purchase_ref(v_purchase_date);
  END IF;

  v_method := COALESCE(p_data->>'purchase_method', 'group');
  v_qty := GREATEST(1, COALESCE((p_data->>'quantity')::INT, 1));
  v_price_per_goat := COALESCE((p_data->>'price_per_goat')::NUMERIC, 0);
  v_base_amount := COALESCE((p_data->>'base_amount')::NUMERIC, (v_qty * v_price_per_goat));
  v_weight := COALESCE((p_data->>'initial_total_weight')::NUMERIC, 0);
  v_transport := COALESCE((p_data->>'transport_expense')::NUMERIC, 0);
  v_other := COALESCE((p_data->>'other_initial_costs')::NUMERIC, 0);
  v_total_cost := v_base_amount + v_transport + v_other;
  v_allocated_per_goat := ROUND(v_total_cost / v_qty, 2);
  v_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);
  v_balance := v_total_cost - v_paid;
  v_due_date := NULLIF(p_data->>'payment_due_date', '')::DATE;
  v_notes := COALESCE(p_data->>'notes', '');
  v_attachment := COALESCE(p_data->>'attachment_url', '');

  -- Insert purchase record
  INSERT INTO public.goat_purchases (
    purchase_ref, purchase_date, supplier_id, purchase_method,
    quantity, price_per_goat, base_amount, initial_total_weight,
    transport_expense, other_initial_costs, total_acquisition_cost,
    allocated_cost_per_goat, amount_paid, balance_pending,
    payment_due_date, notes, attachment_url, created_by
  ) VALUES (
    v_purchase_ref, v_purchase_date, v_supplier_id, v_method,
    v_qty, v_price_per_goat, v_base_amount, v_weight,
    v_transport, v_other, v_total_cost,
    v_allocated_per_goat, v_paid, v_balance,
    v_due_date, v_notes, v_attachment, v_user_id
  ) RETURNING id INTO v_purchase_id;

  -- Initial payment record if paid > 0
  IF v_paid > 0 THEN
    INSERT INTO public.goat_supplier_payments (
      purchase_id, payment_date, amount, payment_method, reference_no, notes, created_by
    ) VALUES (
      v_purchase_id, v_purchase_date, v_paid, COALESCE(p_data->>'payment_mode', 'Cash'), 'Initial on Purchase', 'Down payment', v_user_id
    );
  END IF;

  -- Create inventory records
  IF v_method = 'group' THEN
    v_group_code := NULLIF(trim(COALESCE(p_data->>'group_code', '')), '');
    IF v_group_code IS NULL THEN
      v_group_code := public.generate_goat_group_code(v_purchase_date);
    END IF;
    v_group_name := COALESCE(NULLIF(p_data->>'group_name', ''), 'Batch ' || v_group_code);
    v_breed := COALESCE(NULLIF(p_data->>'breed', ''), 'Mixed/Local');

    INSERT INTO public.goat_groups (
      group_code, group_name, purchase_id, supplier_id, purchase_date,
      initial_quantity, current_quantity, total_cost_basis, unit_cost_basis,
      initial_total_weight, current_total_weight, breed, status, notes, created_by
    ) VALUES (
      v_group_code, v_group_name, v_purchase_id, v_supplier_id, v_purchase_date,
      v_qty, v_qty, v_total_cost, v_allocated_per_goat,
      v_weight, v_weight, v_breed, 'Active', v_notes, v_user_id
    ) RETURNING id INTO v_group_id;

  ELSE
    -- Individual registration
    v_goats_arr := p_data->'goats';
    IF v_goats_arr IS NOT NULL AND jsonb_array_length(v_goats_arr) > 0 THEN
      FOR i IN 0..(jsonb_array_length(v_goats_arr) - 1) LOOP
        v_goat_elem := v_goats_arr->i;
        v_tag_id := NULLIF(trim(COALESCE(v_goat_elem->>'tag_id', '')), '');
        IF v_tag_id IS NULL THEN
          v_tag_id := public.generate_goat_tag_id();
        END IF;
        v_goat_weight := COALESCE((v_goat_elem->>'initial_weight')::NUMERIC, (v_weight / v_qty));
        v_goat_breed := COALESCE(NULLIF(v_goat_elem->>'breed', ''), 'Boer');
        v_goat_sex := COALESCE(NULLIF(v_goat_elem->>'sex', ''), 'Male');
        v_goat_cost := COALESCE((v_goat_elem->>'acquisition_cost')::NUMERIC, v_allocated_per_goat);

        INSERT INTO public.goats (
          tag_id, name, purchase_id, supplier_id, purchase_date,
          breed, sex, initial_weight, latest_weight, last_weight_date,
          acquisition_cost, allocated_costs, total_cost_basis, status, health_status, notes, created_by
        ) VALUES (
          v_tag_id, COALESCE(v_goat_elem->>'name', ''), v_purchase_id, v_supplier_id, v_purchase_date,
          v_goat_breed, v_goat_sex, v_goat_weight, v_goat_weight, v_purchase_date,
          v_goat_cost, 0, v_goat_cost, 'Active', 'Healthy', COALESCE(v_goat_elem->>'notes', ''), v_user_id
        );
      END LOOP;
    ELSE
      -- Auto-generate individual records for quantity
      FOR i IN 1..v_qty LOOP
        v_tag_id := public.generate_goat_tag_id();
        INSERT INTO public.goats (
          tag_id, purchase_id, supplier_id, purchase_date,
          breed, sex, initial_weight, latest_weight, last_weight_date,
          acquisition_cost, allocated_costs, total_cost_basis, status, health_status, created_by
        ) VALUES (
          v_tag_id, v_purchase_id, v_supplier_id, v_purchase_date,
          'Boer', 'Male', ROUND(v_weight / v_qty, 2), ROUND(v_weight / v_qty, 2), v_purchase_date,
          v_allocated_per_goat, 0, v_allocated_per_goat, 'Active', 'Healthy', v_user_id
        );
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', v_purchase_id,
    'purchase_ref', v_purchase_ref,
    'total_acquisition_cost', v_total_cost,
    'balance_pending', v_balance
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_goat_purchase(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: save_goat_sale
-- Handles customer, invoice, stock deduction, and COGS calculation atomically
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_goat_sale(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_customer_id UUID;
  v_sale_id UUID;
  v_invoice_no TEXT;
  v_sale_date DATE;
  v_method TEXT;
  v_items JSONB;
  v_item JSONB;
  v_total_qty INT := 0;
  v_total_weight NUMERIC(10,2) := 0;
  v_subtotal NUMERIC(14,2) := 0;
  v_discount NUMERIC(14,2) := 0;
  v_total_amount NUMERIC(14,2) := 0;
  v_paid NUMERIC(14,2) := 0;
  v_balance NUMERIC(14,2) := 0;
  v_due_date DATE;
  v_notes TEXT;
  v_attachment TEXT;
  v_total_cogs NUMERIC(14,2) := 0;
  v_gross_profit NUMERIC(14,2) := 0;
  -- Loop variables
  v_item_type TEXT;
  v_goat_id UUID;
  v_group_id UUID;
  v_item_qty INT;
  v_item_weight NUMERIC(8,2);
  v_item_rate NUMERIC(14,2);
  v_line_total NUMERIC(14,2);
  v_item_cost NUMERIC(14,2);
  v_goat_status TEXT;
  v_group_curr_qty INT;
  v_group_unit_cost NUMERIC(14,2);
BEGIN
  -- Customer resolution
  BEGIN
    v_customer_id := NULLIF(p_data->>'customer_id', '')::UUID;
  EXCEPTION WHEN OTHERS THEN
    v_customer_id := NULL;
  END;
  IF v_customer_id IS NULL THEN
    INSERT INTO public.goat_customers(name, phone, address, created_by)
    VALUES (COALESCE(p_data->>'customer_name', 'Direct Livestock Buyer'), COALESCE(p_data->>'customer_phone', ''), COALESCE(p_data->>'customer_address', ''), v_user_id)
    RETURNING id INTO v_customer_id;
  END IF;

  v_sale_date := COALESCE(NULLIF(p_data->>'sale_date', '')::DATE, CURRENT_DATE);
  v_invoice_no := NULLIF(trim(COALESCE(p_data->>'invoice_no', '')), '');
  IF v_invoice_no IS NULL THEN
    v_invoice_no := public.generate_goat_sale_invoice_no(v_sale_date);
  END IF;

  v_method := COALESCE(p_data->>'pricing_method', 'per_goat');
  v_discount := COALESCE((p_data->>'discount')::NUMERIC, 0);
  v_paid := COALESCE((p_data->>'amount_paid')::NUMERIC, 0);
  v_due_date := NULLIF(p_data->>'payment_due_date', '')::DATE;
  v_notes := COALESCE(p_data->>'notes', '');
  v_attachment := COALESCE(p_data->>'attachment_url', '');

  v_items := p_data->'items';
  IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
    RAISE EXCEPTION 'Sale must include at least one goat or group item';
  END IF;

  -- Validate items and compute totals first
  FOR i IN 0..(jsonb_array_length(v_items) - 1) LOOP
    v_item := v_items->i;
    v_item_type := COALESCE(v_item->>'item_type', 'individual');
    v_item_qty := GREATEST(1, COALESCE((v_item->>'quantity')::INT, 1));
    v_item_weight := COALESCE((v_item->>'weight_kg')::NUMERIC, 0);
    v_item_rate := COALESCE((v_item->>'rate')::NUMERIC, 0);

    IF v_method = 'per_goat' THEN
      v_line_total := v_item_qty * v_item_rate;
    ELSE
      v_line_total := v_item_weight * v_item_rate;
    END IF;

    IF v_item_type = 'individual' THEN
      v_goat_id := (v_item->>'goat_id')::UUID;
      SELECT status, total_cost_basis INTO v_goat_status, v_item_cost FROM public.goats WHERE id = v_goat_id;
      IF v_goat_status IS NULL THEN
        RAISE EXCEPTION 'Goat with ID % not found', v_goat_id;
      END IF;
      IF v_goat_status = 'Sold' THEN
        RAISE EXCEPTION 'Goat % is already marked as Sold', v_goat_id;
      END IF;
      IF v_goat_status = 'Deceased' THEN
        RAISE EXCEPTION 'Goat % is marked as Deceased and cannot be sold', v_goat_id;
      END IF;
      v_total_cogs := v_total_cogs + COALESCE(v_item_cost, 0);
    ELSE
      v_group_id := (v_item->>'group_id')::UUID;
      SELECT current_quantity, unit_cost_basis INTO v_group_curr_qty, v_group_unit_cost FROM public.goat_groups WHERE id = v_group_id;
      IF v_group_curr_qty IS NULL THEN
        RAISE EXCEPTION 'Goat group % not found', v_group_id;
      END IF;
      IF v_group_curr_qty < v_item_qty THEN
        RAISE EXCEPTION 'Insufficient group inventory: requested % but group only has % available', v_item_qty, v_group_curr_qty;
      END IF;
      v_total_cogs := v_total_cogs + (v_item_qty * COALESCE(v_group_unit_cost, 0));
    END IF;

    v_total_qty := v_total_qty + v_item_qty;
    v_total_weight := v_total_weight + v_item_weight;
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_total_amount := GREATEST(0, v_subtotal - v_discount);
  v_balance := v_total_amount - v_paid;
  v_gross_profit := v_total_amount - v_total_cogs;

  -- Create sale record
  INSERT INTO public.goat_sales (
    invoice_no, sale_date, customer_id, pricing_method,
    total_quantity, total_weight_kg, subtotal, discount,
    total_amount, amount_paid, balance_pending,
    total_cogs, gross_profit, payment_due_date,
    notes, attachment_url, created_by
  ) VALUES (
    v_invoice_no, v_sale_date, v_customer_id, v_method,
    v_total_qty, v_total_weight, v_subtotal, v_discount,
    v_total_amount, v_paid, v_balance,
    v_total_cogs, v_gross_profit, v_due_date,
    v_notes, v_attachment, v_user_id
  ) RETURNING id INTO v_sale_id;

  -- Initial payment record if paid > 0
  IF v_paid > 0 THEN
    INSERT INTO public.goat_customer_payments (
      sale_id, payment_date, amount, payment_method, reference_no, notes, created_by
    ) VALUES (
      v_sale_id, v_sale_date, v_paid, COALESCE(p_data->>'payment_mode', 'Cash'), 'Down payment on sale', 'Initial payment', v_user_id
    );
  END IF;

  -- Insert sale items and update inventory
  FOR i IN 0..(jsonb_array_length(v_items) - 1) LOOP
    v_item := v_items->i;
    v_item_type := COALESCE(v_item->>'item_type', 'individual');
    v_item_qty := GREATEST(1, COALESCE((v_item->>'quantity')::INT, 1));
    v_item_weight := COALESCE((v_item->>'weight_kg')::NUMERIC, 0);
    v_item_rate := COALESCE((v_item->>'rate')::NUMERIC, 0);

    IF v_method = 'per_goat' THEN
      v_line_total := v_item_qty * v_item_rate;
    ELSE
      v_line_total := v_item_weight * v_item_rate;
    END IF;

    IF v_item_type = 'individual' THEN
      v_goat_id := (v_item->>'goat_id')::UUID;
      SELECT total_cost_basis INTO v_item_cost FROM public.goats WHERE id = v_goat_id;

      INSERT INTO public.goat_sale_items (
        sale_id, item_type, goat_id, quantity, weight_kg, rate, line_total, cost_basis
      ) VALUES (
        v_sale_id, 'individual', v_goat_id, 1, v_item_weight, v_item_rate, v_line_total, COALESCE(v_item_cost, 0)
      );

      UPDATE public.goats
      SET status = 'Sold', updated_at = now()
      WHERE id = v_goat_id;
    ELSE
      v_group_id := (v_item->>'group_id')::UUID;
      SELECT unit_cost_basis INTO v_group_unit_cost FROM public.goat_groups WHERE id = v_group_id;

      INSERT INTO public.goat_sale_items (
        sale_id, item_type, group_id, quantity, weight_kg, rate, line_total, cost_basis
      ) VALUES (
        v_sale_id, 'group', v_group_id, v_item_qty, v_item_weight, v_item_rate, v_line_total, (v_item_qty * COALESCE(v_group_unit_cost, 0))
      );

      UPDATE public.goat_groups
      SET current_quantity = current_quantity - v_item_qty,
          total_cost_basis = GREATEST(0, total_cost_basis - (v_item_qty * unit_cost_basis)),
          status = CASE WHEN (current_quantity - v_item_qty) <= 0 THEN 'Sold Out' ELSE 'Partially Sold' END,
          updated_at = now()
      WHERE id = v_group_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'sale_id', v_sale_id,
    'invoice_no', v_invoice_no,
    'total_amount', v_total_amount,
    'total_cogs', v_total_cogs,
    'gross_profit', v_gross_profit,
    'balance_pending', v_balance
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_goat_sale(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: convert_group_to_individual
-- Converts goats from a group to individual tag records with zero double counting
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convert_group_to_individual(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_group_id UUID := (p_data->>'group_id')::UUID;
  v_group RECORD;
  v_count INT;
  v_goats_arr JSONB;
  v_elem JSONB;
  v_tag_id TEXT;
  v_weight NUMERIC(6,2);
  v_breed TEXT;
  v_sex TEXT;
  v_cost NUMERIC(14,2);
BEGIN
  SELECT * INTO v_group FROM public.goat_groups WHERE id = v_group_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  v_goats_arr := p_data->'goats';
  v_count := GREATEST(1, COALESCE((p_data->>'count')::INT, jsonb_array_length(v_goats_arr)));

  IF v_group.current_quantity < v_count THEN
    RAISE EXCEPTION 'Cannot convert % goats; group only has % available', v_count, v_group.current_quantity;
  END IF;

  v_cost := v_group.unit_cost_basis;

  IF v_goats_arr IS NOT NULL AND jsonb_array_length(v_goats_arr) > 0 THEN
    FOR i IN 0..(jsonb_array_length(v_goats_arr) - 1) LOOP
      v_elem := v_goats_arr->i;
      v_tag_id := NULLIF(trim(COALESCE(v_elem->>'tag_id', '')), '');
      IF v_tag_id IS NULL THEN
        v_tag_id := public.generate_goat_tag_id();
      END IF;
      v_weight := COALESCE((v_elem->>'weight')::NUMERIC, (v_group.current_total_weight / GREATEST(1, v_group.current_quantity)));
      v_breed := COALESCE(NULLIF(v_elem->>'breed', ''), v_group.breed);
      v_sex := COALESCE(NULLIF(v_elem->>'sex', ''), 'Male');

      INSERT INTO public.goats (
        tag_id, name, group_id, purchase_id, supplier_id, purchase_date,
        breed, sex, initial_weight, latest_weight, last_weight_date,
        acquisition_cost, allocated_costs, total_cost_basis, status, health_status, notes, created_by
      ) VALUES (
        v_tag_id, COALESCE(v_elem->>'name', ''), v_group_id, v_group.purchase_id, v_group.supplier_id, v_group.purchase_date,
        v_breed, v_sex, v_weight, v_weight, CURRENT_DATE,
        v_cost, 0, v_cost, 'Active', 'Healthy', COALESCE(v_elem->>'notes', ''), v_user_id
      );
    END LOOP;
  ELSE
    FOR i IN 1..v_count LOOP
      v_tag_id := public.generate_goat_tag_id();
      INSERT INTO public.goats (
        tag_id, group_id, purchase_id, supplier_id, purchase_date,
        breed, sex, initial_weight, latest_weight, last_weight_date,
        acquisition_cost, allocated_costs, total_cost_basis, status, health_status, created_by
      ) VALUES (
        v_tag_id, v_group_id, v_group.purchase_id, v_group.supplier_id, v_group.purchase_date,
        v_group.breed, 'Male', 0, 0, CURRENT_DATE,
        v_cost, 0, v_cost, 'Active', 'Healthy', v_user_id
      );
    END LOOP;
  END IF;

  -- Deduct converted count and cost basis from group
  UPDATE public.goat_groups
  SET current_quantity = current_quantity - v_count,
      total_cost_basis = GREATEST(0, total_cost_basis - (v_count * unit_cost_basis)),
      status = CASE WHEN (current_quantity - v_count) <= 0 THEN 'Archived' ELSE status END,
      updated_at = now()
  WHERE id = v_group_id;

  RETURN jsonb_build_object('success', true, 'converted_count', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.convert_group_to_individual(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: mark_goat_deceased
-- Updates goat status and mortality accounting safely
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_goat_deceased(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_goat_id UUID := (p_data->>'goat_id')::UUID;
  v_date DATE := COALESCE(NULLIF(p_data->>'deceased_date', '')::DATE, CURRENT_DATE);
  v_reason TEXT := COALESCE(p_data->>'deceased_reason', 'Natural/Illness');
BEGIN
  UPDATE public.goats
  SET status = 'Deceased',
      health_status = 'Deceased',
      deceased_date = v_date,
      deceased_reason = v_reason,
      updated_at = now()
  WHERE id = v_goat_id;

  RETURN jsonb_build_object('success', true, 'goat_id', v_goat_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_goat_deceased(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: add_goat_supplier_payment
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_goat_supplier_payment(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_purchase_id UUID := (p_data->>'purchase_id')::UUID;
  v_amount NUMERIC(14,2) := (p_data->>'amount')::NUMERIC;
  v_date DATE := COALESCE(NULLIF(p_data->>'payment_date', '')::DATE, CURRENT_DATE);
  v_method TEXT := COALESCE(p_data->>'payment_method', 'Cash');
  v_ref TEXT := COALESCE(p_data->>'reference_no', '');
  v_notes TEXT := COALESCE(p_data->>'notes', '');
  v_pur RECORD;
BEGIN
  SELECT * INTO v_pur FROM public.goat_purchases WHERE id = v_purchase_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Purchase record not found'; END IF;

  INSERT INTO public.goat_supplier_payments (
    purchase_id, payment_date, amount, payment_method, reference_no, notes, created_by
  ) VALUES (
    v_purchase_id, v_date, v_amount, v_method, v_ref, v_notes, v_user_id
  );

  UPDATE public.goat_purchases
  SET amount_paid = amount_paid + v_amount,
      balance_pending = balance_pending - v_amount,
      updated_at = now()
  WHERE id = v_purchase_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_pur.balance_pending - v_amount);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_goat_supplier_payment(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: add_goat_customer_payment
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_goat_customer_payment(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_sale_id UUID := (p_data->>'sale_id')::UUID;
  v_amount NUMERIC(14,2) := (p_data->>'amount')::NUMERIC;
  v_date DATE := COALESCE(NULLIF(p_data->>'payment_date', '')::DATE, CURRENT_DATE);
  v_method TEXT := COALESCE(p_data->>'payment_method', 'Cash');
  v_ref TEXT := COALESCE(p_data->>'reference_no', '');
  v_notes TEXT := COALESCE(p_data->>'notes', '');
  v_sale RECORD;
BEGIN
  SELECT * INTO v_sale FROM public.goat_sales WHERE id = v_sale_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sale invoice not found'; END IF;

  INSERT INTO public.goat_customer_payments (
    sale_id, payment_date, amount, payment_method, reference_no, notes, created_by
  ) VALUES (
    v_sale_id, v_date, v_amount, v_method, v_ref, v_notes, v_user_id
  );

  UPDATE public.goat_sales
  SET amount_paid = amount_paid + v_amount,
      balance_pending = balance_pending - v_amount,
      updated_at = now()
  WHERE id = v_sale_id;

  RETURN jsonb_build_object('success', true, 'new_balance', v_sale.balance_pending - v_amount);
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_goat_customer_payment(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: save_goat_expense
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_goat_expense(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_ref TEXT;
  v_date DATE;
  v_id UUID;
BEGIN
  v_date := COALESCE(NULLIF(p_data->>'expense_date', '')::DATE, CURRENT_DATE);
  v_ref := NULLIF(trim(COALESCE(p_data->>'expense_ref', '')), '');
  IF v_ref IS NULL THEN
    v_ref := public.generate_goat_expense_ref(v_date);
  END IF;

  INSERT INTO public.goat_expenses (
    expense_ref, expense_date, category, amount, paid_to, payment_mode,
    description, related_goat_id, related_group_id, attachment_url, notes, created_by
  ) VALUES (
    v_ref, v_date, p_data->>'category', (p_data->>'amount')::NUMERIC,
    p_data->>'paid_to', COALESCE(p_data->>'payment_mode', 'Cash'),
    COALESCE(p_data->>'description', ''),
    NULLIF(p_data->>'related_goat_id', '')::UUID,
    NULLIF(p_data->>'related_group_id', '')::UUID,
    COALESCE(p_data->>'attachment_url', ''),
    COALESCE(p_data->>'notes', ''),
    v_user_id
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'expense_ref', v_ref);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_goat_expense(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: record_goat_weight
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_goat_weight(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_goat_id UUID := NULLIF(p_data->>'goat_id', '')::UUID;
  v_group_id UUID := NULLIF(p_data->>'group_id', '')::UUID;
  v_weight NUMERIC(6,2) := (p_data->>'weight_kg')::NUMERIC;
  v_date DATE := COALESCE(NULLIF(p_data->>'record_date', '')::DATE, CURRENT_DATE);
  v_prev_weight NUMERIC(6,2) := 0;
  v_gain NUMERIC(6,2) := 0;
  v_rec_id UUID;
BEGIN
  IF v_goat_id IS NOT NULL THEN
    SELECT latest_weight INTO v_prev_weight FROM public.goats WHERE id = v_goat_id;
    IF v_prev_weight > 0 THEN
      v_gain := v_weight - v_prev_weight;
    END IF;

    UPDATE public.goats
    SET latest_weight = v_weight,
        last_weight_date = v_date,
        updated_at = now()
    WHERE id = v_goat_id;
  END IF;

  IF v_group_id IS NOT NULL THEN
    UPDATE public.goat_groups
    SET current_total_weight = v_weight,
        updated_at = now()
    WHERE id = v_group_id;
  END IF;

  INSERT INTO public.goat_weight_records (
    goat_id, group_id, record_date, weight_kg, weight_gain, notes, created_by
  ) VALUES (
    v_goat_id, v_group_id, v_date, v_weight, v_gain, COALESCE(p_data->>'notes', ''), v_user_id
  ) RETURNING id INTO v_rec_id;

  RETURN jsonb_build_object('success', true, 'id', v_rec_id, 'weight_gain', v_gain);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_goat_weight(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- TRANSACTIONAL RPC: record_goat_health
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_goat_health(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_goat_id UUID := NULLIF(p_data->>'goat_id', '')::UUID;
  v_group_id UUID := NULLIF(p_data->>'group_id', '')::UUID;
  v_type TEXT := COALESCE(p_data->>'record_type', 'Vaccination');
  v_title TEXT := p_data->>'title_or_vaccine';
  v_date DATE := COALESCE(NULLIF(p_data->>'record_date', '')::DATE, CURRENT_DATE);
  v_next_date DATE := NULLIF(p_data->>'next_scheduled_date', '')::DATE;
  v_cost NUMERIC(14,2) := COALESCE((p_data->>'cost')::NUMERIC, 0);
  v_rec_id UUID;
BEGIN
  INSERT INTO public.goat_health_records (
    goat_id, group_id, record_date, record_type, title_or_vaccine,
    dosage, administered_by, next_scheduled_date, cost, notes, created_by
  ) VALUES (
    v_goat_id, v_group_id, v_date, v_type, v_title,
    COALESCE(p_data->>'dosage', ''), COALESCE(p_data->>'administered_by', ''),
    v_next_date, v_cost, COALESCE(p_data->>'notes', ''), v_user_id
  ) RETURNING id INTO v_rec_id;

  IF v_goat_id IS NOT NULL THEN
    UPDATE public.goats
    SET health_status = CASE
      WHEN v_type = 'Vaccination' THEN 'Vaccinated'
      WHEN v_type = 'Treatment' THEN 'Under Treatment'
      ELSE health_status
    END,
    updated_at = now()
    WHERE id = v_goat_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_rec_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_goat_health(JSONB) TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- RPC: get_goat_dashboard_metrics
-- Computes the 10 KPI summary metrics for goat operations strictly isolated
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_goat_dashboard_metrics(p_month TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
  v_total_goats_owned INT := 0;
  v_indiv_goats_count INT := 0;
  v_active_groups_count INT := 0;
  v_groups_inventory_val NUMERIC(14,2) := 0;
  v_purchases_month NUMERIC(14,2) := 0;
  v_sales_month NUMERIC(14,2) := 0;
  v_expenses_month NUMERIC(14,2) := 0;
  v_receivables NUMERIC(14,2) := 0;
  v_payables NUMERIC(14,2) := 0;
  v_herd_inventory_val NUMERIC(14,2) := 0;
  v_realized_pnl NUMERIC(14,2) := 0;
  v_cogs_month NUMERIC(14,2) := 0;
BEGIN
  IF p_month IS NOT NULL AND p_month <> '' THEN
    v_start_date := (p_month || '-01')::DATE;
    v_end_date := (DATE_TRUNC('month', v_start_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  ELSE
    v_start_date := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_end_date := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  END IF;

  -- 1 & 2: Active individual goats
  SELECT COUNT(*), COALESCE(SUM(total_cost_basis), 0)
  INTO v_indiv_goats_count, v_herd_inventory_val
  FROM public.goats
  WHERE status IN ('Active', 'Available for Sale');

  -- 3: Active groups
  SELECT COUNT(*), COALESCE(SUM(current_quantity), 0), COALESCE(SUM(total_cost_basis), 0)
  INTO v_active_groups_count, v_total_goats_owned, v_groups_inventory_val
  FROM public.goat_groups
  WHERE current_quantity > 0 AND status <> 'Archived';

  -- Total goats owned = individual active + sum of current group quantities
  v_total_goats_owned := v_indiv_goats_count + v_total_goats_owned;
  -- Total inventory valuation = individual active cost basis + active groups cost basis
  v_herd_inventory_val := v_herd_inventory_val + v_groups_inventory_val;

  -- 4: Total purchases this month
  SELECT COALESCE(SUM(total_acquisition_cost), 0)
  INTO v_purchases_month
  FROM public.goat_purchases
  WHERE purchase_date >= v_start_date AND purchase_date <= v_end_date;

  -- 5: Total goat sales this month
  SELECT COALESCE(SUM(total_amount), 0), COALESCE(SUM(total_cogs), 0)
  INTO v_sales_month, v_cogs_month
  FROM public.goat_sales
  WHERE sale_date >= v_start_date AND sale_date <= v_end_date;

  -- 6: Total goat rearing expenses this month
  SELECT COALESCE(SUM(amount), 0)
  INTO v_expenses_month
  FROM public.goat_expenses
  WHERE expense_date >= v_start_date AND expense_date <= v_end_date;

  -- 7: Outstanding customer receivables
  SELECT COALESCE(SUM(balance_pending), 0)
  INTO v_receivables
  FROM public.goat_sales
  WHERE balance_pending > 0;

  -- 8: Outstanding supplier payables
  SELECT COALESCE(SUM(balance_pending), 0)
  INTO v_payables
  FROM public.goat_purchases
  WHERE balance_pending > 0;

  -- 10: Realized goat-business profit/loss = Sales - COGS - Operating Expenses
  v_realized_pnl := (v_sales_month - v_cogs_month) - v_expenses_month;

  RETURN jsonb_build_object(
    'total_goats_owned', v_total_goats_owned,
    'individual_goats_count', v_indiv_goats_count,
    'active_groups_count', v_active_groups_count,
    'purchases_this_month', v_purchases_month,
    'sales_this_month', v_sales_month,
    'expenses_this_month', v_expenses_month,
    'customer_receivables', v_receivables,
    'supplier_payables', v_payables,
    'herd_inventory_value', v_herd_inventory_val,
    'realized_profit_loss', v_realized_pnl,
    'cogs_this_month', v_cogs_month,
    'gross_profit_this_month', (v_sales_month - v_cogs_month)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_goat_dashboard_metrics(TEXT) TO authenticated;
