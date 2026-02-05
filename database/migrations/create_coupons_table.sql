-- ============================================
-- COUPONS TABLE
-- ============================================
-- Table for managing discount coupon codes
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL, -- Coupon code (e.g., "SAVE20", "WELCOME10")
  description TEXT, -- Description of the coupon
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')), -- 'percentage' or 'fixed' amount
  discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value >= 0), -- Percentage (0-100) or fixed amount
  min_order_amount DECIMAL(10, 2) DEFAULT 0 CHECK (min_order_amount >= 0), -- Minimum order amount to use coupon
  max_discount_amount DECIMAL(10, 2), -- Maximum discount for percentage coupons (optional)
  usage_limit INTEGER, -- Total number of times coupon can be used (NULL = unlimited)
  usage_count INTEGER DEFAULT 0 CHECK (usage_count >= 0), -- Current usage count
  user_limit INTEGER DEFAULT 1, -- Number of times a single user can use this coupon (1 = one-time use per user)
  valid_from TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- Start date
  valid_until TIMESTAMP WITH TIME ZONE, -- End date (NULL = no expiration)
  is_active BOOLEAN DEFAULT true, -- Whether coupon is currently active
  created_by UUID REFERENCES auth.users(id), -- Admin who created the coupon
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for code lookups
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_coupons_valid_dates ON coupons(valid_from, valid_until);

-- ============================================
-- COUPON USAGE TABLE
-- ============================================
-- Track which users have used which coupons
CREATE TABLE IF NOT EXISTS coupon_usage (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coupon_id UUID REFERENCES coupons(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL, -- Order where coupon was used
  discount_amount DECIMAL(10, 2) NOT NULL CHECK (discount_amount >= 0), -- Actual discount applied
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(coupon_id, user_id, order_id) -- Prevent duplicate usage tracking
);

-- Indexes for coupon usage queries
CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_id ON coupon_usage(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_id ON coupon_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_usage_order_id ON coupon_usage(order_id);

-- ============================================
-- ADD COUPON CODE TO ORDERS TABLE
-- ============================================
-- Add coupon_code and coupon_id to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL;

-- Index for coupon lookups in orders
CREATE INDEX IF NOT EXISTS idx_orders_coupon_id ON orders(coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_coupon_code ON orders(coupon_code) WHERE coupon_code IS NOT NULL;

-- ============================================
-- TRIGGER FOR COUPONS TABLE
-- ============================================
-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_coupons_updated_at ON coupons;
CREATE TRIGGER update_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on coupons table
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Coupons are viewable by everyone" ON coupons;
DROP POLICY IF EXISTS "Coupons are manageable by admins" ON coupons;
DROP POLICY IF EXISTS "Users can view own coupon usage" ON coupon_usage;
DROP POLICY IF EXISTS "Admins can view all coupon usage" ON coupon_usage;

-- Coupons: Anyone can view active coupons, only admins can manage
CREATE POLICY "Coupons are viewable by everyone"
  ON coupons FOR SELECT
  USING (is_active = true AND (valid_until IS NULL OR valid_until > NOW()) AND valid_from <= NOW());

CREATE POLICY "Coupons are manageable by admins"
  ON coupons FOR ALL
  USING (is_admin(auth.uid()));

-- Coupon usage: Users can view their own usage, admins can view all
CREATE POLICY "Users can view own coupon usage"
  ON coupon_usage FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all coupon usage"
  ON coupon_usage FOR SELECT
  USING (is_admin(auth.uid()));
