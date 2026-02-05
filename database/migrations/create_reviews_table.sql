-- ============================================
-- PRODUCT REVIEWS TABLE
-- ============================================
-- Table for managing customer product reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Can be null for guest reviews
  customer_name VARCHAR(255) NOT NULL, -- Customer display name
  customer_email VARCHAR(255) NOT NULL, -- Customer email
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5), -- Star rating (1-5)
  review_text TEXT NOT NULL, -- Review content
  helpful_count INTEGER DEFAULT 0 CHECK (helpful_count >= 0), -- Number of helpful votes
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')), -- Review moderation status
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);

-- ============================================
-- TRIGGER FOR REVIEWS TABLE
-- ============================================
-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: Update product rating when review is approved/rejected
-- ============================================
CREATE OR REPLACE FUNCTION update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update product rating when review status changes to/from approved
  IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) OR (TG_OP = 'INSERT' AND NEW.status = 'approved') THEN
    -- Recalculate average rating and review count for the product
    UPDATE products
    SET 
      rating = (
        SELECT COALESCE(AVG(rating::DECIMAL), 0)
        FROM reviews
        WHERE product_id = NEW.product_id AND status = 'approved'
      ),
      review_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE product_id = NEW.product_id AND status = 'approved'
      )
    WHERE id = NEW.product_id;
  END IF;
  
  -- Handle review deletion
  IF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
    UPDATE products
    SET 
      rating = (
        SELECT COALESCE(AVG(rating::DECIMAL), 0)
        FROM reviews
        WHERE product_id = OLD.product_id AND status = 'approved'
      ),
      review_count = (
        SELECT COUNT(*)
        FROM reviews
        WHERE product_id = OLD.product_id AND status = 'approved'
      )
    WHERE id = OLD.product_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update product rating when review status changes
DROP TRIGGER IF EXISTS trigger_update_product_rating ON reviews;
CREATE TRIGGER trigger_update_product_rating
  AFTER INSERT OR UPDATE OF status OR DELETE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION update_product_rating();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on reviews table
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Reviews are viewable by everyone when approved" ON reviews;
DROP POLICY IF EXISTS "Users can view own reviews" ON reviews;
DROP POLICY IF EXISTS "Users can create own reviews" ON reviews;
DROP POLICY IF EXISTS "Admins can manage all reviews" ON reviews;

-- Reviews: Anyone can view approved reviews
CREATE POLICY "Reviews are viewable by everyone when approved"
  ON reviews FOR SELECT
  USING (status = 'approved');

-- Users can view their own reviews regardless of status
CREATE POLICY "Users can view own reviews"
  ON reviews FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create reviews
CREATE POLICY "Users can create own reviews"
  ON reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Admins can manage all reviews
CREATE POLICY "Admins can manage all reviews"
  ON reviews FOR ALL
  USING (is_admin(auth.uid()));
