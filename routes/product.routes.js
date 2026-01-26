import express from 'express'
import { supabase } from '../config/supabase.js'

const router = express.Router()

// Get all products (public endpoint - no auth required)
router.get('/', async (req, res) => {
  try {
    const {
      badge,
      category,
      featured,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query

    // Build query - only show active products for public
    // Fetch products with their categories from junction table
    let query = supabase
      .from('products')
      .select('*, product_categories(category)', { count: 'exact' })
      .eq('product_status', 'Active') // Only show active products

    // Apply filters
    if (badge) {
      // Support multiple badges (comma-separated) or single badge
      const badges = badge.split(',').map(b => b.trim())
      if (badges.length === 1) {
        query = query.eq('badge', badges[0])
      } else {
        query = query.in('badge', badges)
      }
    }

    // Note: Category filtering is done in JavaScript to check both
    // legacy 'category' field and 'product_categories' junction table

    if (featured === 'true' || featured === true) {
      query = query.eq('featured', true)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,short_description.ilike.%${search}%`)
    }

    // Execute query to get all matching products
    const { data: allData, error } = await query

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Filter by category if provided (check both legacy field and junction table)
    let filteredData = allData || []
    if (category) {
      const categoryLower = category.toLowerCase().trim()
      filteredData = filteredData.filter(product => {
        // Check legacy category field (case-insensitive)
        const legacyMatch = product.category && 
          product.category.toLowerCase() === categoryLower
        
        // Check product_categories junction table (case-insensitive)
        const junctionMatch = product.product_categories && 
          Array.isArray(product.product_categories) &&
          product.product_categories.some(pc => 
            pc && pc.category && pc.category.toLowerCase() === categoryLower
          )
        
        return legacyMatch || junctionMatch
      })
    }

    // Sort the filtered data
    filteredData.sort((a, b) => {
      const aVal = a[sortBy] || ''
      const bVal = b[sortBy] || ''
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      }
    })

    // Apply pagination after filtering
    const total = filteredData.length
    const paginatedData = filteredData.slice(
      parseInt(offset), 
      parseInt(offset) + parseInt(limit)
    )

    res.json({
      products: paginatedData,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: total > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get single product by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Product not found' })
    }

    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Create product (admin only - add auth middleware later)
router.post('/', async (req, res) => {
  try {
    const product = req.body

    const { data, error } = await supabase
      .from('products')
      .insert([product])
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

// Update product (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    const { data, error } = await supabase
      .from('products')
      .update(updates)
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

// Delete product (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Product deleted successfully' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router

