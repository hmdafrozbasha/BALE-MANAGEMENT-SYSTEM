-- =============================================================================
-- BALE MANAGEMENT SYSTEM — Migration 005: Owner Password & Team Account Management
-- Apply via: Supabase Dashboard → SQL Editor → Run
-- =============================================================================

-- Ensure pgcrypto extension is installed
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. RPC: List all accounts with emails (accessible ONLY by active owner)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  phone TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  -- Security check: caller must be an active owner in public.profiles
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'owner' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Only active owners can view user accounts.';
  END IF;

  RETURN QUERY
  SELECT 
    p.id,
    COALESCE(u.email::TEXT, '') AS email,
    COALESCE(p.full_name, '') AS full_name,
    COALESCE(p.role, 'staff') AS role,
    COALESCE(p.phone, '') AS phone,
    COALESCE(p.is_active, true) AS is_active,
    p.created_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY 
    CASE p.role 
      WHEN 'owner' THEN 1 
      WHEN 'accountant' THEN 2 
      ELSE 3 
    END,
    p.created_at ASC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC: Reset / Change password for any user (accessible ONLY by active owner)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  v_target_email TEXT;
  v_target_role TEXT;
BEGIN
  -- Security check: caller must be an active owner in public.profiles
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'owner' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Only active owners can change user passwords.';
  END IF;

  -- Validation: password length
  IF new_password IS NULL OR length(trim(new_password)) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters long.';
  END IF;

  -- Verify target user exists in auth.users
  SELECT u.email::TEXT, p.role INTO v_target_email, v_target_role
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user not found in database.';
  END IF;

  -- Update auth.users encrypted password with bcrypt hash
  UPDATE auth.users
  SET 
    encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')),
    updated_at = now()
  WHERE id = target_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', target_user_id,
    'email', v_target_email,
    'role', v_target_role,
    'message', 'Password updated successfully'
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Permissions
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.admin_get_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_password(UUID, TEXT) TO authenticated;
