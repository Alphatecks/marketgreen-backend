-- ============================================
-- ADD SUBTITLE COLUMN TO NOTIFICATIONS
-- ============================================
-- Add subtitle field to notifications table for message composition UI
ALTER TABLE notifications 
ADD COLUMN IF NOT EXISTS subtitle VARCHAR(255);

-- Add index for subtitle if needed
CREATE INDEX IF NOT EXISTS idx_notifications_subtitle ON notifications(subtitle) WHERE subtitle IS NOT NULL;
