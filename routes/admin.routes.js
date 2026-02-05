import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { validateEmail } from '../utils/validation.js'
import {
  validateProductData,
  generateSlug,
  calculateDiscount,
  determineStockStatus,
  validateCategories,
  ALLOWED_CATEGORIES
} from '../utils/productValidation.js'
import { convertProductFields } from '../utils/fieldConverter.js'

const router = express.Router()

// Helper function to normalize image fields in product responses
// Ensures main_image and image_url are always synchronized
const normalizeProductImages = (product) => {
  if (!product) return product
  
  // Prioritize main_image over image_url
  const imageUrl = product.main_image || product.image_url || null
  
  // Ensure both fields have the same value
  return {
    ...product,
    main_image: imageUrl,
    image_url: imageUrl
  }
}

// Helper function to normalize image fields in an array of products
const normalizeProductsImages = (products) => {
  if (!Array.isArray(products)) return products
  return products.map(normalizeProductImages)
}

// Middleware to check if user is admin
const checkAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Check if user is admin using admin client to bypass RLS (avoids infinite recursion)
    // The admin client bypasses RLS policies, preventing the circular dependency
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Service role key not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY must be set to check admin status'
      })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    req.user = user
    next()
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
}

// Helper function to calculate percentage change
const calculatePercentageChange = (current, previous) => {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0
  }
  return ((current - previous) / previous) * 100
}

// Format number with K suffix for thousands
const formatNumber = (num) => {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K'
  }
  return num.toString()
}

// Format currency
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

// Static admin credentials
const STATIC_ADMIN_EMAIL = 'admin@maketgreen.shop'
const STATIC_ADMIN_PASSWORD = 'marketshop02@'

// Admin Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        field: !email ? 'email' : 'password'
      })
    }

    // Check static admin credentials first
    const normalizedEmail = email.trim().toLowerCase()
    const isStaticAdmin = normalizedEmail === STATIC_ADMIN_EMAIL.toLowerCase() && password === STATIC_ADMIN_PASSWORD

    // Validate email format (skip for static admin if needed)
    if (!isStaticAdmin) {
      const emailValidation = validateEmail(email)
      if (!emailValidation.isValid) {
        return res.status(400).json({ 
          error: emailValidation.error,
          field: 'email'
        })
      }
    }

    // Attempt login with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password
    })

    // If static admin credentials are used but Supabase auth fails,
    // still allow them (they might not be in Supabase yet)
    if (error && !isStaticAdmin) {
      // Handle specific error cases
      let errorMessage = 'Invalid email or password'
      let statusCode = 401

      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password'
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage = 'Please verify your email before logging in'
        statusCode = 403
      } else if (error.message.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please try again later'
        statusCode = 429
      } else {
        errorMessage = error.message
      }

      return res.status(statusCode).json({ 
        error: errorMessage,
        field: 'credentials'
      })
    }

    // Handle static admin login
    if (isStaticAdmin) {
      // If we have a session from Supabase, use it
      if (data?.session && data?.user) {
        // Check if profile exists and ensure it's admin
        let profile = null
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single()

        profile = existingProfile

        // If profile doesn't exist, create one with admin role
        if (!profile) {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              id: data.user.id,
              email: STATIC_ADMIN_EMAIL,
              username: 'admin',
              role: 'admin',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select()
            .single()
          
          profile = newProfile || {
            id: data.user.id,
            email: STATIC_ADMIN_EMAIL,
            username: 'admin',
            role: 'admin',
            full_name: 'Admin',
            avatar_url: null,
            phone: null
          }
        } else if (profile.role !== 'admin') {
          // Update role to admin if not already
          const { data: updatedProfile } = await supabase
            .from('profiles')
            .update({ role: 'admin' })
            .eq('id', data.user.id)
            .select()
            .single()
          
          if (updatedProfile) {
            profile = updatedProfile
          }
        }

        return res.json({
          message: 'Admin login successful',
          user: {
            id: data.user.id,
            email: STATIC_ADMIN_EMAIL,
            username: profile?.username || 'admin',
            full_name: profile?.full_name || 'Admin',
            avatar_url: profile?.avatar_url || null,
            role: 'admin',
            phone: profile?.phone || null
          },
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            expires_in: data.session.expires_in,
            token_type: data.session.token_type
          }
        })
      } else {
        // Static admin credentials correct but user doesn't exist in Supabase
        // Try to create the user using admin client
        if (!supabaseAdmin) {
          return res.status(500).json({
            error: 'Service role key not configured',
            message: 'Cannot create admin user. Please configure SUPABASE_SERVICE_ROLE_KEY in environment variables.'
          })
        }

        try {
          // Verify Supabase connection before attempting to create user
          // Use a lightweight check that doesn't require specific permissions
          const { data: healthCheck, error: healthError } = await supabaseAdmin
            .from('profiles')
            .select('count')
            .limit(1)
          
          if (healthError && !healthError.message.includes('permission') && !healthError.message.includes('relation')) {
            console.error('Supabase connection error:', healthError)
            return res.status(500).json({
              error: 'Failed to connect to database',
              message: healthError.message || 'Unable to reach Supabase. Please check your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY configuration.',
              details: process.env.NODE_ENV === 'development' ? {
                hasUrl: !!process.env.SUPABASE_URL,
                hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
                urlPrefix: process.env.SUPABASE_URL?.substring(0, 30) || 'not set'
              } : undefined
            })
          }

          // Create user using admin client (bypasses email confirmation)
          const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: STATIC_ADMIN_EMAIL,
            password: STATIC_ADMIN_PASSWORD,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
              username: 'admin',
              role: 'admin'
            }
          })

          if (createError) {
            console.error('Error creating admin user:', createError)
            return res.status(500).json({
              error: 'Failed to create admin user',
              message: createError.message || 'Unknown error occurred while creating user',
              code: createError.status || createError.code
            })
          }

          if (!newUserData?.user) {
            return res.status(500).json({
              error: 'Failed to create admin user',
              message: 'User creation returned no data'
            })
          }

          // Create profile with admin role
          const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .insert({
              id: newUserData.user.id,
              email: STATIC_ADMIN_EMAIL,
              username: 'admin',
              role: 'admin',
              full_name: 'Admin',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })

          if (profileError) {
            console.error('Error creating admin profile:', profileError)
            // Continue anyway, profile might be created by trigger
          }

          // Now login with the newly created user
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: STATIC_ADMIN_EMAIL,
            password: STATIC_ADMIN_PASSWORD
          })

          if (loginError || !loginData?.session) {
            return res.status(500).json({
              error: 'User created but login failed',
              message: 'Please try logging in again.'
            })
          }

          return res.json({
            message: 'Admin account created and login successful',
            user: {
              id: loginData.user.id,
              email: STATIC_ADMIN_EMAIL,
              username: 'admin',
              full_name: 'Admin',
              avatar_url: null,
              role: 'admin',
              phone: null
            },
            session: {
              access_token: loginData.session.access_token,
              refresh_token: loginData.session.refresh_token,
              expires_in: loginData.session.expires_in,
              token_type: loginData.session.token_type
            }
          })
        } catch (createUserError) {
          console.error('Error in admin user creation:', createUserError)
          
          // Handle specific error types
          let errorMessage = createUserError.message || 'Unknown error occurred'
          let errorDetails = {}
          
          if (errorMessage.includes('fetch failed') || errorMessage.includes('NetworkError')) {
            errorMessage = 'Network error: Unable to connect to Supabase. Please check your internet connection and Supabase configuration.'
            errorDetails = {
              suggestion: 'Verify that SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are correctly set in your environment variables.',
              hasUrl: !!process.env.SUPABASE_URL,
              hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
            }
          } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            errorMessage = 'Connection refused: Unable to reach Supabase server. Please verify your SUPABASE_URL.'
            errorDetails = {
              urlPrefix: process.env.SUPABASE_URL?.substring(0, 30) || 'not set'
            }
          } else if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            errorMessage = 'Authentication failed: Invalid SUPABASE_SERVICE_ROLE_KEY. Please verify your service role key.'
          }
          
          return res.status(500).json({
            error: 'Failed to create admin user',
            message: errorMessage,
            ...(Object.keys(errorDetails).length > 0 && { details: errorDetails }),
            ...(process.env.NODE_ENV === 'development' && { stack: createUserError.stack })
          })
        }
      }
    }

    // Regular admin login flow (non-static)
    if (!data.user) {
      return res.status(401).json({ 
        error: 'Authentication failed' 
      })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      return res.status(403).json({ 
        error: 'User profile not found. Please contact administrator.' 
      })
    }

    // Check if user is admin
    if (profile.role !== 'admin') {
      return res.status(403).json({ 
        error: 'Access denied. Admin privileges required.',
        message: 'This endpoint is only accessible to administrators.'
      })
    }

    // Success - return admin user data and session
    res.json({
      message: 'Admin login successful',
      user: {
        id: data.user.id,
        email: data.user.email,
        username: profile.username,
        full_name: profile.full_name,
        avatar_url: profile.avatar_url,
        role: profile.role,
        phone: profile.phone
      },
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in,
        token_type: data.session?.token_type
      }
    })
  } catch (error) {
    console.error('Admin login error:', error)
    res.status(500).json({ 
      error: 'An error occurred during admin login. Please try again.' 
    })
  }
})

