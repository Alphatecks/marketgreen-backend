import express from 'express'
import { supabase } from '../config/supabase.js'
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

    // Normalize image fields to ensure main_image and image_url are synchronized
    const normalizedProducts = normalizeProductsImages(paginatedData)

    res.json({
      products: normalizedProducts,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: total > parseInt(offset) + parseInt(limit)
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get top rated products
router.get('/top-rated', async (req, res) => {
  try {
    const {
      minRating = 0,
      minReviews = 0,
      limit = 20,
      offset = 0,
      category
    } = req.query

    // Build query - only show active products
    let query = supabase
      .from('products')
      .select('*, product_categories(category)', { count: 'exact' })
      .eq('product_status', 'Active')
      .gte('rating', parseFloat(minRating))
      .gte('review_count', parseInt(minReviews))
      .order('rating', { ascending: false })
      .order('review_count', { ascending: false }) // Secondary sort by review count
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Execute query
    const { data, error, count } = await query

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    // Filter by category if provided (check both legacy field and junction table)
    let filteredData = data || []
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

    // Normalize image fields to ensure main_image and image_url are synchronized
    const normalizedProducts = normalizeProductsImages(filteredData)

    // Calculate total (if category filter was applied, we need to recalculate)
    let total = count || 0
    if (category) {
      total = filteredData.length
    }

    res.json({
      products: normalizedProducts,
      total: total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: total > parseInt(offset) + parseInt(limit),
      filters: {
        minRating: parseFloat(minRating),
        minReviews: parseInt(minReviews),
        category: category || null
      }
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

    // Normalize image fields to ensure main_image and image_url are synchronized
    const normalizedProduct = normalizeProductImages(data)

    res.json(normalizedProduct)
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

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    if (!data || data.length === 0) {
      return res.status(400).json({ error: 'Failed to create product' })
    }

    const createdProduct = data[0]

    // Insert categories into junction table if provided
    if (categories !== undefined && Array.isArray(categories) && categories.length > 0) {
      const categoryInserts = categories
        .filter(cat => cat && cat.trim()) // Filter out empty/null categories
        .map(category => ({
          product_id: createdProduct.id,
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
            ...createdProduct,
            warning: 'Product created but failed to add categories',
            categoryError: categoryError.message
          })
        }
      }
    }

    // Fetch product with categories for response
    const { data: productWithCategories, error: fetchError } = await supabase
      .from('products')
      .select(`
        *,
        product_categories (
          category
        )
      `)
      .eq('id', createdProduct.id)
      .maybeSingle()

    if (fetchError || !productWithCategories) {
      // If fetch fails, return the data from insert
      if (fetchError) {
        console.error('Error fetching product with categories:', fetchError)
      }
      // Normalize image fields before returning
      return res.status(201).json(normalizeProductImages(createdProduct))
    }

    // Normalize image fields before returning
    res.status(201).json(normalizeProductImages(productWithCategories))
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update product (admin only)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    // Check if product exists first
    const { data: existingProduct, error: checkError } = await supabase
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

    // Convert camelCase fields to snake_case and extract special fields
    const { converted: dbUpdates, categories } = convertProductFields(updates)

    // Synchronize image fields: ensure main_image and image_url stay in sync
    // If main_image is updated, also update image_url (for backward compatibility)
    if (dbUpdates.main_image !== undefined) {
      dbUpdates.image_url = dbUpdates.main_image
    }
    // If image_url is updated, also update main_image (for consistency)
    if (dbUpdates.image_url !== undefined && dbUpdates.main_image === undefined) {
      dbUpdates.main_image = dbUpdates.image_url
    }

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

    if (error) {
      console.error('Product update error:', error)
      // Check if it's an RLS policy error
      if (error.message?.includes('policy') || error.message?.includes('permission')) {
        return res.status(403).json({ 
          error: 'Permission denied. You may not have permission to update this product.',
          details: error.message 
        })
      }
      return res.status(400).json({ 
        error: 'Failed to update product',
        details: error.message 
      })
    }

    if (!data || data.length === 0) {
      // This shouldn't happen if product exists, but handle it anyway
      return res.status(404).json({ 
        error: 'Product update returned no results. The product may have been deleted or you may not have permission to update it.' 
      })
    }

    const updatedProduct = data[0]

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
              ...updatedProduct,
              warning: 'Product updated but categories update failed',
              categoryError: categoryError.message
            })
          }
        }
      }
    }

    // Fetch product with categories for response
    const { data: productWithCategories, error: fetchError } = await supabase
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
      return res.json(normalizeProductImages(updatedProduct))
    }

    // Normalize image fields before returning
    res.json(normalizeProductImages(productWithCategories))
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

