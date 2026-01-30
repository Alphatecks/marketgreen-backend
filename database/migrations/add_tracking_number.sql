-- Migration: Add tracking_number field to orders table
-- This migration adds a tracking_number field that will be auto-generated when an order is created

-- Add tracking_number column to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(50) UNIQUE;

-- Create index for faster lookups by tracking number
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON orders(tracking_number) WHERE tracking_number IS NOT NULL;

-- Function to generate unique tracking number
-- Format: TRK-YYYY-XXXXXX (e.g., TRK-2024-001234)
CREATE OR REPLACE FUNCTION generate_tracking_number()
RETURNS TRIGGER AS $$
DECLARE
  year_part TEXT;
  sequence_num INTEGER;
BEGIN
  -- Only generate if tracking_number is not already set
  IF NEW.tracking_number IS NULL THEN
    year_part := TO_CHAR(NOW(), 'YYYY');
    
    -- Get the next sequence number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(tracking_number FROM '\d+$') AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM orders
    WHERE tracking_number LIKE 'TRK-' || year_part || '-%';
    
    NEW.tracking_number := 'TRK-' || year_part || '-' || LPAD(sequence_num::TEXT, 6, '0');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate tracking number on order creation
DROP TRIGGER IF EXISTS set_tracking_number ON orders;
CREATE TRIGGER set_tracking_number
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION generate_tracking_number();