// Get dashboard statistics
router.get('/dashboard/stats', checkAdmin, async (req, res) => {
  try {
    const { period = '7days' } = req.query

    // Parse period (default to 7 days)
    let days = 7
    if (period === '30days') days = 30
    if (period === '90days') days = 90

    const now = new Date()
    const endDate = new Date(now)
    endDate.setHours(23, 59, 59, 999) // End of today

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0) // Start of day

    const previousStartDate = new Date(startDate)
    previousStartDate.setDate(previousStartDate.getDate() - days)

    // ============================================
    // TOTAL SALES METRICS
    // ============================================
    // Last period sales (completed orders only) - use admin client to bypass RLS
    const { data: lastPeriodSales, error: lastPeriodSalesError } = await supabaseAdmin
      .from('orders')
      .select('total_amount')
      .in('status', ['confirmed', 'shipped', 'delivered'])
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Previous period sales
    const { data: previousPeriodSales, error: previousPeriodSalesError } = await supabaseAdmin
      .from('orders')
      .select('total_amount')
      .in('status', ['confirmed', 'shipped', 'delivered'])
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString())

    if (lastPeriodSalesError || previousPeriodSalesError) {
      return res.status(500).json({ 
        error: 'Error calculating sales metrics',
        details: lastPeriodSalesError?.message || previousPeriodSalesError?.message 
      })
    }

    const lastPeriodTotal = lastPeriodSales?.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0) || 0
    const previousPeriodTotal = previousPeriodSales?.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0) || 0
    const salesChange = calculatePercentageChange(lastPeriodTotal, previousPeriodTotal)

    // ============================================
    // TOTAL ORDERS METRICS
    // ============================================
    // Last period orders count - use admin client to bypass RLS
    const { count: lastPeriodOrdersCount, error: lastPeriodOrdersError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Previous period orders count
    const { count: previousPeriodOrdersCount, error: previousPeriodOrdersError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString())

    if (lastPeriodOrdersError || previousPeriodOrdersError) {
      return res.status(500).json({ 
        error: 'Error calculating orders metrics',
        details: lastPeriodOrdersError?.message || previousPeriodOrdersError?.message 
      })
    }

    const ordersChange = calculatePercentageChange(lastPeriodOrdersCount || 0, previousPeriodOrdersCount || 0)

    // ============================================
    // PENDING & CANCELED METRICS
    // ============================================
    // Get pending orders count - use admin client to bypass RLS
    const { count: pendingCount, error: pendingError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get canceled orders count
    const { count: canceledCount, error: canceledError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'canceled')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    if (pendingError || canceledError) {
      return res.status(500).json({ 
        error: 'Error calculating pending/canceled metrics',
        details: pendingError?.message || canceledError?.message 
      })
    }

    // Get previous period pending & canceled for change calculation - use admin client
    const { count: previousPendingCount, error: prevPendingError } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'canceled'])
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString())

    const { count: previousCanceledCount } = await supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'canceled')
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString())

    const currentPendingCanceled = (pendingCount || 0) + (canceledCount || 0)
    const previousPendingCanceled = (previousPendingCount || 0)
    const pendingCanceledChange = calculatePercentageChange(currentPendingCanceled, previousPendingCanceled)

    // Format period label
    const periodLabel = days === 7 ? 'Last 7 days' : days === 30 ? 'Last 30 days' : `Last ${days} days`
    const previousPeriodLabel = days === 7 ? 'Previous 7 days' : days === 30 ? 'Previous 30 days' : `Previous ${days} days`

    // Build response
    const dashboardStats = {
      period: {
        current: periodLabel,
        previous: previousPeriodLabel,
        days
      },
      totalSales: {
        value: lastPeriodTotal,
        formatted: formatCurrency(lastPeriodTotal),
        change: parseFloat(salesChange.toFixed(1)),
        changeType: salesChange >= 0 ? 'increase' : 'decrease',
        previousValue: previousPeriodTotal,
        previousFormatted: formatCurrency(previousPeriodTotal)
      },
      totalOrders: {
        value: lastPeriodOrdersCount || 0,
        formatted: formatNumber(lastPeriodOrdersCount || 0),
        change: parseFloat(ordersChange.toFixed(1)),
        changeType: ordersChange >= 0 ? 'increase' : 'decrease',
        previousValue: previousPeriodOrdersCount || 0,
        previousFormatted: formatNumber(previousPeriodOrdersCount || 0)
      },
      pendingCanceled: {
        total: currentPendingCanceled,
        pending: pendingCount || 0,
        canceled: canceledCount || 0,
        change: parseFloat(pendingCanceledChange.toFixed(1)),
        changeType: pendingCanceledChange <= 0 ? 'decrease' : 'increase', // Negative is good for pending/canceled
        previousTotal: previousPendingCanceled
      },
      timestamp: new Date().toISOString()
    }

    res.json(dashboardStats)
  } catch (error) {
    console.error('Dashboard stats error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get detailed order statistics
router.get('/dashboard/orders', checkAdmin, async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query

    // Use admin client to bypass RLS and get all orders
    let query = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching admin orders:', error)
      return res.status(500).json({ error: error.message })
    }

    res.json({
      orders: data || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (error) {
    console.error('Get admin orders error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get sales breakdown by date range
router.get('/dashboard/sales-breakdown', checkAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate query parameters are required' })
    }

    // Use admin client to bypass RLS and get all orders
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('total_amount, status, created_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .in('status', ['confirmed', 'shipped', 'delivered'])

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Group by date
    const salesByDate = {}
    data.forEach(order => {
      const date = new Date(order.created_at).toISOString().split('T')[0]
      if (!salesByDate[date]) {
        salesByDate[date] = { date, total: 0, count: 0 }
      }
      salesByDate[date].total += parseFloat(order.total_amount || 0)
      salesByDate[date].count += 1
    })

    res.json({
      breakdown: Object.values(salesByDate).sort((a, b) => a.date.localeCompare(b.date)),
      total: data.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0),
      count: data.length
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Format date to "DD MMM | HH:mm am/pm" format
const formatOrderDate = (dateString) => {
  const date = new Date(dateString)
  const day = date.getDate().toString().padStart(2, '0')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[date.getMonth()]
  
  let hours = date.getHours()
  const minutes = date.getMinutes().toString().padStart(2, '0')
  const ampm = hours >= 12 ? 'pm' : 'am'
  hours = hours % 12
  hours = hours ? hours : 12 // the hour '0' should be '12'
  const formattedHours = hours.toString().padStart(2, '0')
  
  return `${day} ${month} | ${formattedHours}:${minutes} ${ampm}`
}

// Get transactions list (formatted for UI)
router.get('/transactions', checkAdmin, async (req, res) => {
  try {
    const { 
      status, 
      payment_status, 
      limit = 50, 
      offset = 0,
      startDate,
      endDate
    } = req.query

    // Build query using admin client to bypass RLS
    let query = supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        total_amount,
        payment_status,
        status,
        created_at,
        user_id
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (payment_status) {
      query = query.eq('payment_status', payment_status)
    }

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching transactions:', error)
      return res.status(500).json({ error: error.message })
    }

    // Format transactions to match UI structure
    const transactions = (data || []).map((order, index) => {
      // Extract customer ID from order_number (e.g., "ORD-2024-001234" -> "#1234")
      // The UI shows customer IDs like #6545, #5412, etc. - these appear to be extracted from order numbers
      let customerId = order.order_number || order.id.substring(0, 8)
      
      if (order.order_number) {
        // Extract numeric part from order number (e.g., "ORD-2024-001234" -> "1234")
        const match = order.order_number.match(/\d+/g)
        if (match && match.length > 0) {
          // Take the last sequence of digits (usually the order sequence number)
          const digits = match[match.length - 1]
          customerId = `#${digits.length > 4 ? digits.slice(-4) : digits}`
        } else {
          // Fallback: use last 4 characters if no digits found
          customerId = `#${order.order_number.slice(-4)}`
        }
      } else {
        // Fallback: use first 4 characters of UUID if no order_number
        customerId = `#${order.id.substring(0, 4)}`
      }

      // Map payment_status to display status
      const statusMap = {
        'paid': { label: 'Paid', color: 'green' },
        'pending': { label: 'Pending', color: 'orange' },
        'failed': { label: 'Failed', color: 'red' },
        'refunded': { label: 'Refunded', color: 'grey' }
      }

      const paymentStatus = order.payment_status || 'pending'
      const statusInfo = statusMap[paymentStatus] || statusMap['pending']

      return {
        no: parseInt(offset) + index + 1,
        id: order.id,
        customerId: customerId,
        orderNumber: order.order_number,
        orderDate: formatOrderDate(order.created_at),
        status: statusInfo.label,
        statusColor: statusInfo.color,
        paymentStatus: paymentStatus,
        orderStatus: order.status,
        amount: parseFloat(order.total_amount || 0),
        amountFormatted: new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
        }).format(order.total_amount || 0),
        userId: order.user_id,
        createdAt: order.created_at
      }
    })

    res.json({
      transactions,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Transactions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// CATEGORIES MANAGEMENT
// ============================================

// Get all categories with product counts (for Discover section)
router.get('/categories', checkAdmin, async (req, res) => {
  try {
    const { limit = 20, offset = 0 } = req.query

    // Get all unique categories from product_categories table (junction table)
    const { data: categoriesData, error: categoriesError } = await supabaseAdmin
      .from('product_categories')
      .select('category')
      .order('category', { ascending: true })

    // Also get from legacy category field for backward compatibility
    const { data: legacyCategoriesData } = await supabaseAdmin
      .from('products')
      .select('category')
      .not('category', 'is', null)

    if (categoriesError) {
      return res.status(500).json({ error: categoriesError.message })
    }

    // Group by category and count products
    const categoryMap = {}
    
    // Count from product_categories junction table
    categoriesData?.forEach(pc => {
      if (pc.category) {
        if (!categoryMap[pc.category]) {
          categoryMap[pc.category] = {
            name: pc.category,
            count: 0
          }
        }
        categoryMap[pc.category].count++
      }
    })

    // Also count from legacy category field
    legacyCategoriesData?.forEach(product => {
      if (product.category) {
        if (!categoryMap[product.category]) {
          categoryMap[product.category] = {
            name: product.category,
            count: 0
          }
        }
        categoryMap[product.category].count++
      }
    })

    // Get unique product counts per category (avoid double counting)
    const { data: uniqueCounts } = await supabaseAdmin
      .from('product_categories')
      .select('category, product_id')
    
    const uniqueCategoryMap = {}
    uniqueCounts?.forEach(pc => {
      if (pc.category) {
        if (!uniqueCategoryMap[pc.category]) {
          uniqueCategoryMap[pc.category] = new Set()
        }
        uniqueCategoryMap[pc.category].add(pc.product_id)
      }
    })

    // Update counts with unique product counts
    Object.keys(uniqueCategoryMap).forEach(category => {
      if (categoryMap[category]) {
        categoryMap[category].count = uniqueCategoryMap[category].size
      } else {
        categoryMap[category] = {
          name: category,
          count: uniqueCategoryMap[category].size
        }
      }
    })

    const categories = Object.values(categoryMap)
      .sort((a, b) => b.count - a.count) // Sort by product count descending
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit))

    // Get total count
    const totalCategories = Object.keys(categoryMap).length

    res.json({
      categories,
      total: totalCategories,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: totalCategories > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Categories error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get product counts by filter type (for filter tabs)
router.get('/products/counts', checkAdmin, async (req, res) => {
  try {
    // Get all products count
    const { count: allCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })

    // Get featured products count
    const { count: featuredCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('featured', true)

    // Get on sale products count (badge='sale' or discount_percentage > 0)
    const { count: onSaleCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .or('badge.eq.sale,discount_percentage.gt.0')

    // Get out of stock products count
    const { count: outOfStockCount } = await supabaseAdmin
      .from('products')
      .select('*', { count: 'exact', head: true })
      .or('stock_status.eq.Out of Stock,stock.eq.0')

    res.json({
      all: allCount || 0,
      featured: featuredCount || 0,
      onSale: onSaleCount || 0,
      outOfStock: outOfStockCount || 0
    })
  } catch (error) {
    console.error('Product counts error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get products by category
router.get('/categories/:categoryName/products', checkAdmin, async (req, res) => {
  try {
    const { categoryName } = req.params
    const { limit = 10, offset = 0, status } = req.query

    let query = supabaseAdmin
      .from('products')
      .select('*', { count: 'exact' })
      .eq('category', decodeURIComponent(categoryName))
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({
      products: data || [],
      category: decodeURIComponent(categoryName),
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Category products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// PRODUCTS MANAGEMENT
// ============================================

// Get all products (admin view - includes inactive products)
router.get('/products', checkAdmin, async (req, res) => {
  try {
    const { 
      category, 
      status, 
      productStatus,
      badge,
      search,
      filter, // 'all', 'featured', 'onSale', 'outOfStock'
      limit = 50, 
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query

    let query = supabaseAdmin
      .from('products')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filter tabs (All Product, Featured Products, On Sale, Out of Stock)
    if (filter === 'featured') {
      query = query.eq('featured', true)
    } else if (filter === 'onSale') {
      // Products with discount (badge='sale' or has discount_percentage > 0)
      query = query.or('badge.eq.sale,discount_percentage.gt.0')
    } else if (filter === 'outOfStock') {
      // Products that are out of stock
      query = query.or('stock_status.eq.Out of Stock,stock.eq.0')
    }
    // 'all' or no filter = show all products

    // Apply filters
    if (category) {
      query = query.eq('category', category)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (productStatus) {
      query = query.eq('product_status', productStatus)
    }

    if (badge) {
      // Support multiple badges (comma-separated) or single badge
      const badges = badge.split(',').map(b => b.trim())
      if (badges.length === 1) {
        query = query.eq('badge', badges[0])
      } else {
        query = query.in('badge', badges)
      }
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    // Get order counts for each product
    const productIds = (data || []).map(p => p.id)
    let orderCounts = {}
    
    if (productIds.length > 0) {
      // Get all orders and count products in order items
      const { data: allOrders } = await supabaseAdmin
        .from('orders')
        .select('items')
        .in('status', ['pending', 'processing', 'confirmed', 'shipped', 'delivered'])

      allOrders?.forEach(order => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const productId = item.product_id || item.id || item.productId
            if (productId && productIds.includes(productId)) {
              orderCounts[productId] = (orderCounts[productId] || 0) + (parseInt(item.quantity) || 1)
            }
          })
        }
      })
    }

    // Normalize image fields and add order counts
    const normalizedProducts = (data || []).map((product, index) => {
      const normalized = normalizeProductImages(product)
      return {
        ...normalized,
        orderCount: orderCounts[product.id] || 0,
        rowNumber: parseInt(offset) + index + 1
      }
    })

    res.json({
      products: normalizedProducts,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit),
      filter: filter || 'all'
    })
  } catch (error) {
    console.error('Admin products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// BEST SELLING PRODUCTS
// ============================================

// Get best selling products
router.get('/products/best-selling', checkAdmin, async (req, res) => {
  try {
    const { 
      period = 'all', // 'all', '7days', '30days', '90days'
      limit = 10,
      minQuantity = 0
    } = req.query

    // Calculate date range based on period
    let startDate = null
    if (period !== 'all') {
      const days = period === '7days' ? 7 : period === '30days' ? 30 : 90
      startDate = new Date()
      startDate.setDate(startDate.getDate() - days)
      startDate.setHours(0, 0, 0, 0)
    }

    // Build query for successful orders
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select('id, items, created_at')
      .in('status', ['confirmed', 'shipped', 'delivered'])
      .eq('payment_status', 'paid')

    if (startDate) {
      ordersQuery = ordersQuery.gte('created_at', startDate.toISOString())
    }

    const { data: orders, error: ordersError } = await ordersQuery

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return res.status(500).json({ error: ordersError.message })
    }

    if (!orders || orders.length === 0) {
      return res.json({
        products: [],
        period,
        periodLabel: period === 'all' 
          ? 'All Time' 
          : period === '7days' 
            ? 'Last 7 Days' 
            : period === '30days' 
              ? 'Last 30 Days' 
              : 'Last 90 Days',
        total: 0,
        limit: parseInt(limit),
        message: 'No orders found matching the criteria'
      })
    }

    // Aggregate product sales from order items
    const productSales = {}

    orders.forEach(order => {
      if (!order.items || !Array.isArray(order.items)) {
        return
      }

      order.items.forEach(item => {
        // Try multiple possible field names for product ID
        const productId = item.product_id || item.id || item.productId
        if (!productId) {
          console.warn('Order item missing product ID:', item)
          return
        }

        const quantity = parseInt(item.quantity || 1)
        if (isNaN(quantity) || quantity <= 0) {
          console.warn('Invalid quantity in order item:', item)
          return
        }

        if (!productSales[productId]) {
          productSales[productId] = {
            product_id: productId,
            total_quantity: 0,
            order_ids: new Set()
          }
        }

        productSales[productId].total_quantity += quantity
        productSales[productId].order_ids.add(order.id)
      })
    })

    // Calculate total orders for each product
    Object.values(productSales).forEach(sales => {
      sales.total_orders = sales.order_ids.size
    })

    // Filter by minimum quantity
    const filteredProducts = Object.values(productSales).filter(
      p => p.total_quantity >= parseInt(minQuantity)
    )

    // Sort by total quantity (descending), then by total orders (descending)
    filteredProducts.sort((a, b) => {
      if (b.total_quantity !== a.total_quantity) {
        return b.total_quantity - a.total_quantity
      }
      return b.total_orders - a.total_orders
    })

    // Get top N products
    const topProducts = filteredProducts.slice(0, parseInt(limit))

    // Fetch product details for top products
    const productIds = topProducts.map(p => p.product_id).filter(id => id) // Filter out null/undefined
    
    if (productIds.length === 0) {
      return res.json({
        products: [],
        period,
        periodLabel: period === 'all' 
          ? 'All Time' 
          : period === '7days' 
            ? 'Last 7 Days' 
            : period === '30days' 
              ? 'Last 30 Days' 
              : 'Last 90 Days',
        total: 0,
        limit: parseInt(limit),
        message: 'No products found matching the criteria'
      })
    }

    // Validate UUIDs format (basic check)
    const validProductIds = productIds.filter(id => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(id)
    })

    if (validProductIds.length === 0) {
      console.warn('No valid product IDs found:', productIds)
      return res.json({
        products: [],
        period,
        periodLabel: period === 'all' 
          ? 'All Time' 
          : period === '7days' 
            ? 'Last 7 Days' 
            : period === '30days' 
              ? 'Last 30 Days' 
              : 'Last 90 Days',
        total: 0,
        limit: parseInt(limit),
        message: 'No valid product IDs found in orders'
      })
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, image_url, price, stock, status')
      .in('id', validProductIds)

    if (productsError) {
      console.error('Error fetching products:', productsError)
      return res.status(500).json({ 
        error: 'Failed to fetch product details',
        details: productsError.message 
      })
    }

    // Log if some products are missing
    if (!products || products.length === 0) {
      console.warn('No products found for IDs:', validProductIds)
      return res.json({
        products: [],
        period,
        periodLabel: period === 'all' 
          ? 'All Time' 
          : period === '7days' 
            ? 'Last 7 Days' 
            : period === '30days' 
              ? 'Last 30 Days' 
              : 'Last 90 Days',
        total: 0,
        limit: parseInt(limit),
        message: 'No products found in database for the order items'
      })
    }

    if (products.length < validProductIds.length) {
      const foundIds = products.map(p => p.id)
      const missingIds = validProductIds.filter(id => !foundIds.includes(id))
      console.warn('Some products not found:', missingIds)
    }

    // Create a map for quick product lookup
    const productsMap = {}
    products.forEach(product => {
      productsMap[product.id] = product
    })

    // Combine sales data with product details
    const bestSellingProducts = topProducts
      .map(sales => {
        const product = productsMap[sales.product_id]
        if (!product) return null

        // Determine stock status
        const stockStatus = (product.stock > 0 && product.status !== 'out_of_stock') 
          ? 'Stock' 
          : 'Stock out'
        const stockStatusColor = stockStatus === 'Stock' ? 'green' : 'red'

        // Normalize image fields
        const imageUrl = product.main_image || product.image_url || null

        return {
          id: product.id,
          name: product.name,
          image_url: imageUrl,
          main_image: imageUrl, // Ensure both fields are synchronized
          price: parseFloat(product.price || 0),
          priceFormatted: new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(product.price || 0),
          totalOrder: sales.total_orders,
          totalQuantity: sales.total_quantity,
          stock: product.stock,
          stockStatus,
          stockStatusColor,
          status: product.status
        }
      })
      .filter(p => p !== null) // Remove null entries (products that were deleted)

    res.json({
      products: bestSellingProducts,
      period,
      periodLabel: period === 'all' 
        ? 'All Time' 
        : period === '7days' 
          ? 'Last 7 Days' 
          : period === '30days' 
            ? 'Last 30 Days' 
            : 'Last 90 Days',
      total: bestSellingProducts.length,
      limit: parseInt(limit)
    })
  } catch (error) {
    console.error('Best selling products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single product (admin view)
router.get('/products/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    // Check if product exists
    if (error) {
      // PGRST116 is Supabase's "no rows returned" error code
      if (error.code === 'PGRST116' || error.message?.includes('No rows') || error.message?.includes('not found')) {
        return res.status(404).json({ error: 'Product not found' })
      }
      // Log other errors for debugging
      console.error('Error fetching product:', error)
      return res.status(500).json({ 
        error: 'Failed to fetch product',
        details: error.message 
      })
    }

    // Double check data exists (sometimes Supabase returns no error but also no data)
    if (!data) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Normalize image fields to ensure main_image and image_url are synchronized
    const normalizedProduct = normalizeProductImages(data)

    res.json(normalizedProduct)
  } catch (error) {
    console.error('Admin product error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create new product
router.post('/products', checkAdmin, async (req, res) => {
  try {
    // Extract all fields from request body (map frontend field names)
    const {
      name,
      sku,
      currentPrice,
      originalPrice,
      description,
      shortDescription,
      categories,
      mainImage,
      additionalImages,
      stockQuantity,
      slug,
      badge = 'none',
      discountPercentage,
      initialRating = 0,
      initialReviewCount = 0,
      stockStatus,
      productStatus = 'Draft',
      featured = false,
      weight,
      dimensions,
      tags = [],
      // Form action override (from 'Save as Draft' or 'Publish' buttons)
      action
    } = req.body

    // Prepare data object for validation
    const productData = {
      name,
      sku,
      currentPrice,
      originalPrice,
      description,
      shortDescription,
      categories,
      mainImage,
      additionalImages,
      stockQuantity,
      slug,
      badge,
      discountPercentage,
      initialRating,
      initialReviewCount,
      stockStatus,
      productStatus,
      featured,
      weight,
      dimensions,
      tags
    }

    // Validate product data
    const validation = validateProductData(productData)
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        errors: validation.errors
      })
    }

    // Generate slug if not provided
    let finalSlug = slug
    if (!finalSlug || finalSlug.trim().length === 0) {
      finalSlug = generateSlug(name)
    } else {
      finalSlug = generateSlug(finalSlug) // Normalize provided slug
    }

    // Ensure slug uniqueness
    let slugCounter = 1
    let uniqueSlug = finalSlug
    while (true) {
      const { data: existingProduct } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('slug', uniqueSlug)
        .single()

      if (!existingProduct) {
        break // Slug is unique
      }

      uniqueSlug = `${finalSlug}-${slugCounter}`
      slugCounter++
    }

    // Check SKU uniqueness
    const { data: existingSku } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('sku', sku)
      .single()

    if (existingSku) {
      return res.status(409).json({
        success: false,
        error: 'SKU already exists'
      })
    }

    // Calculate discount percentage if not provided but both prices exist
    let finalDiscountPercentage = discountPercentage
    if (originalPrice && currentPrice && !finalDiscountPercentage) {
      finalDiscountPercentage = calculateDiscount(originalPrice, currentPrice)
    }

    // Auto-determine stock status if not provided
    let finalStockStatus = stockStatus
    if (!finalStockStatus) {
      finalStockStatus = determineStockStatus(stockQuantity)
    }

    // Handle status override from form action
    let finalProductStatus = productStatus
    if (action === 'publish' || action === 'Publish') {
      finalProductStatus = 'Active'
    } else if (action === 'draft' || action === 'Save as Draft') {
      finalProductStatus = 'Draft'
    }

    // Prepare product data for database insertion
    const dbProductData = {
      name: name.trim(),
      sku: sku.trim(),
      price: parseFloat(currentPrice), // Keep price for backward compatibility
      current_price: parseFloat(currentPrice),
      original_price: originalPrice ? parseFloat(originalPrice) : null,
      discount_percentage: finalDiscountPercentage,
      description: description.trim(),
      short_description: shortDescription ? shortDescription.trim() : null,
      slug: uniqueSlug,
      badge: badge || 'none',
      main_image: mainImage.trim(),
      additional_images: additionalImages && Array.isArray(additionalImages) ? additionalImages : [],
      stock: parseInt(stockQuantity),
      stock_status: finalStockStatus,
      product_status: finalProductStatus,
      rating: initialRating ? parseFloat(initialRating) : 0,
      review_count: initialReviewCount ? parseInt(initialReviewCount) : 0,
      featured: Boolean(featured),
      weight_string: weight ? weight.trim() : null, // Use weight_string for string values like "1kg"
      dimensions: dimensions ? dimensions.trim() : null,
      tags: tags && Array.isArray(tags) ? tags : [],
      // Keep backward compatibility fields
      category: categories && categories.length > 0 ? categories[0] : 'Uncategorized', // Set first category for legacy field
      image_url: mainImage.trim(), // Map to old field
      status: finalProductStatus === 'Active' ? 'active' : 'inactive', // Map to old status
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    // Insert product into database
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .insert([dbProductData])
      .select()
      .single()

    if (productError) {
      console.error('Product creation error:', productError)

      // Handle unique constraint violations
      if (productError.code === '23505') {
        if (productError.message.includes('slug')) {
          return res.status(409).json({
            success: false,
            error: 'Slug already exists'
          })
        }
        if (productError.message.includes('sku')) {
          return res.status(409).json({
            success: false,
            error: 'SKU already exists'
          })
        }
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to create product',
        details: productError.message
      })
    }

    // Insert categories into junction table
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const categoryInserts = categories.map(category => ({
        product_id: product.id,
        category: category.trim()
      }))

      const { error: categoryError } = await supabaseAdmin
        .from('product_categories')
        .insert(categoryInserts)

      if (categoryError) {
        console.error('Category insertion error:', categoryError)
        // Note: Product is already created, but categories failed
        // In production, consider transaction rollback or cleanup
        return res.status(500).json({
          success: false,
          error: 'Product created but failed to add categories',
          details: categoryError.message
        })
      }
    }

    // Fetch product with categories for response
    const { data: productWithCategories } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        product_categories (
          category
        )
      `)
      .eq('id', product.id)
      .single()

    // Normalize image fields to ensure main_image and image_url are synchronized
    const imageUrl = product.main_image || product.image_url || null

    // Format response to match specification
    const responseData = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      sku: product.sku,
      price: parseFloat(product.current_price || product.price),
      original_price: product.original_price ? parseFloat(product.original_price) : null,
      discount_percentage: product.discount_percentage ? parseFloat(product.discount_percentage) : null,
      description: product.description,
      short_description: product.short_description,
      categories: productWithCategories?.product_categories?.map(pc => pc.category) || categories || [],
      badge: product.badge,
      main_image: imageUrl,
      image_url: imageUrl, // Ensure both fields are synchronized
      additional_images: product.additional_images || [],
      rating: product.rating ? parseFloat(product.rating) : 0,
      review_count: product.review_count || 0,
      stock: product.stock,
      stock_status: product.stock_status,
      status: product.product_status.toLowerCase(),
      featured: product.featured,
      weight: product.weight_string || product.weight, // Use weight_string if available, fallback to legacy weight
      dimensions: product.dimensions,
      tags: product.tags || [],
      created_at: product.created_at,
      updated_at: product.updated_at
    }

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: responseData
    })
  } catch (error) {
    console.error('Create product error:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    })
  }
})

// Update product
router.put('/products/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    // Check if product exists first
    const { data: existingProduct, error: checkError } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (checkError) {
      console.error('Error checking product existence:', checkError)
      return res.status(500).json({ 
        error: 'Failed to check product existence',
        details: checkError.message 
      })
    }

    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Log original request body for debugging
    console.log('=== Product Update Request ===')
    console.log('Product ID:', id)
    console.log('Original request body:', JSON.stringify(updates, null, 2))

    // Convert camelCase fields to snake_case and extract special fields
    const { converted: dbUpdates, categories } = convertProductFields(updates)

    // Log converted fields
    console.log('Converted fields (after conversion):', JSON.stringify(dbUpdates, null, 2))
    if (categories !== undefined) {
      console.log('Categories (extracted):', categories)
    }

    // Synchronize image fields: ensure main_image and image_url stay in sync
    // If main_image is updated, also update image_url (for backward compatibility)
    if (dbUpdates.main_image !== undefined) {
      dbUpdates.image_url = dbUpdates.main_image
    }
    // If image_url is updated, also update main_image (for consistency)
    if (dbUpdates.image_url !== undefined && dbUpdates.main_image === undefined) {
      dbUpdates.main_image = dbUpdates.image_url
    }

    // Validate price if provided
    if (dbUpdates.price !== undefined && dbUpdates.price < 0) {
      return res.status(400).json({ error: 'Price must be greater than or equal to 0' })
    }
    if (dbUpdates.current_price !== undefined && dbUpdates.current_price < 0) {
      return res.status(400).json({ error: 'Current price must be greater than or equal to 0' })
    }

    // Validate stock if provided
    if (dbUpdates.stock !== undefined && dbUpdates.stock < 0) {
      return res.status(400).json({ error: 'Stock must be greater than or equal to 0' })
    }

    // Validate status if provided
    if (dbUpdates.status && !['active', 'inactive', 'out_of_stock'].includes(dbUpdates.status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: active, inactive, or out_of_stock' })
    }

    // Update legacy category field if categories are provided
    if (categories !== undefined && Array.isArray(categories) && categories.length > 0) {
      dbUpdates.category = categories[0] // Set first category for legacy field
    }

    // Add updated_at timestamp
    dbUpdates.updated_at = new Date().toISOString()

    // Check if we have any fields to update
    const fieldsToUpdate = Object.keys(dbUpdates).filter(key => dbUpdates[key] !== undefined)
    if (fieldsToUpdate.length === 0) {
      console.error('No valid fields to update after conversion')
      console.error('Original fields:', Object.keys(updates))
      console.error('Converted fields:', Object.keys(dbUpdates))
      return res.status(400).json({ 
        error: 'No valid fields to update',
        details: 'Please provide at least one field to update. Original fields: ' + Object.keys(updates).join(', ')
      })
    }

    // Log final update payload
    console.log('Final update payload:', JSON.stringify(dbUpdates, null, 2))
    console.log('Fields to update:', fieldsToUpdate)

    // Update product
    const { data, error, count } = await supabaseAdmin
      .from('products')
      .update(dbUpdates)
      .eq('id', id)
      .select()

    if (error) {
      console.error('=== Product Update Error ===')
      console.error('Error:', error)
      console.error('Error code:', error.code)
      console.error('Error message:', error.message)
      console.error('Update payload:', JSON.stringify(dbUpdates, null, 2))
      
      // Check if it's a "not found" error
      if (error.code === 'PGRST116' || error.message?.includes('No rows') || error.message?.includes('not found')) {
        return res.status(404).json({ 
          error: 'Product not found',
          details: 'The product may have been deleted or the ID is incorrect'
        })
      }
      return res.status(400).json({ 
        error: 'Failed to update product',
        details: error.message 
      })
    }

    // Log update result
    console.log('Update result - Rows affected:', count !== null ? count : 'unknown')
    console.log('Update result - Data returned:', data ? data.length : 0, 'row(s)')

    // If no data returned, try to fetch the product separately as fallback
    if (!data || data.length === 0) {
      console.warn('=== Update returned no data, attempting fallback fetch ===')
      console.warn('Product ID:', id)
      console.warn('Update payload:', JSON.stringify(dbUpdates, null, 2))
      
      // First, verify the product still exists
      const { data: checkData, error: checkErr } = await supabaseAdmin
        .from('products')
        .select('id, name, updated_at')
        .eq('id', id)
        .maybeSingle()
      
      if (checkErr || !checkData) {
        console.error('Product does not exist after update attempt')
        return res.status(404).json({ 
          error: 'Product not found',
          details: 'The product may have been deleted'
        })
      }
      
      // Product exists, so the update might have succeeded but select failed
      // Try to fetch the full product data
      const { data: fetchedProduct, error: fetchErr } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
      
      if (fetchErr || !fetchedProduct) {
        console.error('Failed to fetch product after update:', fetchErr)
        return res.status(500).json({ 
          error: 'Product update may have succeeded but failed to retrieve updated data',
          details: fetchErr?.message || 'Unknown error',
          suggestion: 'Please check the product manually to verify the update'
        })
      }
      
      // Check if updated_at changed to verify update actually happened
      const updateTimestamp = new Date(dbUpdates.updated_at).getTime()
      const fetchedTimestamp = new Date(fetchedProduct.updated_at).getTime()
      const timeDiff = Math.abs(fetchedTimestamp - updateTimestamp)
      
      if (timeDiff > 5000) { // More than 5 seconds difference suggests update didn't happen
        console.warn('Update timestamp mismatch - update may not have occurred')
        console.warn('Expected updated_at:', dbUpdates.updated_at)
        console.warn('Actual updated_at:', fetchedProduct.updated_at)
        return res.status(500).json({ 
          error: 'Product update may have failed',
          details: 'The update timestamp does not match. The product may not have been updated.',
          product: normalizeProductImages(fetchedProduct)
        })
      }
      
      // Update likely succeeded, return the fetched product
      console.log('Update succeeded (verified via fallback fetch)')
      const updatedProduct = fetchedProduct
      
      // Continue with category updates if needed
      if (categories !== undefined && Array.isArray(categories)) {
        // Delete existing categories for this product
        await supabaseAdmin
          .from('product_categories')
          .delete()
          .eq('product_id', id)

        // Insert new categories
        if (categories.length > 0) {
          const categoryInserts = categories
            .filter(cat => cat && cat.trim())
            .map(category => ({
              product_id: id,
              category: category.trim()
            }))

          if (categoryInserts.length > 0) {
            const { error: categoryError } = await supabaseAdmin
              .from('product_categories')
              .insert(categoryInserts)

            if (categoryError) {
              console.error('Category update error:', categoryError)
              return res.json({
                message: 'Product updated successfully',
                product: normalizeProductImages(updatedProduct),
                warning: 'Product updated but categories update failed',
                categoryError: categoryError.message
              })
            }
          }
        }
      }

      // Fetch product with categories for response
      const { data: productWithCategories, error: fetchError } = await supabaseAdmin
        .from('products')
        .select(`
          *,
          product_categories (
            category
          )
        `)
        .eq('id', id)
        .maybeSingle()

      if (fetchError || !productWithCategories) {
        if (fetchError) {
          console.error('Error fetching product with categories:', fetchError)
        }
        return res.json({
          message: 'Product updated successfully',
          product: normalizeProductImages(updatedProduct)
        })
      }

      console.log('=== Product Update Success ===')
      return res.json({
        message: 'Product updated successfully',
        product: normalizeProductImages(productWithCategories)
      })
    }

    const updatedProduct = data[0]
    console.log('=== Product Update Success ===')

    // Update product_categories junction table if categories are provided
    if (categories !== undefined && Array.isArray(categories)) {
      // Delete existing categories for this product
      await supabaseAdmin
        .from('product_categories')
        .delete()
        .eq('product_id', id)

      // Insert new categories
      if (categories.length > 0) {
        const categoryInserts = categories
          .filter(cat => cat && cat.trim()) // Filter out empty/null categories
          .map(category => ({
            product_id: id,
            category: category.trim()
          }))

        if (categoryInserts.length > 0) {
          const { error: categoryError } = await supabaseAdmin
            .from('product_categories')
            .insert(categoryInserts)

          if (categoryError) {
            console.error('Category update error:', categoryError)
            // Product was updated but categories failed - still return success with warning
            // Normalize image fields before returning
            return res.json({
              message: 'Product updated successfully',
              product: normalizeProductImages(updatedProduct),
              warning: 'Product updated but categories update failed',
              categoryError: categoryError.message
            })
          }
        }
      }
    }

    // Fetch product with categories for response
    const { data: productWithCategories, error: fetchError } = await supabaseAdmin
      .from('products')
      .select(`
        *,
        product_categories (
          category
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (fetchError || !productWithCategories) {
      // If fetch fails, return the data from update
      if (fetchError) {
        console.error('Error fetching product with categories:', fetchError)
      }
      // Normalize image fields before returning
      return res.json({
        message: 'Product updated successfully',
        product: normalizeProductImages(updatedProduct)
      })
    }

    // Normalize image fields before returning
    res.json({
      message: 'Product updated successfully',
      product: normalizeProductImages(productWithCategories)
    })
  } catch (error) {
    console.error('Update product error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete product
router.delete('/products/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    // Check if product exists
    const { data: product, error: fetchError } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('id', id)
      .single()

    if (fetchError) {
      // Check if it's a "not found" error
      if (fetchError.code === 'PGRST116' || fetchError.message?.includes('No rows') || fetchError.message?.includes('not found')) {
        return res.status(404).json({ error: 'Product not found' })
      }
      console.error('Error fetching product for deletion:', fetchError)
      return res.status(500).json({ 
        error: 'Failed to fetch product',
        details: fetchError.message 
      })
    }

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Delete the product
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Product deletion error:', error)
      return res.status(400).json({ error: error.message })
    }

    res.json({
      message: 'Product deleted successfully',
      deletedProduct: {
        id: product.id,
        name: product.name
      }
    })
  } catch (error) {
    console.error('Delete product error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// CUSTOMERS MANAGEMENT
// ============================================

// Get customer metrics (Total Customers, New Customers, Visitors)
router.get('/customers/metrics', checkAdmin, async (req, res) => {
  try {
    const now = new Date()
    const endDate = new Date(now)
    endDate.setHours(23, 59, 59, 999) // End of today

    const startDate = new Date(now)
    startDate.setDate(startDate.getDate() - 7)
    startDate.setHours(0, 0, 0, 0) // Start of day 7 days ago

    const previousStartDate = new Date(startDate)
    previousStartDate.setDate(previousStartDate.getDate() - 7)

    // Total Customers: Count of all profiles where role != 'admin'
    const { count: totalCustomers, error: totalCustomersError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')
      .lte('created_at', endDate.toISOString())

    // Previous period total customers
    const { count: previousTotalCustomers, error: previousTotalCustomersError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')
      .lte('created_at', startDate.toISOString())

    // New Customers: Count of profiles created in last 7 days (excluding admins)
    const { count: newCustomers, error: newCustomersError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Previous period new customers
    const { count: previousNewCustomers, error: previousNewCustomersError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString())

    // Visitors: Same as Total Customers (all unique registered users)
    const visitors = totalCustomers || 0
    const previousVisitors = previousTotalCustomers || 0

    if (totalCustomersError || previousTotalCustomersError || newCustomersError || previousNewCustomersError) {
      return res.status(500).json({ 
        error: 'Error calculating customer metrics',
        details: totalCustomersError?.message || previousTotalCustomersError?.message || newCustomersError?.message || previousNewCustomersError?.message
      })
    }

    const totalCustomersChange = calculatePercentageChange(totalCustomers || 0, previousTotalCustomers || 0)
    const newCustomersChange = calculatePercentageChange(newCustomers || 0, previousNewCustomers || 0)
    const visitorsChange = calculatePercentageChange(visitors, previousVisitors)

    res.json({
      totalCustomers: {
        value: totalCustomers || 0,
        formatted: formatNumber(totalCustomers || 0),
        change: parseFloat(totalCustomersChange.toFixed(1)),
        changeType: totalCustomersChange >= 0 ? 'increase' : 'decrease',
        previousValue: previousTotalCustomers || 0
      },
      newCustomers: {
        value: newCustomers || 0,
        formatted: formatNumber(newCustomers || 0),
        change: parseFloat(newCustomersChange.toFixed(1)),
        changeType: newCustomersChange >= 0 ? 'increase' : 'decrease',
        previousValue: previousNewCustomers || 0
      },
      visitors: {
        value: visitors,
        formatted: formatNumber(visitors),
        change: parseFloat(visitorsChange.toFixed(1)),
        changeType: visitorsChange >= 0 ? 'increase' : 'decrease',
        previousValue: previousVisitors
      },
      period: {
        current: 'Last 7 days',
        previous: 'Previous 7 days',
        days: 7
      }
    })
  } catch (error) {
    console.error('Customer metrics error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get customer overview (Active, Repeat, Shop Visitor, Conversion Rate, weekly trends)
router.get('/customers/overview', checkAdmin, async (req, res) => {
  try {
    const { period = 'thisWeek' } = req.query

    // Calculate week boundaries
    const now = new Date()
    let weekStart, weekEnd

    if (period === 'lastWeek') {
      // Last week: 7 days ago to 14 days ago
      weekEnd = new Date(now)
      weekEnd.setDate(weekEnd.getDate() - 7)
      weekEnd.setHours(23, 59, 59, 999)
      
      weekStart = new Date(weekEnd)
      weekStart.setDate(weekStart.getDate() - 6)
      weekStart.setHours(0, 0, 0, 0)
    } else {
      // This week: Today back to 7 days ago
      weekEnd = new Date(now)
      weekEnd.setHours(23, 59, 59, 999)
      
      weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - 6)
      weekStart.setHours(0, 0, 0, 0)
    }

    // Active Customers: Users with at least one order in last 30 days
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    const { data: activeCustomersData, error: activeCustomersError } = await supabaseAdmin
      .from('orders')
      .select('user_id')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .in('status', ['pending', 'processing', 'confirmed', 'shipped', 'delivered'])

    if (activeCustomersError) {
      return res.status(500).json({ 
        error: 'Error calculating active customers',
        details: activeCustomersError.message
      })
    }

    const activeCustomersSet = new Set(activeCustomersData?.map(order => order.user_id) || [])
    const activeCustomers = activeCustomersSet.size

    // Repeat Customers: Users with 2+ orders (all time)
    const { data: allOrders, error: allOrdersError } = await supabaseAdmin
      .from('orders')
      .select('user_id')
      .in('status', ['pending', 'processing', 'confirmed', 'shipped', 'delivered'])

    if (allOrdersError) {
      return res.status(500).json({ 
        error: 'Error calculating repeat customers',
        details: allOrdersError.message
      })
    }

    const orderCountsByUser = {}
    allOrders?.forEach(order => {
      orderCountsByUser[order.user_id] = (orderCountsByUser[order.user_id] || 0) + 1
    })

    const repeatCustomers = Object.values(orderCountsByUser).filter(count => count >= 2).length

    // Shop Visitor: Total registered users (same as Total Customers)
    const { count: shopVisitor, error: shopVisitorError } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .neq('role', 'admin')

    if (shopVisitorError) {
      return res.status(500).json({ 
        error: 'Error calculating shop visitors',
        details: shopVisitorError.message
      })
    }

    // Conversion Rate: (Users with orders / Total users) * 100
    const usersWithOrders = new Set(allOrders?.map(order => order.user_id) || [])
    const conversionRate = shopVisitor > 0 ? ((usersWithOrders.size / shopVisitor) * 100) : 0

    // Trends: Daily customer counts for the selected week
    const { data: weekOrders, error: weekOrdersError } = await supabaseAdmin
      .from('orders')
      .select('user_id, created_at')
      .gte('created_at', weekStart.toISOString())
      .lte('created_at', weekEnd.toISOString())
      .in('status', ['pending', 'processing', 'confirmed', 'shipped', 'delivered'])

    if (weekOrdersError) {
      return res.status(500).json({ 
        error: 'Error calculating trends',
        details: weekOrdersError.message
      })
    }

    // Group orders by day
    const trendsByDate = {}
    weekOrders?.forEach(order => {
      const orderDate = new Date(order.created_at)
      const dateKey = orderDate.toISOString().split('T')[0]
      
      if (!trendsByDate[dateKey]) {
        trendsByDate[dateKey] = new Set()
      }
      trendsByDate[dateKey].add(order.user_id)
    })

    // Generate trends array for the week (Sun-Sat)
    const trends = []
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(weekStart)
      currentDate.setDate(weekStart.getDate() + i)
      const dateKey = currentDate.toISOString().split('T')[0]
      const dayName = dayNames[currentDate.getDay()]
      
      trends.push({
        day: dayName,
        date: dateKey,
        count: trendsByDate[dateKey] ? trendsByDate[dateKey].size : 0
      })
    }

    res.json({
      summary: {
        activeCustomers: activeCustomers,
        activeCustomersFormatted: formatNumber(activeCustomers),
        repeatCustomers: repeatCustomers,
        repeatCustomersFormatted: formatNumber(repeatCustomers),
        shopVisitor: shopVisitor || 0,
        shopVisitorFormatted: formatNumber(shopVisitor || 0),
        conversionRate: parseFloat(conversionRate.toFixed(1))
      },
      trends: trends,
      period: period
    })
  } catch (error) {
    console.error('Customer overview error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get customers list with pagination, search, and sorting
router.get('/customers', checkAdmin, async (req, res) => {
  try {
    const { 
      limit = 50, 
      offset = 0, 
      search, 
      status, 
      sortBy = 'created_at', 
      sortOrder = 'desc' 
    } = req.query

    // First, get ALL profiles ordered by created_at to establish global sequential IDs
    const { data: allProfilesOrdered, error: allProfilesError } = await supabaseAdmin
      .from('profiles')
      .select('id, created_at')
      .neq('role', 'admin')
      .order('created_at', { ascending: true })

    if (allProfilesError) {
      return res.status(500).json({ 
        error: 'Error fetching customers',
        details: allProfilesError.message
      })
    }

    // Create a map of user_id -> sequential customer number (based on creation order)
    const customerIdMap = {}
    allProfilesOrdered?.forEach((profile, index) => {
      customerIdMap[profile.id] = index + 1
    })

    // Build base query for profiles (excluding admins) with filters
    let profilesQuery = supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, phone, created_at', { count: 'exact' })
      .neq('role', 'admin')

    // Apply search filter
    if (search) {
      profilesQuery = profilesQuery.or(
        `full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`
      )
    }

    // Get filtered profiles (we need to calculate order stats)
    const { data: allProfiles, error: profilesError, count: totalCount } = await profilesQuery

    if (profilesError) {
      return res.status(500).json({ 
        error: 'Error fetching customers',
        details: profilesError.message
      })
    }

    if (!allProfiles || allProfiles.length === 0) {
      return res.json({
        customers: [],
        total: 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: false
      })
    }

    // Get all orders to calculate stats per customer
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    thirtyDaysAgo.setHours(0, 0, 0, 0)

    const { data: allOrders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('user_id, total_amount, created_at, status')
      .in('status', ['pending', 'processing', 'confirmed', 'shipped', 'delivered'])

    if (ordersError) {
      return res.status(500).json({ 
        error: 'Error fetching orders',
        details: ordersError.message
      })
    }

    // Calculate order stats per customer
    const customerStats = {}
    allOrders?.forEach(order => {
      const userId = order.user_id
      if (!customerStats[userId]) {
        customerStats[userId] = {
          orderCount: 0,
          totalSpend: 0,
          hasRecentOrder: false
        }
      }
      customerStats[userId].orderCount++
      customerStats[userId].totalSpend += parseFloat(order.total_amount || 0)
      
      // Check if order is within last 30 days
      const orderDate = new Date(order.created_at)
      if (orderDate >= thirtyDaysAgo) {
        customerStats[userId].hasRecentOrder = true
      }
    })

    // Map profiles with stats
    let customers = allProfiles.map((profile) => {
      const stats = customerStats[profile.id] || { orderCount: 0, totalSpend: 0, hasRecentOrder: false }
      
      // Determine status
      const isActive = stats.hasRecentOrder
      const customerStatus = isActive ? 'Active' : 'Inactive'
      const statusColor = isActive ? 'green' : 'grey'

      // Format customer ID as #CUST + sequential number (based on global creation order)
      const sequentialNumber = customerIdMap[profile.id] || 0
      const customerId = `#CUST${String(sequentialNumber).padStart(3, '0')}`

      return {
        id: profile.id,
        customerId: customerId,
        name: profile.full_name || 'N/A',
        phone: profile.phone || 'N/A',
        email: profile.email || 'N/A',
        orderCount: stats.orderCount,
        totalSpend: stats.totalSpend,
        totalSpendFormatted: formatCurrency(stats.totalSpend),
        status: customerStatus,
        statusColor: statusColor,
        createdAt: profile.created_at
      }
    })

    // Apply status filter
    if (status) {
      customers = customers.filter(customer => {
        if (status === 'active') {
          return customer.status === 'Active'
        } else if (status === 'inactive') {
          return customer.status === 'Inactive'
        }
        return true
      })
    }

    // Apply sorting
    customers.sort((a, b) => {
      let aValue, bValue

      switch (sortBy) {
        case 'order_count':
          aValue = a.orderCount
          bValue = b.orderCount
          break
        case 'total_spend':
          aValue = a.totalSpend
          bValue = b.totalSpend
          break
        case 'created_at':
        default:
          aValue = new Date(a.createdAt).getTime()
          bValue = new Date(b.createdAt).getTime()
          break
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
      }
    })

    // Apply pagination
    const paginatedCustomers = customers.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    )

    res.json({
      customers: paginatedCustomers,
      total: customers.length, // Total after filters
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + parseInt(limit)) < customers.length
    })
  } catch (error) {
    console.error('Customers list error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete a customer
router.delete('/customers/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid customer ID format' })
    }

    // Check if customer exists and is not an admin
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', id)
      .single()

    if (profileError) {
      // Check if it's a "not found" error
      if (profileError.code === 'PGRST116' || profileError.message?.includes('No rows') || profileError.message?.includes('not found')) {
        return res.status(404).json({ error: 'Customer not found' })
      }
      console.error('Error fetching customer:', profileError)
      return res.status(500).json({ 
        error: 'Failed to fetch customer',
        details: profileError.message 
      })
    }

    if (!profile) {
      return res.status(404).json({ error: 'Customer not found' })
    }

    // Prevent deletion of admin users
    if (profile.role === 'admin') {
      return res.status(403).json({ 
        error: 'Cannot delete admin users',
        message: 'Admin accounts cannot be deleted through this endpoint'
      })
    }

    // Delete the user from auth.users (this will cascade delete profile and orders)
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Service role key not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY must be set to delete users'
      })
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(id)

    if (deleteError) {
      console.error('Error deleting customer:', deleteError)
      return res.status(500).json({ 
        error: 'Failed to delete customer',
        details: deleteError.message 
      })
    }

    res.json({
      message: 'Customer deleted successfully',
      deletedCustomer: {
        id: profile.id,
        name: profile.full_name || 'N/A',
        email: profile.email || 'N/A'
      }
    })
  } catch (error) {
    console.error('Delete customer error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// COUPONS MANAGEMENT
// ============================================

// Get all coupons (admin view)
router.get('/coupons', checkAdmin, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      search,
      isActive,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query

    let query = supabaseAdmin
      .from('coupons')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filters
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }

    if (search) {
      query = query.or(`code.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data: coupons, error, count } = await query

    if (error) {
      return res.status(500).json({
        error: 'Error fetching coupons',
        details: error.message
      })
    }

    // Format response
    const formattedCoupons = (coupons || []).map(coupon => ({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      minOrderAmount: parseFloat(coupon.min_order_amount),
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
      usageLimit: coupon.usage_limit,
      usageCount: coupon.usage_count,
      userLimit: coupon.user_limit,
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      isActive: coupon.is_active,
      createdBy: coupon.created_by,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
      // Calculate status
      status: (() => {
        if (!coupon.is_active) return 'inactive'
        const now = new Date()
        const validFrom = new Date(coupon.valid_from)
        const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null
        
        if (now < validFrom) return 'upcoming'
        if (validUntil && now > validUntil) return 'expired'
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) return 'limit_reached'
        return 'active'
      })()
    }))

    res.json({
      coupons: formattedCoupons,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Get coupons error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single coupon by ID
router.get('/coupons/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid coupon ID format' })
    }

    const { data: coupon, error } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
        return res.status(404).json({ error: 'Coupon not found' })
      }
      return res.status(500).json({
        error: 'Error fetching coupon',
        details: error.message
      })
    }

    // Get usage statistics
    const { count: totalUsageCount } = await supabaseAdmin
      .from('coupon_usage')
      .select('*', { count: 'exact', head: true })
      .eq('coupon_id', id)

    // Format response
    const now = new Date()
    const validFrom = new Date(coupon.valid_from)
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null

    res.json({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      minOrderAmount: parseFloat(coupon.min_order_amount),
      maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
      usageLimit: coupon.usage_limit,
      usageCount: coupon.usage_count,
      totalUsageCount: totalUsageCount || 0,
      userLimit: coupon.user_limit,
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      isActive: coupon.is_active,
      createdBy: coupon.created_by,
      createdAt: coupon.created_at,
      updatedAt: coupon.updated_at,
      status: (() => {
        if (!coupon.is_active) return 'inactive'
        if (now < validFrom) return 'upcoming'
        if (validUntil && now > validUntil) return 'expired'
        if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) return 'limit_reached'
        return 'active'
      })(),
      remainingUsage: coupon.usage_limit ? coupon.usage_limit - coupon.usage_count : null
    })
  } catch (error) {
    console.error('Get coupon error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create a new coupon
router.post('/coupons', checkAdmin, async (req, res) => {
  try {
    const {
      code,
      description,
      discountType, // 'percentage' or 'fixed'
      discountValue,
      minOrderAmount = 0,
      maxDiscountAmount,
      usageLimit, // Total usage limit (null = unlimited)
      userLimit = 1, // Per-user usage limit
      validFrom,
      validUntil,
      isActive = true
    } = req.body

    // Validate required fields
    if (!code || !discountType || discountValue === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['code', 'discountType', 'discountValue']
      })
    }

    // Validate discount type
    if (!['percentage', 'fixed'].includes(discountType)) {
      return res.status(400).json({
        error: 'Invalid discountType',
        message: 'discountType must be either "percentage" or "fixed"'
      })
    }

    // Validate discount value
    if (discountType === 'percentage') {
      if (discountValue < 0 || discountValue > 100) {
        return res.status(400).json({
          error: 'Invalid discountValue',
          message: 'Percentage discount must be between 0 and 100'
        })
      }
    } else {
      if (discountValue < 0) {
        return res.status(400).json({
          error: 'Invalid discountValue',
          message: 'Fixed discount must be greater than or equal to 0'
        })
      }
    }

    // Validate dates
    let validFromDate = validFrom ? new Date(validFrom) : new Date()
    let validUntilDate = validUntil ? new Date(validUntil) : null

    if (validUntilDate && validUntilDate <= validFromDate) {
      return res.status(400).json({
        error: 'Invalid date range',
        message: 'validUntil must be after validFrom'
      })
    }

    // Check if coupon code already exists
    const { data: existingCoupon, error: checkError } = await supabaseAdmin
      .from('coupons')
      .select('id, code')
      .eq('code', code.toUpperCase().trim())
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      return res.status(500).json({
        error: 'Error checking coupon code',
        details: checkError.message
      })
    }

    if (existingCoupon) {
      return res.status(409).json({
        error: 'Coupon code already exists',
        message: `A coupon with code "${code}" already exists`
      })
    }

    // Create coupon
    const couponData = {
      code: code.toUpperCase().trim(),
      description: description || null,
      discount_type: discountType,
      discount_value: parseFloat(discountValue),
      min_order_amount: parseFloat(minOrderAmount || 0),
      max_discount_amount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
      usage_limit: usageLimit ? parseInt(usageLimit) : null,
      user_limit: parseInt(userLimit || 1),
      valid_from: validFromDate.toISOString(),
      valid_until: validUntilDate ? validUntilDate.toISOString() : null,
      is_active: Boolean(isActive),
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: coupon, error: createError } = await supabaseAdmin
      .from('coupons')
      .insert([couponData])
      .select()
      .single()

    if (createError) {
      console.error('Coupon creation error:', createError)
      return res.status(500).json({
        error: 'Failed to create coupon',
        details: createError.message
      })
    }

    res.status(201).json({
      message: 'Coupon created successfully',
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discount_type,
        discountValue: parseFloat(coupon.discount_value),
        minOrderAmount: parseFloat(coupon.min_order_amount),
        maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null,
        usageLimit: coupon.usage_limit,
        usageCount: coupon.usage_count,
        userLimit: coupon.user_limit,
        validFrom: coupon.valid_from,
        validUntil: coupon.valid_until,
        isActive: coupon.is_active,
        createdAt: coupon.created_at,
        updatedAt: coupon.updated_at
      }
    })
  } catch (error) {
    console.error('Create coupon error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// PROMOTIONS MANAGEMENT
// ============================================

// Get all promotions (admin view)
router.get('/promotions', checkAdmin, async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      isActive,
      sortBy = 'display_order',
      sortOrder = 'asc'
    } = req.query

    let query = supabaseAdmin
      .from('promotions')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filters
    if (isActive !== undefined) {
      query = query.eq('is_active', isActive === 'true')
    }

    const { data: promotions, error, count } = await query

    if (error) {
      return res.status(500).json({
        error: 'Error fetching promotions',
        details: error.message
      })
    }

    // Format response
    const formattedPromotions = (promotions || []).map(promotion => ({
      id: promotion.id,
      headerText: promotion.header_text,
      subtitle: promotion.subtitle,
      mainTitle: promotion.main_title,
      countdownEndDate: promotion.countdown_end_date,
      buttonText: promotion.button_text,
      buttonLink: promotion.button_link,
      productImage: promotion.product_image,
      backgroundImage: promotion.background_image,
      backgroundColor: promotion.background_color,
      isActive: promotion.is_active,
      displayOrder: promotion.display_order,
      createdBy: promotion.created_by,
      createdAt: promotion.created_at,
      updatedAt: promotion.updated_at
    }))

    res.json({
      promotions: formattedPromotions,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Get promotions error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single promotion by ID
router.get('/promotions/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid promotion ID format' })
    }

    const { data: promotion, error } = await supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
        return res.status(404).json({ error: 'Promotion not found' })
      }
      return res.status(500).json({
        error: 'Error fetching promotion',
        details: error.message
      })
    }

    res.json({
      id: promotion.id,
      headerText: promotion.header_text,
      subtitle: promotion.subtitle,
      mainTitle: promotion.main_title,
      countdownEndDate: promotion.countdown_end_date,
      buttonText: promotion.button_text,
      buttonLink: promotion.button_link,
      productImage: promotion.product_image,
      backgroundImage: promotion.background_image,
      backgroundColor: promotion.background_color,
      isActive: promotion.is_active,
      displayOrder: promotion.display_order,
      createdBy: promotion.created_by,
      createdAt: promotion.created_at,
      updatedAt: promotion.updated_at
    })
  } catch (error) {
    console.error('Get promotion error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create a new promotion
router.post('/promotions', checkAdmin, async (req, res) => {
  try {
    const {
      headerText,
      subtitle,
      mainTitle,
      countdownEndDate,
      buttonText = 'SHOP NOW',
      buttonLink = '/products',
      productImage,
      backgroundImage,
      backgroundColor = '#FEF3C7',
      isActive = true,
      displayOrder = 0
    } = req.body

    // Validate required fields
    if (!mainTitle) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['mainTitle']
      })
    }

    // Validate countdown date if provided
    let countdownDate = null
    if (countdownEndDate) {
      countdownDate = new Date(countdownEndDate)
      if (isNaN(countdownDate.getTime())) {
        return res.status(400).json({
          error: 'Invalid countdown end date format',
          message: 'Please provide a valid date in ISO format'
        })
      }
    }

    // Validate background color format (hex)
    if (backgroundColor && !/^#[0-9A-F]{6}$/i.test(backgroundColor)) {
      return res.status(400).json({
        error: 'Invalid background color format',
        message: 'Background color must be a valid hex color code (e.g., #FEF3C7)'
      })
    }

    // If setting this promotion as active, deactivate all other promotions
    // Only one promotion can be active at a time
    if (isActive) {
      const { error: deactivateError } = await supabaseAdmin
        .from('promotions')
        .update({ is_active: false })
        .eq('is_active', true)

      if (deactivateError) {
        console.error('Error deactivating other promotions:', deactivateError)
        return res.status(500).json({
          error: 'Failed to deactivate other promotions',
          details: deactivateError.message
        })
      }
    }

    // Create promotion
    const promotionData = {
      header_text: headerText || null,
      subtitle: subtitle || null,
      main_title: mainTitle.trim(),
      countdown_end_date: countdownDate ? countdownDate.toISOString() : null,
      button_text: buttonText || 'SHOP NOW',
      button_link: buttonLink || '/products',
      product_image: productImage || null,
      background_image: backgroundImage || null,
      background_color: backgroundColor || '#FEF3C7',
      is_active: Boolean(isActive),
      display_order: parseInt(displayOrder || 0),
      created_by: req.user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data: promotion, error: createError } = await supabaseAdmin
      .from('promotions')
      .insert([promotionData])
      .select()
      .single()

    if (createError) {
      console.error('Promotion creation error:', createError)
      return res.status(500).json({
        error: 'Failed to create promotion',
        details: createError.message
      })
    }

    res.status(201).json({
      message: 'Promotion created successfully',
      promotion: {
        id: promotion.id,
        headerText: promotion.header_text,
        subtitle: promotion.subtitle,
        mainTitle: promotion.main_title,
        countdownEndDate: promotion.countdown_end_date,
        buttonText: promotion.button_text,
        buttonLink: promotion.button_link,
        productImage: promotion.product_image,
        backgroundImage: promotion.background_image,
        backgroundColor: promotion.background_color,
        isActive: promotion.is_active,
        displayOrder: promotion.display_order,
        createdAt: promotion.created_at,
        updatedAt: promotion.updated_at
      }
    })
  } catch (error) {
    console.error('Create promotion error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update a promotion
router.put('/promotions/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid promotion ID format' })
    }

    // Check if promotion exists
    const { data: existingPromotion, error: checkError } = await supabaseAdmin
      .from('promotions')
      .select('id')
      .eq('id', id)
      .single()

    if (checkError || !existingPromotion) {
      return res.status(404).json({ error: 'Promotion not found' })
    }

    // Prepare update data
    const updateData = {}
    
    if (updates.headerText !== undefined) {
      // Convert empty string to null to clear the field
      updateData.header_text = updates.headerText?.trim() || null
    }
    if (updates.subtitle !== undefined) {
      // Convert empty string to null to clear the field
      updateData.subtitle = updates.subtitle?.trim() || null
    }
    if (updates.mainTitle !== undefined) {
      // Main title is required, so keep trimmed value (empty string allowed for validation)
      updateData.main_title = updates.mainTitle?.trim()
    }
    if (updates.countdownEndDate !== undefined) {
      if (updates.countdownEndDate) {
        const countdownDate = new Date(updates.countdownEndDate)
        if (isNaN(countdownDate.getTime())) {
          return res.status(400).json({
            error: 'Invalid countdown end date format'
          })
        }
        updateData.countdown_end_date = countdownDate.toISOString()
      } else {
        updateData.countdown_end_date = null
      }
    }
    if (updates.buttonText !== undefined) updateData.button_text = updates.buttonText
    if (updates.buttonLink !== undefined) updateData.button_link = updates.buttonLink
    if (updates.productImage !== undefined) {
      // Convert empty string to null to clear the image
      updateData.product_image = updates.productImage?.trim() || null
    }
    if (updates.backgroundImage !== undefined) {
      // Convert empty string to null to clear the image
      updateData.background_image = updates.backgroundImage?.trim() || null
    }
    if (updates.backgroundColor !== undefined) {
      if (!/^#[0-9A-F]{6}$/i.test(updates.backgroundColor)) {
        return res.status(400).json({
          error: 'Invalid background color format'
        })
      }
      updateData.background_color = updates.backgroundColor
    }
    if (updates.isActive !== undefined) updateData.is_active = Boolean(updates.isActive)
    if (updates.displayOrder !== undefined) updateData.display_order = parseInt(updates.displayOrder)

    // If setting this promotion as active, deactivate all other promotions
    // Only one promotion can be active at a time
    if (updates.isActive === true) {
      const { error: deactivateError } = await supabaseAdmin
        .from('promotions')
        .update({ is_active: false })
        .eq('is_active', true)
        .neq('id', id) // Don't deactivate the current promotion

      if (deactivateError) {
        console.error('Error deactivating other promotions:', deactivateError)
        return res.status(500).json({
          error: 'Failed to deactivate other promotions',
          details: deactivateError.message
        })
      }
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString()

    // Update promotion
    const { data: promotion, error: updateError } = await supabaseAdmin
      .from('promotions')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Promotion update error:', updateError)
      return res.status(500).json({
        error: 'Failed to update promotion',
        details: updateError.message
      })
    }

    res.json({
      message: 'Promotion updated successfully',
      promotion: {
        id: promotion.id,
        headerText: promotion.header_text,
        subtitle: promotion.subtitle,
        mainTitle: promotion.main_title,
        countdownEndDate: promotion.countdown_end_date,
        buttonText: promotion.button_text,
        buttonLink: promotion.button_link,
        productImage: promotion.product_image,
        backgroundImage: promotion.background_image,
        backgroundColor: promotion.background_color,
        isActive: promotion.is_active,
        displayOrder: promotion.display_order,
        createdAt: promotion.created_at,
        updatedAt: promotion.updated_at
      }
    })
  } catch (error) {
    console.error('Update promotion error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete a promotion
router.delete('/promotions/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid promotion ID format' })
    }

    // Check if promotion exists
    const { data: promotion, error: checkError } = await supabaseAdmin
      .from('promotions')
      .select('id, main_title')
      .eq('id', id)
      .single()

    if (checkError || !promotion) {
      return res.status(404).json({ error: 'Promotion not found' })
    }

    // Delete promotion
    const { error: deleteError } = await supabaseAdmin
      .from('promotions')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Promotion deletion error:', deleteError)
      return res.status(500).json({
        error: 'Failed to delete promotion',
        details: deleteError.message
      })
    }

    res.json({
      message: 'Promotion deleted successfully',
      deletedPromotion: {
        id: promotion.id,
        mainTitle: promotion.main_title
      }
    })
  } catch (error) {
    console.error('Delete promotion error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ============================================
// PRODUCT REVIEWS MANAGEMENT
// ============================================

// Get review statistics
router.get('/reviews/stats', checkAdmin, async (req, res) => {
  try {
    // Get total reviews count
    const { count: totalReviews, error: totalError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })

    if (totalError) {
      console.error('Error fetching total reviews:', totalError)
      return res.status(500).json({ error: 'Failed to fetch review statistics' })
    }

    // Get approved reviews count
    const { count: approvedCount, error: approvedError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    // Get pending reviews count
    const { count: pendingCount, error: pendingError } = await supabaseAdmin
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    // Get average rating from approved reviews
    const { data: approvedReviews, error: avgError } = await supabaseAdmin
      .from('reviews')
      .select('rating')
      .eq('status', 'approved')

    if (approvedError || pendingError || avgError) {
      console.error('Error fetching review stats:', { approvedError, pendingError, avgError })
    }

    // Calculate average rating
    let averageRating = 0
    if (approvedReviews && approvedReviews.length > 0) {
      const sum = approvedReviews.reduce((acc, review) => acc + parseFloat(review.rating || 0), 0)
      averageRating = sum / approvedReviews.length
    }

    res.json({
      totalReviews: totalReviews || 0,
      approved: approvedCount || 0,
      pending: pendingCount || 0,
      rejected: (totalReviews || 0) - (approvedCount || 0) - (pendingCount || 0),
      averageRating: parseFloat(averageRating.toFixed(1))
    })
  } catch (error) {
    console.error('Get review stats error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get all reviews with filters
router.get('/reviews', checkAdmin, async (req, res) => {
  try {
    const {
      status,
      rating,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query

    // Build query with product information
    let query = supabaseAdmin
      .from('reviews')
      .select(`
        *,
        products (
          id,
          name,
          main_image,
          image_url
        )
      `, { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filters
    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (rating && rating !== 'all') {
      query = query.eq('rating', parseInt(rating))
    }

    if (search) {
      query = query.or(`review_text.ilike.%${search}%,customer_name.ilike.%${search}%,customer_email.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching reviews:', error)
      return res.status(500).json({ error: error.message })
    }

    // Format reviews for frontend
    const formattedReviews = (data || []).map(review => ({
      id: review.id,
      product: {
        id: review.products?.id,
        name: review.products?.name,
        image: review.products?.main_image || review.products?.image_url
      },
      customer: {
        name: review.customer_name,
        email: review.customer_email
      },
      rating: review.rating,
      review: review.review_text,
      helpfulCount: review.helpful_count || 0,
      status: review.status,
      date: review.created_at,
      createdAt: review.created_at,
      updatedAt: review.updated_at
    }))

    res.json({
      reviews: formattedReviews,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Get reviews error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Approve a review
router.put('/reviews/:id/approve', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid review ID format' })
    }

    // Check if review exists
    const { data: review, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('*')
      .eq('id', id)
      .single()

    if (checkError || !review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    // Update review status to approved
    const { data: updatedReview, error: updateError } = await supabaseAdmin
      .from('reviews')
      .update({
        status: 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error approving review:', updateError)
      return res.status(500).json({
        error: 'Failed to approve review',
        details: updateError.message
      })
    }

    res.json({
      message: 'Review approved successfully',
      review: updatedReview
    })
  } catch (error) {
    console.error('Approve review error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Reject a review
router.put('/reviews/:id/reject', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid review ID format' })
    }

    // Check if review exists
    const { data: review, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('*')
      .eq('id', id)
      .single()

    if (checkError || !review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    // Update review status to rejected
    const { data: updatedReview, error: updateError } = await supabaseAdmin
      .from('reviews')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error rejecting review:', updateError)
      return res.status(500).json({
        error: 'Failed to reject review',
        details: updateError.message
      })
    }

    res.json({
      message: 'Review rejected successfully',
      review: updatedReview
    })
  } catch (error) {
    console.error('Reject review error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete a review
router.delete('/reviews/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid review ID format' })
    }

    // Check if review exists
    const { data: review, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('id, customer_name, product_id')
      .eq('id', id)
      .single()

    if (checkError || !review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    // Delete review
    const { error: deleteError } = await supabaseAdmin
      .from('reviews')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting review:', deleteError)
      return res.status(500).json({
        error: 'Failed to delete review',
        details: deleteError.message
      })
    }

    res.json({
      message: 'Review deleted successfully',
      deletedReview: {
        id: review.id,
        customerName: review.customer_name
      }
    })
  } catch (error) {
    console.error('Delete review error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Bulk actions for reviews
router.post('/reviews/bulk-action', checkAdmin, async (req, res) => {
  try {
    const { reviewIds, action } = req.body

    if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
      return res.status(400).json({ error: 'Review IDs are required' })
    }

    if (!action || !['approve', 'reject', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be approve, reject, or delete' })
    }

    // Validate all IDs are UUIDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const invalidIds = reviewIds.filter(id => !uuidRegex.test(id))
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: 'Invalid review ID format', invalidIds })
    }

    let result
    if (action === 'delete') {
      // Delete reviews
      const { error: deleteError } = await supabaseAdmin
        .from('reviews')
        .delete()
        .in('id', reviewIds)

      if (deleteError) {
        console.error('Error bulk deleting reviews:', deleteError)
        return res.status(500).json({
          error: 'Failed to delete reviews',
          details: deleteError.message
        })
      }

      result = { deleted: reviewIds.length }
    } else {
      // Approve or reject reviews
      const status = action === 'approve' ? 'approved' : 'rejected'
      const { error: updateError } = await supabaseAdmin
        .from('reviews')
        .update({
          status: status,
          updated_at: new Date().toISOString()
        })
        .in('id', reviewIds)

      if (updateError) {
        console.error(`Error bulk ${action}ing reviews:`, updateError)
        return res.status(500).json({
          error: `Failed to ${action} reviews`,
          details: updateError.message
        })
      }

      result = { [action === 'approve' ? 'approved' : 'rejected']: reviewIds.length }
    }

    res.json({
      message: `Successfully ${action === 'delete' ? 'deleted' : action + 'd'} ${reviewIds.length} review(s)`,
      ...result
    })
  } catch (error) {
    console.error('Bulk action error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
