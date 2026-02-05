-- ============================================
-- ADD PROFILE FIELDS FOR PERSONAL INFORMATION
-- ============================================
-- Migration to add additional fields to profiles table for comprehensive user profile management

-- Add date of birth
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add first name and last name (separate from full_name)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100);

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100);

-- Add gender
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS gender VARCHAR(20) CHECK (gender IN ('Male', 'Female', 'Other', 'Prefer not to say'));

-- Add address fields
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS address TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS city VARCHAR(100);

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS state VARCHAR(100);

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS country VARCHAR(100) DEFAULT 'Nigeria';

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS zip_code VARCHAR(20);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_country ON profiles(country);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_state ON profiles(state);

-- Add comments for documentation
COMMENT ON COLUMN profiles.date_of_birth IS 'User date of birth';
COMMENT ON COLUMN profiles.first_name IS 'User first name';
COMMENT ON COLUMN profiles.last_name IS 'User last name';
COMMENT ON COLUMN profiles.gender IS 'User gender: Male, Female, Other, Prefer not to say';
COMMENT ON COLUMN profiles.address IS 'User street address';
COMMENT ON COLUMN profiles.city IS 'User city';
COMMENT ON COLUMN profiles.state IS 'User state/province';
COMMENT ON COLUMN profiles.country IS 'User country (default: Nigeria)';
COMMENT ON COLUMN profiles.zip_code IS 'User postal/zip code';
