-- Migration: Add 'Fresh' category to product_categories CHECK constraint
-- This updates the existing constraint to include 'Fresh' category

-- Drop the existing constraint
ALTER TABLE product_categories 
DROP CONSTRAINT IF EXISTS product_categories_category_check;

-- Add the updated constraint with 'Fresh' included
ALTER TABLE product_categories 
ADD CONSTRAINT product_categories_category_check 
CHECK (category IN (
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
  'Fresh',
  'Others', 
  'Uncategorized'
));
