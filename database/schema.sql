-- MarketGreen E-commerce Database Schema
-- Optimized for grocery and fresh fruits e-commerce platform
-- This schema supports admin dashboard metrics calculations

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PRODUCTS TABLE
-- ============================================
-- Products table for grocery items and fresh fruits
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  category VARCHAR(100) NOT NULL, -- e.g., 'fruits', 'vegetables', 'dairy', 'meat', etc.
  subcategory VARCHAR(100), -- e.g., 'fresh-fruits', 'frozen', 'organic', etc.
  stock INTEGER DEFAULT 0 CHECK (stock >= 0),
  unit VARCHAR(50) DEFAULT 'piece', -- e.g., 'kg', 'piece', 'bunch', 'pack'
  weight DECIMAL(8, 2), -- Weight in kg (useful for fruits/vegetables)
  is_organic BOOLEAN DEFAULT false,
  is_fresh BOOLEAN DEFAULT true, -- Indicates if it's a fresh produce item
  expiry_date DATE, -- For fresh items
  brand VARCHAR(100),
  sku VARCHAR(100) UNIQUE, -- Stock Keeping Unit
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'out_of_stock')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for category filtering (common in grocery stores)
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);

-- ============================================
-- PROFILES TABLE
-- ============================================
-- User profiles extending Supabase auth.users
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username VARCHAR(100) UNIQUE,
  email VARCHAR(255), -- Email from auth.users
  full_name VARCHAR(255),
  avatar_url TEXT,
  phone VARCHAR(20),
  marketing_emails BOOLEAN DEFAULT false, -- Marketing emails preference
  role VARCHAR(50) DEFAULT 'user' CHECK (role IN ('user', 'admin', 'vendor')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

-- ============================================
-- ORDERS TABLE
-- ============================================
-- Orders table with comprehensive status tracking for dashboard metrics
CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_number VARCHAR(50) UNIQUE NOT NULL, -- Human-readable order number (e.g., ORD-2024-001234)
  total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  tax_amount DECIMAL(10, 2) DEFAULT 0 CHECK (tax_amount >= 0),
  shipping_amount DECIMAL(10, 2) DEFAULT 0 CHECK (shipping_amount >= 0),
  discount_amount DECIMAL(10, 2) DEFAULT 0 CHECK (discount_amount >= 0),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'confirmed', 'shipped', 'delivered', 'canceled', 'refunded')),
  payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
  payment_method VARCHAR(50), -- e.g., 'credit_card', 'debit_card', 'cash_on_delivery', 'wallet'
  shipping_address JSONB NOT NULL, -- Full address details
  billing_address JSONB,
  items JSONB NOT NULL, -- Array of order items with product details
  notes TEXT, -- Order notes from customer
  admin_notes TEXT, -- Internal admin notes
  canceled_at TIMESTAMP WITH TIME ZONE,
  canceled_reason TEXT,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for dashboard queries (critical for performance)
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- Composite index for common dashboard queries
CREATE INDEX IF NOT EXISTS idx_orders_status_created_at_desc ON orders(status, created_at DESC);

-- ============================================
-- ORDER ITEMS TABLE (Optional - for better normalization)
-- ============================================
-- Separate table for order items if you want better querying capabilities
CREATE TABLE IF NOT EXISTS order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name VARCHAR(255) NOT NULL, -- Store name at time of purchase
  product_price DECIMAL(10, 2) NOT NULL CHECK (product_price >= 0), -- Price at time of purchase
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  subtotal DECIMAL(10, 2) NOT NULL CHECK (subtotal >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- ============================================
-- FUNCTIONS AND TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for products table
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for profiles table
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for orders table
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to generate order number (trigger function)
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
BEGIN
  -- Only generate if order_number is not already set
  IF NEW.order_number IS NULL THEN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    -- Get the next sequence number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM orders
    WHERE order_number LIKE 'ORD-' || year_part || '-%';
    
    NEW.order_number := 'ORD-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate order number
DROP TRIGGER IF EXISTS set_order_number ON orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_order_number();

-- ============================================
-- FUNCTION: Check if user is admin (prevents RLS recursion)
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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Products are viewable by everyone" ON products;
DROP POLICY IF EXISTS "Products are editable by admins" ON products;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Users can create own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Users can view own order items" ON order_items;
DROP POLICY IF EXISTS "Admins can view all order items" ON order_items;

-- Products: Anyone can read active products, only admins can modify
CREATE POLICY "Products are viewable by everyone"
  ON products FOR SELECT
  USING (status = 'active');

CREATE POLICY "Products are editable by admins"
  ON products FOR ALL
  USING (is_admin(auth.uid()));

-- Profiles: Users can view their own profile, admins can view all
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_admin(auth.uid()));

-- Orders: Users can view their own orders
CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own orders"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
  ON orders FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update all orders"
  ON orders FOR UPDATE
  USING (is_admin(auth.uid()));

-- Order items: Users can view items from their orders
CREATE POLICY "Users can view own order items"
  ON order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all order items"
  ON order_items FOR SELECT
  USING (is_admin(auth.uid()));

-- ============================================
-- VIEWS FOR DASHBOARD METRICS (Optional but recommended)
-- ============================================

-- View for daily sales summary
CREATE OR REPLACE VIEW daily_sales_summary AS
SELECT 
  DATE(created_at) as sale_date,
  COUNT(*) as order_count,
  COUNT(CASE WHEN status IN ('confirmed', 'shipped', 'delivered') THEN 1 END) as completed_orders,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
  COUNT(CASE WHEN status = 'canceled' THEN 1 END) as canceled_orders,
  SUM(CASE WHEN status IN ('confirmed', 'shipped', 'delivered') THEN total_amount ELSE 0 END) as total_sales,
  SUM(total_amount) as gross_sales
FROM orders
GROUP BY DATE(created_at)
ORDER BY sale_date DESC;

-- View for order status summary
CREATE OR REPLACE VIEW order_status_summary AS
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_value
FROM orders
GROUP BY status;
