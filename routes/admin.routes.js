import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { validateEmail } from '../utils/validation.js'

const router = express.Router()

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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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
    // Last period sales (completed orders only)
    const { data: lastPeriodSales, error: lastPeriodSalesError } = await supabase
      .from('orders')
      .select('total_amount')
      .in('status', ['confirmed', 'shipped', 'delivered'])
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Previous period sales
    const { data: previousPeriodSales, error: previousPeriodSalesError } = await supabase
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
    // Last period orders count
    const { count: lastPeriodOrdersCount, error: lastPeriodOrdersError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Previous period orders count
    const { count: previousPeriodOrdersCount, error: previousPeriodOrdersError } = await supabase
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
    // Get pending orders count
    const { count: pendingCount, error: pendingError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())

    // Get canceled orders count
    const { count: canceledCount, error: canceledError } = await supabase
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

    // Get previous period pending & canceled for change calculation
    const { count: previousPendingCount, error: prevPendingError } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'canceled'])
      .gte('created_at', previousStartDate.toISOString())
      .lt('created_at', startDate.toISOString())

    const { count: previousCanceledCount } = await supabase
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

    let query = supabase
      .from('orders')
      .select('*', { count: 'exact' })
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
      orders: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (error) {
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

    const { data, error } = await supabase
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

    // Build query
    let query = supabase
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
        amountFormatted: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
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

// Get all categories with product counts
router.get('/categories', checkAdmin, async (req, res) => {
  try {
    const { limit = 10, offset = 0 } = req.query

    // Get all unique categories with product counts
    const { data: categoriesData, error: categoriesError } = await supabaseAdmin
      .from('products')
      .select('category')
      .order('category', { ascending: true })

    if (categoriesError) {
      return res.status(500).json({ error: categoriesError.message })
    }

    // Group by category and count products
    const categoryMap = {}
    categoriesData.forEach(product => {
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
      search,
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

    // Apply filters
    if (category) {
      query = query.eq('category', category)
    }

    if (status) {
      query = query.eq('status', status)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,sku.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    res.json({
      products: data || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Admin products error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single product (admin view)
router.get('/products/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json(data)
  } catch (error) {
    console.error('Admin product error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create new product
router.post('/products', checkAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      image_url,
      category,
      subcategory,
      stock = 0,
      unit = 'piece',
      weight,
      is_organic = false,
      is_fresh = true,
      expiry_date,
      brand,
      sku,
      status = 'active'
    } = req.body

    // Validation
    if (!name || !price || !category) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['name', 'price', 'category']
      })
    }

    if (price < 0) {
      return res.status(400).json({ error: 'Price must be greater than or equal to 0' })
    }

    if (stock < 0) {
      return res.status(400).json({ error: 'Stock must be greater than or equal to 0' })
    }

    if (!['active', 'inactive', 'out_of_stock'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: active, inactive, or out_of_stock' })
    }

    const productData = {
      name,
      description,
      price: parseFloat(price),
      image_url,
      category,
      subcategory,
      stock: parseInt(stock),
      unit,
      weight: weight ? parseFloat(weight) : null,
      is_organic: Boolean(is_organic),
      is_fresh: Boolean(is_fresh),
      expiry_date: expiry_date || null,
      brand: brand || null,
      sku: sku || null,
      status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([productData])
      .select()
      .single()

    if (error) {
      console.error('Product creation error:', error)
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'Product created successfully',
      product: data
    })
  } catch (error) {
    console.error('Create product error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update product
router.put('/products/:id', checkAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Validate price if provided
    if (updates.price !== undefined && updates.price < 0) {
      return res.status(400).json({ error: 'Price must be greater than or equal to 0' })
    }

    // Validate stock if provided
    if (updates.stock !== undefined && updates.stock < 0) {
      return res.status(400).json({ error: 'Stock must be greater than or equal to 0' })
    }

    // Validate status if provided
    if (updates.status && !['active', 'inactive', 'out_of_stock'].includes(updates.status)) {
      return res.status(400).json({ error: 'Invalid status. Must be: active, inactive, or out_of_stock' })
    }

    // Convert numeric fields
    if (updates.price !== undefined) {
      updates.price = parseFloat(updates.price)
    }
    if (updates.stock !== undefined) {
      updates.stock = parseInt(updates.stock)
    }
    if (updates.weight !== undefined && updates.weight !== null) {
      updates.weight = parseFloat(updates.weight)
    }

    // Convert boolean fields
    if (updates.is_organic !== undefined) {
      updates.is_organic = Boolean(updates.is_organic)
    }
    if (updates.is_fresh !== undefined) {
      updates.is_fresh = Boolean(updates.is_fresh)
    }

    // Add updated_at timestamp
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Product update error:', error)
      return res.status(400).json({ error: error.message })
    }

    if (!data) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json({
      message: 'Product updated successfully',
      product: data
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

    // Check if product exists
    const { data: product, error: fetchError } = await supabaseAdmin
      .from('products')
      .select('id, name')
      .eq('id', id)
      .single()

    if (fetchError || !product) {
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

    // Aggregate product sales from order items
    const productSales = {}

    orders.forEach(order => {
      if (!order.items || !Array.isArray(order.items)) {
        return
      }

      order.items.forEach(item => {
        const productId = item.product_id || item.id
        if (!productId) return

        const quantity = parseInt(item.quantity || 1)

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
    const productIds = topProducts.map(p => p.product_id)
    
    if (productIds.length === 0) {
      return res.json({
        products: [],
        period,
        total: 0
      })
    }

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('id, name, image_url, price, stock, status')
      .in('id', productIds)

    if (productsError) {
      console.error('Error fetching products:', productsError)
      return res.status(500).json({ error: productsError.message })
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

        return {
          id: product.id,
          name: product.name,
          image_url: product.image_url,
          price: parseFloat(product.price || 0),
          priceFormatted: new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
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

export default router
