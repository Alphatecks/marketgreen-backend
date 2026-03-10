-- Migration: Add tracking_url and carrier to orders table
-- Use with GET /api/orders (list) and GET /api/orders/:id (detail) for "Track Package" link.
-- tracking_number is added by add_tracking_number.sql.

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS tracking_url TEXT,
ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);

COMMENT ON COLUMN orders.tracking_url IS 'Full URL to open in browser to track this order (e.g. DHL, NIPOST)';
COMMENT ON COLUMN orders.carrier IS 'Carrier code e.g. dhl, nipost, fedex – used if frontend builds tracking URL';
