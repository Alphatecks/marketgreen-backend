# MarketGreen Backend API

Backend API for the MarketGreen e-commerce platform, built with Express.js, Supabase, and deployed on Render.

## 🚀 Features

- User authentication (register, login, logout)
- Welcome email notifications for new users
- Product management (CRUD operations)
- User profile management
- Order management
- RESTful API design
- Supabase integration for database and auth
- CORS enabled for frontend integration
- Security headers with Helmet
- Request logging with Morgan

## 📋 Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Supabase account and project

## 🛠️ Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Supabase credentials:
   ```env
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   FRONTEND_URL=http://localhost:5173
   PORT=3000
   
   # Resend Configuration (for welcome emails)
   RESEND_API_KEY=re_your_resend_api_key
   RESEND_FROM_EMAIL=noreply@yourdomain.com
   COMPANY_NAME=MarketGreen
   COMPANY_EMAIL=support@yourdomain.com
   ```
   
   **Note:** You need a Resend account and API key. See the [Email Configuration](#-email-configuration) section below for detailed setup instructions.

3. **Run the development server:**
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:3000`

## 📧 Email Configuration

The application sends welcome emails to newly registered users using Resend. 

**⚠️ Important:** Supabase sends email confirmation emails by default, which can conflict with your welcome email. See [SUPABASE_EMAIL_SETUP.md](./SUPABASE_EMAIL_SETUP.md) for configuration options.

To set up Resend email sending:

### Resend Setup

1. **Create a Resend Account**:
   - Go to [Resend](https://resend.com) and sign up for an account
   - Verify your email address

2. **Get Your API Key**:
   - Navigate to the [API Keys](https://resend.com/api-keys) section in your dashboard
   - Click "Create API Key"
   - Give it a name (e.g., "MarketGreen Backend")
   - Copy the API key (starts with `re_`)

3. **Verify Your Domain** (Recommended for Production):
   - Go to [Domains](https://resend.com/domains) in your dashboard
   - Add and verify your domain
   - This allows you to send from your own domain (e.g., `noreply@yourdomain.com`)
   - For testing, you can use `onboarding@resend.dev` (default)

4. **Add to Environment Variables**:
   ```env
   RESEND_API_KEY=re_your_resend_api_key
   RESEND_FROM_EMAIL=noreply@yourdomain.com
   COMPANY_NAME=MarketGreen
   COMPANY_EMAIL=support@yourdomain.com
   ```

5. **Test the Configuration**:
   The email service will automatically attempt to send welcome emails when users register. Check your server logs to verify emails are being sent successfully.

**Important Notes:**
- For production, use a verified domain email address in `RESEND_FROM_EMAIL`
- For testing, you can use `onboarding@resend.dev` (default if `RESEND_FROM_EMAIL` is not set)
- If email sending fails, the user registration will still succeed (emails are sent asynchronously)
- Welcome emails are sent automatically when a new user signs up via `/api/auth/signup`

## 📡 API Endpoints

### Health Check
- `GET /health` - Check API status

### Authentication
- `POST /api/auth/signup` - Sign up new user (with password validation)
  - Body: `{ email, username, password, marketingEmails? }`
  - Validates password requirements (8+ chars, uppercase, lowercase, special char, number)
- `POST /api/auth/register` - Register new user (alias, backward compatibility)
- `POST /api/auth/login` - Login user
  - Body: `{ email, password }`
  - Returns: User data, session tokens, and profile information
  - Validates email format and handles various error scenarios
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Products
- `GET /api/products` - Get all products
- `GET /api/products/:id` - Get single product
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)
- `DELETE /api/products/:id` - Delete product (admin)

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile

### Orders
- `GET /api/orders` - Get user's orders
- `GET /api/orders/:id` - Get single order
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id/status` - Update order status (admin)

## 🗄️ Supabase Database Schema

You'll need to create the following tables in your Supabase project:

### Products Table
```sql
CREATE TABLE products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url TEXT,
  category VARCHAR(100),
  stock INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Profiles Table
```sql
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  username VARCHAR(100),
  full_name VARCHAR(255),
  avatar_url TEXT,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Orders Table
```sql
CREATE TABLE orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  shipping_address JSONB,
  items JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🚢 Deployment on Render

1. **Connect your repository** to Render
2. **Create a new Web Service**
3. **Configure the service:**
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment: Node
4. **Add environment variables** in Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL` (your frontend URL)
   - `RESEND_API_KEY` (your Resend API key - see Email Configuration section)
   - `RESEND_FROM_EMAIL` (your verified domain email address)
   - `COMPANY_EMAIL` (optional, for support contact)
   - `COMPANY_NAME` (optional, defaults to "MarketGreen")
   - `NODE_ENV=production`
   - `PORT=3000` (Render sets this automatically)

Alternatively, you can use the `render.yaml` file for infrastructure as code.

## 🔒 Security Notes

- Always use environment variables for sensitive data
- Never commit `.env` file to version control
- Use Supabase Row Level Security (RLS) policies
- Implement rate limiting in production
- Use HTTPS in production

## 📝 License

ISC

