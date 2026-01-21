-- ============================================
-- AUTHENTICATION SETUP SQL
-- ============================================
-- This file contains SQL code specific to authentication and user management
-- Run this after the main schema.sql file

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- UPDATE PROFILES TABLE FOR AUTH
-- ============================================
-- Add email and marketing_emails columns if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS marketing_emails BOOLEAN DEFAULT false;

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email) WHERE email IS NOT NULL;

-- ============================================
-- FUNCTION: Auto-create profile on user signup
-- ============================================
-- This function automatically creates a profile when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_username TEXT;
  user_marketing_emails BOOLEAN;
  marketing_emails_val TEXT;
BEGIN
  -- Extract username from user metadata (stored during signup)
  user_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    SPLIT_PART(NEW.email, '@', 1) -- Fallback to email prefix
  );
  
  -- Extract marketing_emails value first
  marketing_emails_val := NEW.raw_user_meta_data->>'marketing_emails';
  
  -- Extract marketing_emails preference from user metadata
  user_marketing_emails := CASE 
    WHEN marketing_emails_val IS NULL THEN false
    WHEN LOWER(marketing_emails_val) = 'true' THEN true
    WHEN LOWER(marketing_emails_val) = 'false' THEN false
    ELSE false
  END;
  
  -- Insert into profiles table
  INSERT INTO public.profiles (
    id,
    username,
    email,
    marketing_emails,
    role,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    user_username,
    NEW.email,
    user_marketing_emails,
    'user',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE
  SET 
    email = EXCLUDED.email,
    marketing_emails = COALESCE(profiles.marketing_emails, EXCLUDED.marketing_emails),
    updated_at = NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Auto-create profile on user signup
-- ============================================
-- DROP existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger to automatically create profile when user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ============================================
-- FUNCTION: Update profile when user metadata changes
-- ============================================
CREATE OR REPLACE FUNCTION handle_user_update()
RETURNS TRIGGER AS $$
DECLARE
  marketing_emails_val TEXT;
BEGIN
  -- Extract marketing_emails value
  marketing_emails_val := NEW.raw_user_meta_data->>'marketing_emails';
  
  -- Update profile if username or marketing_emails changed in metadata
  IF (OLD.raw_user_meta_data->>'username') IS DISTINCT FROM (NEW.raw_user_meta_data->>'username') 
     OR (OLD.raw_user_meta_data->>'marketing_emails') IS DISTINCT FROM (NEW.raw_user_meta_data->>'marketing_emails')
     OR OLD.email IS DISTINCT FROM NEW.email THEN
    
    UPDATE public.profiles
    SET 
      username = COALESCE(
        NEW.raw_user_meta_data->>'username',
        profiles.username
      ),
      email = NEW.email,
      marketing_emails = CASE 
        WHEN marketing_emails_val IS NULL THEN profiles.marketing_emails
        WHEN LOWER(marketing_emails_val) = 'true' THEN true
        WHEN LOWER(marketing_emails_val) = 'false' THEN false
        ELSE COALESCE(profiles.marketing_emails, false)
      END,
      updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Update profile when user is updated
-- ============================================
DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_user_update();

-- ============================================
-- FUNCTION: Handle user deletion
-- ============================================
-- Profile will be automatically deleted due to CASCADE constraint
-- This function can be extended for additional cleanup logic

CREATE OR REPLACE FUNCTION handle_user_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Additional cleanup logic can be added here if needed
  -- For example: archive orders, delete related data, etc.
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATE RLS POLICIES FOR PROFILES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (in case trigger fails)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- HELPER VIEW: User profile with auth data
-- ============================================
-- This view combines auth.users and profiles for easier querying
CREATE OR REPLACE VIEW user_profiles_complete AS
SELECT 
  u.id,
  u.email,
  u.email_confirmed_at,
  u.created_at as auth_created_at,
  u.updated_at as auth_updated_at,
  p.username,
  p.full_name,
  p.avatar_url,
  p.phone,
  p.role,
  p.marketing_emails,
  p.created_at as profile_created_at,
  p.updated_at as profile_updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id;

-- Grant access to authenticated users
GRANT SELECT ON user_profiles_complete TO authenticated;

-- ============================================
-- HELPER FUNCTION: Get user profile by email
-- ============================================
CREATE OR REPLACE FUNCTION get_user_profile_by_email(user_email TEXT)
RETURNS TABLE (
  id UUID,
  email VARCHAR,
  username VARCHAR,
  full_name VARCHAR,
  avatar_url TEXT,
  phone VARCHAR,
  role VARCHAR,
  marketing_emails BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.email,
    p.username,
    p.full_name,
    p.avatar_url,
    p.phone,
    p.role,
    p.marketing_emails,
    p.created_at
  FROM public.profiles p
  WHERE p.email = user_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if email exists
-- ============================================
CREATE OR REPLACE FUNCTION check_email_exists(user_email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM auth.users 
    WHERE email = user_email
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- HELPER FUNCTION: Check if username exists
-- ============================================
CREATE OR REPLACE FUNCTION check_username_exists(user_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.profiles 
    WHERE username = user_username
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TESTING: Verify setup
-- ============================================
-- Run these queries to verify the setup:

-- Check if trigger exists
-- SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check if function exists
-- SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';

-- Check profiles table structure
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' 
-- ORDER BY ordinal_position;
