import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

// Import routes
import authRoutes from './routes/auth.routes.js'
import productRoutes from './routes/product.routes.js'
import userRoutes from './routes/user.routes.js'
import orderRoutes from './routes/order.routes.js'
import adminRoutes from './routes/admin.routes.js'
import paymentRoutes from './routes/payment.routes.js'
import couponRoutes from './routes/coupon.routes.js'
import promotionRoutes from './routes/promotion.routes.js'
import reviewRoutes from './routes/review.routes.js'
import cartRoutes from './routes/cart.routes.js'
import wishlistRoutes from './routes/wishlist.routes.js'
import activityRoutes from './routes/activity.routes.js'
import notificationRoutes from './routes/notification.routes.js'
import tagRoutes from './routes/tag.routes.js'
import { testEmailConnection } from './utils/emailService.js'

// Load environment variables
dotenv.config()


const app = express()
const PORT = process.env.PORT || 3000

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY


if (!supabaseUrl || !supabaseKey) {
  console.warn('Warning: Supabase credentials not found. Make sure to set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file')
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// Middleware
// IMPORTANT: Helmet must come before CORS. Helmet sets security headers but doesn't interfere with CORS headers.
app.use(helmet()) // Security headers

// CORS configuration
// NOTE: We don't use cookies or auth headers from the browser, so it's safe to allow all origins.
// This avoids subtle CORS origin mismatches between Render, custom domains, and local dev.
app.use(cors({
  origin: '*', // Allow all origins (localhost, production domain, etc.)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // Must be false when origin is '*'
  optionsSuccessStatus: 200 // Some legacy browsers (IE11) choke on 204
}))
app.use(morgan('dev')) // Logging

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`)
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get('/health', async (req, res) => {
  const emailConfigured = !!process.env.RESEND_API_KEY
  let emailConnectionStatus = 'not configured'
  
  if (emailConfigured) {
    try {
      const isConnected = await testEmailConnection()
      emailConnectionStatus = isConnected ? 'connected' : 'connection failed'
    } catch (error) {
      emailConnectionStatus = 'error: ' + error.message
    }
  }
  
  res.status(200).json({
    status: 'OK',
    message: 'MarketGreen API is running',
    timestamp: new Date().toISOString(),
    services: {
      email: {
        configured: emailConfigured,
        status: emailConnectionStatus
      }
    }
  })
})

// Paystack callback redirect handler
// This catches Paystack redirects and forwards them to the frontend
app.get('/payment/callback', (req, res) => {
  const { reference, trxref } = req.query
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
  const paymentRef = reference || trxref || ''
  
  // Redirect to frontend callback page with reference
  const redirectUrl = paymentRef 
    ? `${frontendUrl}/payment/callback?reference=${paymentRef}`
    : `${frontendUrl}/payment/callback`
  
  res.redirect(redirectUrl)
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/users', userRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/coupons', couponRoutes)
app.use('/api/promotions', promotionRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/cart', cartRoutes)
app.use('/api/wishlist', wishlistRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/tags', tagRoutes)

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  })
})

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  })
})

// Start server
app.listen(PORT, async () => {
  console.log(`🚀 MarketGreen API server running on port ${PORT}`)
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔗 Health check: http://localhost:${PORT}/health`)
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set (defaulting to localhost:5173)'}`)
  console.log(`✅ CORS allowed origins: All (development mode)`)
  console.log(`🔑 Supabase URL configured: ${!!process.env.SUPABASE_URL}`)
  console.log(`🔑 Supabase Key configured: ${!!process.env.SUPABASE_ANON_KEY}`)
  
  // Check email configuration
  const emailConfigured = !!process.env.RESEND_API_KEY
  if (emailConfigured) {
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.COMPANY_EMAIL || 'onboarding@resend.dev'
    console.log(`📧 Resend API Key configured: ${process.env.RESEND_API_KEY.substring(0, 7)}***`)
    console.log(`📧 Resend From Email: ${fromEmail}`)
    try {
      const isConnected = await testEmailConnection()
      if (isConnected) {
        console.log(`📧 ✅ Email service: Connected and ready`)
      } else {
        console.log(`📧 ⚠️  Email service: Configuration present but connection failed`)
      }
    } catch (error) {
      console.log(`📧 ❌ Email service: Connection error - ${error.message}`)
    }
  } else {
    console.log(`📧 ⚠️  Email service: Not configured (RESEND_API_KEY missing)`)
    console.log(`📧    Welcome emails will not be sent. Set RESEND_API_KEY environment variable to enable.`)
  }
})

export default app

