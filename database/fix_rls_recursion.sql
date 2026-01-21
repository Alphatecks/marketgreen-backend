-- ============================================
-- FIX RLS INFINITE RECURSION
-- ============================================
-- This file fixes the infinite recursion issue in RLS policies
-- by creating a SECURITY DEFINER function that bypasses RLS
-- to check admin status without triggering recursive policy checks.

-- ============================================
-- FUNCTION: Check if user is admin
-- ============================================
-- SECURITY DEFINER allows this function to bypass RLS policies
-- This prevents infinite recursion when checking admin status in RLS policies
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE profiles.id = user_id 
    AND profiles.role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin(UUID) TO anon;

-- ============================================
-- UPDATE RLS POLICIES TO USE THE FUNCTION
-- ============================================

-- Drop existing admin policies that cause recursion
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Products are editable by admins" ON products;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all order items" ON order_items;

-- Profiles: Admins can view all profiles (using function to avoid recursion)
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

-- Profiles: Admins can update all profiles (using function to avoid recursion)
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (is_admin(auth.uid()));

-- Products: Admins can edit products (using function to avoid recursion)
CREATE POLICY "Products are editable by admins"
  ON products FOR ALL
  USING (is_admin(auth.uid()));

-- Orders: Admins can view all orders (using function to avoid recursion)
CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  USING (is_admin(auth.uid()));

-- Orders: Admins can update all orders (using function to avoid recursion)
CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (is_admin(auth.uid()));

-- Order items: Admins can view all order items (using function to avoid recursion)
CREATE POLICY "Admins can view all order items"
  ON order_items FOR SELECT
  USING (is_admin(auth.uid()));
