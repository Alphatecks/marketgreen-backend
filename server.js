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

// Load environment variables
dotenv.config()

// #region agent log
fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:15',message:'Server startup - env vars check',data:{hasSupabaseUrl:!!process.env.SUPABASE_URL,hasSupabaseKey:!!process.env.SUPABASE_ANON_KEY,hasFrontendUrl:!!process.env.FRONTEND_URL,port:process.env.PORT,nodeEnv:process.env.NODE_ENV},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion

const app = express()
const PORT = process.env.PORT || 3000

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

// #region agent log
fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:24',message:'Supabase client init - before check',data:{supabaseUrlLength:supabaseUrl?.length||0,supabaseKeyLength:supabaseKey?.length||0,supabaseUrlPrefix:supabaseUrl?.substring(0,20)||'undefined',supabaseKeyPrefix:supabaseKey?.substring(0,10)||'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
// #endregion

if (!supabaseUrl || !supabaseKey) {
  console.warn('Warning: Supabase credentials not found. Make sure to set SUPABASE_URL and SUPABASE_ANON_KEY in your .env file')
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:26',message:'WARNING: Missing Supabase credentials',data:{hasSupabaseUrl:!!supabaseUrl,hasSupabaseKey:!!supabaseKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'server.js:50',message:'Incoming request',data:{method:req.method,path:req.path,origin:req.headers.origin,userAgent:req.headers['user-agent']?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
  // #endregion
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`)
  next()
})

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'MarketGreen API is running',
    timestamp: new Date().toISOString()
  })
})

// API Routes
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/users', userRoutes)
app.use('/api/orders', orderRoutes)

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
app.listen(PORT, () => {
  console.log(`🚀 MarketGreen API server running on port ${PORT}`)
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🔗 Health check: http://localhost:${PORT}/health`)
  console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set (defaulting to localhost:5173)'}`)
  console.log(`✅ CORS allowed origins: All (development mode)`)
  console.log(`🔑 Supabase URL configured: ${!!process.env.SUPABASE_URL}`)
  console.log(`🔑 Supabase Key configured: ${!!process.env.SUPABASE_ANON_KEY}`)
})

export default app

