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

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
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
        // Static admin credentials correct but no Supabase session
        // Return success but note that they may need to be created in Supabase
        return res.status(401).json({
          error: 'Admin account needs to be created in Supabase first',
          message: 'Please ensure the admin account exists in the authentication system.',
          staticAdmin: true
        })
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

export default router
