import express from 'express'
import { supabase } from '../config/supabase.js'
import { convertProductFields } from '../utils/fieldConverter.js'

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

    // Convert camelCase fields to snake_case and extract special fields
    const { converted: dbProduct, categories } = convertProductFields(product)

    // Update legacy category field if categories are provided
    if (categories !== undefined && Array.isArray(categories) && categories.length > 0) {
      dbProduct.category = categories[0] // Set first category for legacy field
    } else if (!dbProduct.category) {
      // Ensure category field exists (required by schema)
      dbProduct.category = 'Uncategorized'
    }

    // Insert product into database
    const { data, error } = await supabase
      .from('products')
      .insert([dbProduct])
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Insert categories into junction table if provided
    if (categories !== undefined && Array.isArray(categories) && categories.length > 0) {
      const categoryInserts = categories
        .filter(cat => cat && cat.trim()) // Filter out empty/null categories
        .map(category => ({
          product_id: data.id,
          category: category.trim()
        }))

      if (categoryInserts.length > 0) {
        const { error: categoryError } = await supabase
          .from('product_categories')
          .insert(categoryInserts)

        if (categoryError) {
          console.error('Category insertion error:', categoryError)
          // Product was created but categories failed - still return success with warning
          return res.status(201).json({
            ...data,
            warning: 'Product created but failed to add categories',
            categoryError: categoryError.message
          })
        }
      }
    }

    // Fetch product with categories for response
    const { data: productWithCategories } = await supabase
      .from('products')
      .select(`
        *,
        product_categories (
          category
        )
      `)
      .eq('id', data.id)
      .single()

    res.status(201).json(productWithCategories || data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update product (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Convert camelCase fields to snake_case and extract special fields
    const { converted: dbUpdates, categories } = convertProductFields(updates)

    // Update legacy category field if categories are provided
    if (categories !== undefined && Array.isArray(categories) && categories.length > 0) {
      dbUpdates.category = categories[0] // Set first category for legacy field
    }

    // Update product
    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Update product_categories junction table if categories are provided
    if (categories !== undefined && Array.isArray(categories)) {
      // Delete existing categories for this product
      await supabase
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
          const { error: categoryError } = await supabase
            .from('product_categories')
            .insert(categoryInserts)

          if (categoryError) {
            console.error('Category update error:', categoryError)
            // Product was updated but categories failed - still return success with warning
            return res.json({
              ...data,
              warning: 'Product updated but categories update failed',
              categoryError: categoryError.message
            })
          }
        }
      }
    }

    // Fetch product with categories for response
    const { data: productWithCategories } = await supabase
      .from('products')
      .select(`
        *,
        product_categories (
          category
        )
      `)
      .eq('id', id)
      .single()

    res.json(productWithCategories || data)
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

