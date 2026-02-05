-- ============================================
-- SHOPPING CART TABLE
-- ============================================
-- Table for managing user shopping carts
CREATE TABLE IF NOT EXISTS cart (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, product_id) -- One cart entry per product per user
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cart_user_id ON cart(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_product_id ON cart(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_user_product ON cart(user_id, product_id);

-- ============================================
-- TRIGGER FOR CART TABLE
-- ============================================
-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_cart_updated_at ON cart;
CREATE TRIGGER update_cart_updated_at
  BEFORE UPDATE ON cart
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on cart table
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own cart" ON cart;
DROP POLICY IF EXISTS "Users can manage own cart" ON cart;

-- Users can view their own cart
CREATE POLICY "Users can view own cart"
  ON cart FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage their own cart (insert, update, delete)
CREATE POLICY "Users can manage own cart"
  ON cart FOR ALL
  USING (auth.uid() = user_id);
