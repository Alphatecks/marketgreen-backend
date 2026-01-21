-- Migration: Add new product fields to support comprehensive product management
-- This migration adds all fields required for the admin product creation form

-- Add slug column (unique, URL-friendly identifier)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

-- Create unique index on slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_slug ON products(slug) WHERE slug IS NOT NULL;

-- Add original_price column (for discount calculations)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS original_price DECIMAL(10, 2);

-- Add discount_percentage column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5, 2) CHECK (discount_percentage >= 0 AND discount_percentage <= 100);

-- Add short_description column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Add badge column with enum constraint
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS badge VARCHAR(20) DEFAULT 'none' 
CHECK (badge IN ('none', 'new', 'hot', 'sell-25', 'sale'));

-- Rename image_url to main_image (add new column, migrate data, then drop old)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS main_image TEXT;

-- Migrate existing image_url data to main_image
UPDATE products 
SET main_image = image_url 
WHERE main_image IS NULL AND image_url IS NOT NULL;

-- Add additional_images column (JSONB array, max 4 images)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS additional_images JSONB DEFAULT '[]'::jsonb;

-- Add rating column (0-5 scale)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 2) DEFAULT 0 
CHECK (rating >= 0 AND rating <= 5);

-- Add review_count column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0 CHECK (review_count >= 0);

-- Add stock_status column with enum constraint
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_status VARCHAR(20) DEFAULT 'In Stock' 
CHECK (stock_status IN ('In Stock', 'Out of Stock', 'Low Stock'));

-- Add product_status column (replaces/extends status field)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS product_status VARCHAR(20) DEFAULT 'Draft' 
CHECK (product_status IN ('Active', 'Draft', 'Archived'));

-- Migrate existing status to product_status
-- Map: 'active' -> 'Active', 'inactive' -> 'Draft', 'out_of_stock' -> 'Draft'
UPDATE products 
SET product_status = CASE 
  WHEN status = 'active' THEN 'Active'
  WHEN status = 'inactive' THEN 'Draft'
  WHEN status = 'out_of_stock' THEN 'Draft'
  ELSE 'Draft'
END
WHERE product_status IS NULL;

-- Add featured column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false;

-- Add weight_string column (for string weight like "1kg", "500g")
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS weight_string VARCHAR(100);

-- Add dimensions column
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100);

-- Add tags column (JSONB array of strings)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Add current_price column (alias for price, for clarity)
-- Keep price column for backward compatibility
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS current_price DECIMAL(10, 2);

-- Migrate existing price to current_price
UPDATE products 
SET current_price = price 
WHERE current_price IS NULL AND price IS NOT NULL;

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_product_status ON products(product_status);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON products(stock_status);
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_products_rating ON products(rating);

-- Add comment to document the migration
COMMENT ON COLUMN products.slug IS 'URL-friendly product identifier, auto-generated from name if not provided';
COMMENT ON COLUMN products.original_price IS 'Original price before discount';
COMMENT ON COLUMN products.current_price IS 'Current selling price (alias for price)';
COMMENT ON COLUMN products.discount_percentage IS 'Discount percentage, auto-calculated from original_price and current_price';
COMMENT ON COLUMN products.badge IS 'Product badge type: none, new, hot, sell-25, sale';
COMMENT ON COLUMN products.main_image IS 'Primary product image URL';
COMMENT ON COLUMN products.additional_images IS 'Array of additional product image URLs (max 4)';
COMMENT ON COLUMN products.rating IS 'Product rating (0.0 to 5.0)';
COMMENT ON COLUMN products.stock_status IS 'Current stock status: In Stock, Out of Stock, Low Stock';
COMMENT ON COLUMN products.product_status IS 'Product publication status: Active, Draft, Archived';
COMMENT ON COLUMN products.featured IS 'Whether product is featured in featured section';
COMMENT ON COLUMN products.tags IS 'Array of product tags for search/filtering';
