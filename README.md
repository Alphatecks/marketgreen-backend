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
   
   # Gmail Configuration (for welcome emails)
   GMAIL_USER=your-company-email@gmail.com
   GMAIL_APP_PASSWORD=your-gmail-app-password
   COMPANY_NAME=MarketGreen
   ```
   
   **Note:** For Gmail, you need to use an [App Password](https://support.google.com/accounts/answer/185833) instead of your regular password. See the [Email Configuration](#-email-configuration) section below for detailed setup instructions.

3. **Run the development server:**
   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:3000`

## 📧 Email Configuration

The application sends welcome emails to newly registered users using Gmail. To set this up:

### Gmail App Password Setup

1. **Enable 2-Step Verification** on your Google Account:
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable 2-Step Verification if not already enabled

2. **Generate an App Password**:
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" as the app and "Other (Custom name)" as the device
   - Enter "MarketGreen Backend" as the custom name
   - Click "Generate"
   - Copy the 16-character password (spaces will be ignored)

3. **Add to Environment Variables**:
   ```env
   GMAIL_USER=your-company-email@gmail.com
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   COMPANY_NAME=MarketGreen
   ```

4. **Test the Configuration**:
   The email service will automatically attempt to send welcome emails when users register. Check your server logs to verify emails are being sent successfully.

**Important Notes:**
- Use the App Password (not your regular Gmail password)
- The App Password is a 16-character code (you can ignore spaces)
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
   - `GMAIL_USER` (your company Gmail address)
   - `GMAIL_APP_PASSWORD` (Gmail App Password - see Email Configuration section)
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

