# Database Setup Guide

This guide will help you set up the MarketGreen database schema in your Supabase project.

## 📋 Prerequisites

- A Supabase account and project
- Access to your Supabase SQL Editor

## 🗄️ Database Schema

The database schema is optimized for a grocery and fresh fruits e-commerce platform with the following features:

### Tables

1. **products** - Grocery items and fresh fruits with categories, stock tracking, and metadata
2. **profiles** - User profiles extending Supabase auth.users
3. **orders** - Order management with comprehensive status tracking
4. **order_items** - Detailed order line items (optional but recommended)

### Key Features

- ✅ Row Level Security (RLS) policies for data protection
- ✅ Auto-generated order numbers
- ✅ Automatic timestamp updates
- ✅ Indexes optimized for dashboard queries
- ✅ Views for daily sales summaries
- ✅ Support for grocery-specific attributes (weight, unit, organic, expiry dates)

## 🚀 Setup Instructions

### Step 1: Access Supabase SQL Editor

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 2: Run the Schema

1. Open the `database/schema.sql` file
2. Copy the entire SQL script
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press `Ctrl/Cmd + Enter`)

The script will:
- Create all necessary tables
- Set up indexes for performance
- Create triggers for automatic updates
- Configure Row Level Security policies
- Create helpful views for reporting

### Step 3: Create an Admin User

After setting up the schema, you need to create an admin profile:

```sql
-- First, create a user through Supabase Auth (if not already exists)
-- Then update their profile to have admin role:

UPDATE profiles
SET role = 'admin'
WHERE id = 'YOUR_USER_ID_HERE';

-- Or if the profile doesn't exist yet, insert it:
INSERT INTO profiles (id, username, role)
VALUES ('YOUR_USER_ID_HERE', 'admin_username', 'admin');
```

**To get your user ID:**
1. Go to **Authentication** → **Users** in Supabase dashboard
2. Copy the UUID of your user
3. Replace `YOUR_USER_ID_HERE` in the query above

## 📊 Dashboard Metrics

The database schema supports all the dashboard metrics shown in the admin panel:

### Total Sales
- Calculated from orders with status: `confirmed`, `shipped`, `delivered`
- Supports time period comparisons (last 7 days, 30 days, etc.)

### Total Orders
- Count of all orders within the specified time period
- Includes all order statuses

### Pending & Canceled
- Pending orders: orders with status `pending`
- Canceled orders: orders with status `canceled`
- Supports tracking changes over time

## 🔒 Security

### Row Level Security (RLS)

The schema includes comprehensive RLS policies:

- **Products**: Viewable by everyone, editable by admins only
- **Profiles**: Users can view/update their own profile, admins can view all
- **Orders**: Users can view their own orders, admins can view/update all
- **Order Items**: Users can view items from their orders, admins can view all

### Admin Access

To access admin endpoints:
1. User must be authenticated (valid JWT token)
2. User's profile must have `role = 'admin'`

## 📈 API Endpoints

Once the database is set up, you can use these admin endpoints:

- `GET /api/admin/dashboard/stats` - Get dashboard statistics
- `GET /api/admin/dashboard/orders` - Get order list with filters
- `GET /api/admin/dashboard/sales-breakdown` - Get sales breakdown by date range

All admin endpoints require:
- `Authorization: Bearer <token>` header
- User must have admin role

## 🧪 Testing the Setup

After running the schema, you can verify it worked:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('products', 'orders', 'profiles', 'order_items');

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('products', 'orders', 'profiles', 'order_items');

-- Check if views exist
SELECT viewname 
FROM pg_views 
WHERE schemaname = 'public' 
AND viewname IN ('daily_sales_summary', 'order_status_summary');
```

## 📝 Order Status Values

The orders table uses these status values:

- `pending` - Order placed but not yet confirmed
- `processing` - Order is being prepared
- `confirmed` - Order confirmed and ready
- `shipped` - Order has been shipped
- `delivered` - Order delivered to customer
- `canceled` - Order canceled
- `refunded` - Order refunded

Only orders with status `confirmed`, `shipped`, or `delivered` are counted in sales calculations.

## 🔧 Troubleshooting

### Issue: "relation does not exist"
- **Solution**: Make sure you ran the entire schema.sql script

### Issue: "permission denied"
- **Solution**: Check RLS policies and ensure your user has the correct role

### Issue: "duplicate key value violates unique constraint"
- **Solution**: The schema uses `CREATE TABLE IF NOT EXISTS`, so existing tables won't cause errors

### Issue: Admin endpoints return 403
- **Solution**: Verify your user's profile has `role = 'admin'`

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
