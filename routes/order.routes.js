import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'

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

    // Check if user is admin using admin client to bypass RLS
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

// Get all orders (admin only)
router.get('/all', checkAdmin, async (req, res) => {
  try {
    const { 
      status, 
      payment_status, 
      user_id,
      startDate,
      endDate,
      limit = 50, 
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query

    // Build query using admin client to bypass RLS
    let query = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }

    if (payment_status) {
      query = query.eq('payment_status', payment_status)
    }

    if (user_id) {
      query = query.eq('user_id', user_id)
    }

    if (startDate) {
      query = query.gte('created_at', startDate)
    }

    if (endDate) {
      query = query.lte('created_at', endDate)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching all orders:', error)
      return res.status(500).json({ error: error.message })
    }

    res.json({
      orders: data || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    console.error('Get all orders error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get user's orders
router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    // Use admin client to fetch orders with proper user filtering
    // This ensures we get all orders for the user regardless of RLS
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching user orders:', error)
      return res.status(400).json({ error: error.message })
    }

    res.json(data || [])
  } catch (error) {
    console.error('Get user orders error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get single order
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    // Use admin client to fetch order with proper user filtering
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (error || !data) {
      return res.status(404).json({ error: 'Order not found' })
    }

    res.json(data)
  } catch (error) {
    console.error('Get single order error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Create new order
router.post('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError) {
      return res.status(401).json({ error: authError.message })
    }

    const order = {
      ...req.body,
      user_id: user.id,
      status: 'pending'
    }

    const { data, error } = await supabase
      .from('orders')
      .insert([order])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update order status (admin only - add auth middleware later)
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router

