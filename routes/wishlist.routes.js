import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const router = express.Router()

// Helper function to normalize image fields in product responses
const normalizeProductImages = (product) => {
  if (!product) return product
  
  const imageUrl = product.main_image || product.image_url || null
  
  return {
    ...product,
    main_image: imageUrl,
    image_url: imageUrl
  }
}

// Get user's wishlist
router.get('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    // Get wishlist items with product information (use admin client to bypass RLS)
    const { data: wishlistItems, error: wishlistError } = await supabaseAdmin
      .from('wishlist')
      .select(`
        *,
        products (
          id,
          name,
          slug,
          current_price,
          price,
          original_price,
          discount_percentage,
          main_image,
          image_url,
          additional_images,
          rating,
          review_count,
          stock_status,
          product_status,
          stock,
          badge,
          short_description
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (wishlistError) {
      console.error('Error fetching wishlist:', wishlistError)
      return res.status(500).json({ 
        error: 'Failed to fetch wishlist',
        details: wishlistError.message 
      })
    }

    // Format the response
    const formattedWishlist = (wishlistItems || []).map(item => {
      let product = item.products
      if (!product) {
        console.warn(`Product not found for wishlist item ${item.id}, product_id: ${item.product_id}`)
        return {
          id: item.id,
          productId: item.product_id,
          product: null,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }
      }

      product = normalizeProductImages(product)

      // Get image URL - prioritize main_image, fallback to image_url, then first additional image
      let imageUrl = product?.main_image || product?.image_url || null
      
      if (!imageUrl && product?.additional_images && Array.isArray(product.additional_images) && product.additional_images.length > 0) {
        imageUrl = product.additional_images[0]
      }

      const price = product?.current_price || product?.price || 0
      const originalPrice = product?.original_price || product?.price || 0

      return {
        id: item.id,
        productId: item.product_id,
        product: {
          id: product?.id,
          name: product?.name,
          slug: product?.slug,
          price: parseFloat(price),
          originalPrice: parseFloat(originalPrice),
          discountPercentage: product?.discount_percentage || 0,
          image: imageUrl,
          stockStatus: product?.stock_status,
          stock: product?.stock || 0,
          productStatus: product?.product_status,
          rating: product?.rating || 0,
          reviewCount: product?.review_count || 0,
          badge: product?.badge || 'none',
          shortDescription: product?.short_description
        },
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }
    }).filter(item => item !== null && item.product !== null)

    res.json({
      wishlist: formattedWishlist,
      count: formattedWishlist.length
    })
  } catch (error) {
    console.error('Get wishlist error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Add item to wishlist
router.post('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { productId } = req.body

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    // Validate product exists
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name, product_status')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    if (product.product_status !== 'Active') {
      return res.status(400).json({ error: 'Product is not available' })
    }

    // Check if item already exists in wishlist
    const { data: existingItem, error: checkError } = await supabaseAdmin
      .from('wishlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .single()

    if (existingItem) {
      return res.status(409).json({ 
        error: 'Product already in wishlist',
        wishlistItem: existingItem
      })
    }

    // Add to wishlist (use admin client to bypass RLS)
    const { data: wishlistItem, error: insertError } = await supabaseAdmin
      .from('wishlist')
      .insert([{
        user_id: user.id,
        product_id: productId
      }])
      .select()
      .single()

    if (insertError) {
      console.error('Error adding to wishlist:', insertError)
      return res.status(500).json({ 
        error: 'Failed to add item to wishlist',
        details: insertError.message 
      })
    }

    res.status(201).json({
      message: 'Item added to wishlist successfully',
      wishlistItem
    })
  } catch (error) {
    console.error('Add to wishlist error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Remove item from wishlist
router.delete('/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { id } = req.params

    if (!id) {
      return res.status(400).json({ error: 'Wishlist item ID is required' })
    }

    // Verify the wishlist item belongs to the user
    const { data: wishlistItem, error: fetchError } = await supabaseAdmin
      .from('wishlist')
      .select('id, user_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !wishlistItem) {
      return res.status(404).json({ error: 'Wishlist item not found' })
    }

    // Delete the wishlist item (use admin client to bypass RLS)
    const { error: deleteError } = await supabaseAdmin
      .from('wishlist')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error removing from wishlist:', deleteError)
      return res.status(500).json({ 
        error: 'Failed to remove item from wishlist',
        details: deleteError.message 
      })
    }

    res.json({
      message: 'Item removed from wishlist successfully'
    })
  } catch (error) {
    console.error('Remove from wishlist error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Remove item from wishlist by product ID (alternative endpoint)
router.delete('/product/:productId', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { productId } = req.params

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    // Delete the wishlist item by product ID (use admin client to bypass RLS)
    const { error: deleteError } = await supabaseAdmin
      .from('wishlist')
      .delete()
      .eq('user_id', user.id)
      .eq('product_id', productId)

    if (deleteError) {
      console.error('Error removing from wishlist:', deleteError)
      return res.status(500).json({ 
        error: 'Failed to remove item from wishlist',
        details: deleteError.message 
      })
    }

    res.json({
      message: 'Item removed from wishlist successfully'
    })
  } catch (error) {
    console.error('Remove from wishlist error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
