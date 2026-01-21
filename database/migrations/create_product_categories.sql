-- Migration: Create product_categories junction table for normalized category storage
-- This allows products to have multiple categories

CREATE TABLE IF NOT EXISTS product_categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN (
    'Vegetables', 
    'Fruits', 
    'Meat', 
    'Fish', 
    'Beverages', 
    'Juices', 
    'Dairy', 
    'Snacks', 
    'Breakfast', 
    'Health', 
    'Bakery', 
    'Grains', 
    'Organic', 
    'Others', 
    'Uncategorized'
  )),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(product_id, category)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_categories_product_id ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category);

-- Enable RLS on product_categories table
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view categories for active products" ON product_categories;
DROP POLICY IF EXISTS "Admins can manage all categories" ON product_categories;
DROP POLICY IF EXISTS "Admins can view all categories" ON product_categories;

-- Policy: Users can view categories for active products
CREATE POLICY "Users can view categories for active products"
  ON product_categories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products
      WHERE products.id = product_categories.product_id
      AND products.product_status = 'Active'
    )
  );

-- Policy: Admins can view all categories
CREATE POLICY "Admins can view all categories"
  ON product_categories FOR SELECT
  USING (is_admin(auth.uid()));

-- Policy: Admins can manage all categories (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage all categories"
  ON product_categories FOR ALL
  USING (is_admin(auth.uid()));

-- Add comments
COMMENT ON TABLE product_categories IS 'Junction table for product-category many-to-many relationship';
COMMENT ON COLUMN product_categories.product_id IS 'Reference to products table';
COMMENT ON COLUMN product_categories.category IS 'Category name from allowed list';
