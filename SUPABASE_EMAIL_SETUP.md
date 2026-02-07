# Supabase Email Configuration Guide

## Problem
Supabase sends a confirmation email by default when users sign up, which can conflict with or hide your custom welcome email.

## Solution Options

### Option 1: Disable Email Confirmation (Recommended for Immediate Access)

This allows users to sign up and immediately access the platform, while still receiving your custom welcome email.

**Steps:**
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Settings** → **Email Auth**
3. Find **"Enable email confirmations"** toggle
4. **Turn it OFF** (disable email confirmations)
5. Save changes

**Pros:**
- Users can sign up and login immediately
- Your welcome email is the only email they receive
- Simpler user experience

**Cons:**
- No email verification (users can sign up with any email)

---

### Option 2: Keep Email Confirmation + Send Welcome Email After Confirmation

This keeps email verification but sends your welcome email after the user confirms their email.

**Steps:**

1. **Keep email confirmation enabled** in Supabase Dashboard
2. **Set up a Supabase Webhook** to trigger after email confirmation:
   - Go to **Database** → **Webhooks** in Supabase Dashboard
   - Create a new webhook
   - Event: `auth.users` table, `UPDATE` operation
   - Filter: `email_confirmed_at IS NOT NULL AND email_confirmed_at = updated_at`
   - URL: Your backend endpoint (see below)

3. **Create a webhook endpoint** in your backend to send welcome email after confirmation

   The webhook endpoint is already created at: `POST /api/auth/webhook/email-confirmed`
   
   **Webhook Configuration in Supabase:**
   - URL: `https://your-backend-url.com/api/auth/webhook/email-confirmed`
   - Event: `auth.users` table
   - Operation: `UPDATE`
   - Filter: `email_confirmed_at IS NOT NULL`

---

### Option 3: Auto-Confirm Email (Bypass Confirmation)

This automatically confirms emails during signup, so users can login immediately and receive welcome email.

**Implementation:**
Modify the signup route to use the admin client to auto-confirm the email.

**Note:** This requires using `SUPABASE_SERVICE_ROLE_KEY` instead of the anon key.

---

## Recommended: Option 1 (Disable Email Confirmation)

For most e-commerce platforms, disabling email confirmation provides the best user experience:
- Users can start shopping immediately
- Your branded welcome email is the first (and only) email they receive
- Reduces friction in the signup process

If you need email verification for security, use Option 2 with webhooks.
