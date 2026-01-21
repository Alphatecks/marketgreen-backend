# Authentication SQL Setup Guide

This guide explains how to set up the authentication SQL code for the MarketGreen backend API.

## 📋 Overview

The `auth.sql` file contains SQL code that:
- Automatically creates user profiles when users sign up
- Syncs user data between `auth.users` and `profiles` tables
- Provides helper functions for email/username validation
- Sets up Row Level Security (RLS) policies for profiles

## 🚀 Setup Instructions

### Step 1: Run the Main Schema

First, run the main `schema.sql` file in your Supabase SQL Editor.

### Step 2: Run the Auth SQL

1. Open the `database/auth.sql` file
2. Copy the entire SQL script
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press `Ctrl/Cmd + Enter`)

## 🔧 What This SQL Does

### 1. Updates Profiles Table

Adds missing columns to the `profiles` table:
- `email` - User's email address (synced from auth.users)
- `marketing_emails` - Marketing emails preference

### 2. Auto-Create Profile Trigger

Creates a trigger that automatically creates a profile when a new user signs up:

```sql
-- Trigger: on_auth_user_created
-- Function: handle_new_user()
```

**What it does:**
- Extracts username from user metadata (or uses email prefix as fallback)
- Extracts marketing_emails preference
- Creates a profile record automatically
- No need to manually create profiles in your backend code

### 3. Update Profile Trigger

Creates a trigger that updates profiles when user metadata changes:

```sql
-- Trigger: on_auth_user_updated
-- Function: handle_user_update()
```

**What it does:**
- Syncs username from user metadata
- Syncs email when it changes
- Updates marketing_emails preference

### 4. Helper Functions

#### `get_user_profile_by_email(user_email TEXT)`
Returns user profile data by email address.

#### `check_email_exists(user_email TEXT)`
Returns true if email already exists in the system.

#### `check_username_exists(user_username TEXT)`
Returns true if username already exists.

### 5. Helper View

#### `user_profiles_complete`
A view that combines `auth.users` and `profiles` for easier querying.

## 📊 How It Works with Your API

### Signup Flow

1. User signs up via `POST /api/auth/signup`
2. Supabase creates user in `auth.users` table
3. **Trigger automatically fires** → `handle_new_user()`
4. Profile is created in `profiles` table automatically
5. API returns user data

**Note:** Your backend code also tries to create a profile, but if it fails, the trigger ensures it's created anyway.

### Login Flow

1. User logs in via `POST /api/auth/login`
2. Supabase authenticates the user
3. API fetches profile from `profiles` table
4. Returns user data with profile information

## 🔒 Security

### Row Level Security (RLS)

The SQL sets up RLS policies that allow:
- Users to view/update their own profile
- Admins to view/update all profiles
- Users to insert their own profile (fallback if trigger fails)

### Function Security

All trigger functions use `SECURITY DEFINER` which allows them to:
- Bypass RLS policies
- Access `auth.users` table directly
- Perform operations on behalf of the system

## 🧪 Testing

After running the SQL, verify the setup:

```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check if function exists
SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';

-- Check profiles table structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
ORDER BY ordinal_position;

-- Test email existence check
SELECT check_email_exists('test@example.com');

-- Test username existence check
SELECT check_username_exists('testuser');
```

## 🔄 Migration Notes

If you already have existing users:

1. **Run the auth.sql file** - It's safe to run multiple times
2. **Sync existing users** - Run this to create profiles for existing users:

```sql
-- Create profiles for existing auth.users that don't have profiles
INSERT INTO public.profiles (id, username, email, role, created_at, updated_at)
SELECT 
  u.id,
  COALESCE(
    u.raw_user_meta_data->>'username',
    SPLIT_PART(u.email, '@', 1)
  ) as username,
  u.email,
  COALESCE(
    (u.raw_user_meta_data->>'marketing_emails')::BOOLEAN,
    false
  ) as marketing_emails,
  'user' as role,
  u.created_at,
  u.updated_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;
```

## 🐛 Troubleshooting

### Issue: Profile not created automatically

**Check:**
1. Is the trigger enabled?
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

2. Check trigger function:
   ```sql
   SELECT proname, prosrc FROM pg_proc WHERE proname = 'handle_new_user';
   ```

### Issue: Email column doesn't exist

**Solution:** The `auth.sql` file adds the column automatically. If you see this error, make sure you ran the `auth.sql` file after the main `schema.sql`.

### Issue: Duplicate profile creation

**Note:** The trigger and your backend code might both try to create a profile. This is fine because:
- The trigger uses `ON CONFLICT DO UPDATE` to handle duplicates
- Your backend code checks for errors and continues even if profile creation fails

## 📚 Related Files

- `database/schema.sql` - Main database schema
- `routes/auth.routes.js` - Authentication API routes
- `utils/validation.js` - Validation utilities

## ✅ Checklist

After running the SQL, verify:

- [ ] Trigger `on_auth_user_created` exists
- [ ] Function `handle_new_user()` exists
- [ ] Profile table has `email` column
- [ ] Profile table has `marketing_emails` column
- [ ] RLS policies are set up correctly
- [ ] Test signup creates profile automatically
- [ ] Test login retrieves profile correctly
