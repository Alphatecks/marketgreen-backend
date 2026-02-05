-- ============================================
-- PROMOTIONS TABLE
-- ============================================
-- Table for managing promotional banners/headers
CREATE TABLE IF NOT EXISTS promotions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  header_text VARCHAR(255), -- e.g., "// Todays Hot Deals"
  subtitle VARCHAR(255), -- e.g., "ORIGINAL STOCK"
  main_title VARCHAR(255) NOT NULL, -- Main title (required)
  countdown_end_date TIMESTAMP WITH TIME ZONE, -- Countdown end date/time
  button_text VARCHAR(100) DEFAULT 'SHOP NOW', -- Button text
  button_link VARCHAR(500) DEFAULT '/products', -- Button link/URL
  product_image TEXT, -- URL to product image
  background_image TEXT, -- URL to background image (optional)
  background_color VARCHAR(7) DEFAULT '#FEF3C7', -- Hex color code
  is_active BOOLEAN DEFAULT true, -- Whether promotion is currently active
  display_order INTEGER DEFAULT 0, -- Order for displaying multiple promotions
  created_by UUID REFERENCES auth.users(id), -- Admin who created the promotion
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active promotions
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_promotions_display_order ON promotions(display_order);
CREATE INDEX IF NOT EXISTS idx_promotions_countdown ON promotions(countdown_end_date) WHERE countdown_end_date IS NOT NULL;

-- ============================================
-- TRIGGER FOR PROMOTIONS TABLE
-- ============================================
-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_promotions_updated_at ON promotions;
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on promotions table
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Promotions are viewable by everyone" ON promotions;
DROP POLICY IF EXISTS "Promotions are manageable by admins" ON promotions;

-- Promotions: Anyone can view active promotions, only admins can manage
CREATE POLICY "Promotions are viewable by everyone"
  ON promotions FOR SELECT
  USING (is_active = true AND (countdown_end_date IS NULL OR countdown_end_date > NOW()));

CREATE POLICY "Promotions are manageable by admins"
  ON promotions FOR ALL
  USING (is_admin(auth.uid()));
