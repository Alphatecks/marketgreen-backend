import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'

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

// Get user's cart
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

    // Get cart items with product information (use admin client to bypass RLS)
    const { data: cartItems, error: cartError } = await supabaseAdmin
      .from('cart')
      .select(`
        *,
        products (
          id,
          name,
          current_price,
          price,
          original_price,
          discount_percentage,
          main_image,
          image_url,
          additional_images,
          stock_status,
          stock,
          product_status,
          slug
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (cartError) {
      console.error('Error fetching cart:', cartError)
      return res.status(500).json({ error: 'Failed to fetch cart', details: cartError.message })
    }

    // Format cart items for frontend
    const formattedCart = (cartItems || []).map(item => {
      // Handle product data - Supabase nested queries return products as object
      let product = item.products
      
      // If product is null or undefined, fetch it separately
      if (!product) {
        console.warn(`Product not found for cart item ${item.id}, product_id: ${item.product_id}`)
        return {
          id: item.id,
          productId: item.product_id,
          product: null,
          quantity: item.quantity,
          subtotal: 0,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }
      }
      
      // Normalize product images to ensure main_image and image_url are synchronized
      product = normalizeProductImages(product)
      
      // Get image URL - prioritize main_image, fallback to image_url, then first additional image
      let imageUrl = product?.main_image || product?.image_url || null
      
      // If no main image, try to get first additional image
      if (!imageUrl && product?.additional_images && Array.isArray(product.additional_images) && product.additional_images.length > 0) {
        imageUrl = product.additional_images[0]
      }
      
      // Debug: Log if image is still missing
      if (!imageUrl) {
        console.warn(`No image found for product ${product?.id || 'unknown'} in cart item ${item.id}`, {
          hasProduct: !!product,
          main_image: product?.main_image,
          image_url: product?.image_url,
          hasAdditionalImages: !!product?.additional_images,
          additionalImagesCount: product?.additional_images?.length || 0
        })
      }
      
      const price = product?.current_price || product?.price || 0
      const originalPrice = product?.original_price || price
      const subtotal = parseFloat(price) * item.quantity

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
          productStatus: product?.product_status
        },
        quantity: item.quantity,
        subtotal: subtotal,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }
    }).filter(item => item !== null && item.product !== null) // Filter out items with missing products

    // Calculate totals
    const total = formattedCart.reduce((sum, item) => sum + item.subtotal, 0)
    const itemCount = formattedCart.reduce((sum, item) => sum + item.quantity, 0)

    res.json({
      items: formattedCart,
      total: parseFloat(total.toFixed(2)),
      itemCount: itemCount,
      itemTypes: formattedCart.length
    })
  } catch (error) {
    console.error('Get cart error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Add item to cart
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

    const { productId, quantity = 1 } = req.body

    // Validate required fields
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    if (quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    // Check if product exists and is active
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('id, name, current_price, price, stock, stock_status, product_status')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    if (product.product_status !== 'Active') {
      return res.status(400).json({ error: 'Product is not available for purchase' })
    }

    // Check stock availability
    if (product.stock_status === 'Out of Stock' || (product.stock !== null && product.stock < quantity)) {
      return res.status(400).json({ 
        error: 'Insufficient stock available',
        availableStock: product.stock || 0
      })
    }

    // Check if item already exists in cart
    const { data: existingItem, error: checkError } = await supabaseAdmin
      .from('cart')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking existing cart item:', checkError)
      return res.status(500).json({ error: 'Error checking cart' })
    }

    let cartItem

    if (existingItem) {
      // Update quantity if item already exists
      const newQuantity = existingItem.quantity + quantity

      // Check stock again with new quantity
      if (product.stock !== null && product.stock < newQuantity) {
        return res.status(400).json({ 
          error: 'Insufficient stock available',
          availableStock: product.stock,
          currentCartQuantity: existingItem.quantity,
          requestedQuantity: quantity
        })
      }

      const { data: updatedItem, error: updateError } = await supabaseAdmin
        .from('cart')
        .update({
          quantity: newQuantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingItem.id)
        .select()
        .single()

      if (updateError) {
        console.error('Error updating cart item:', updateError)
        return res.status(500).json({ error: 'Failed to update cart item', details: updateError.message })
      }

      cartItem = updatedItem
    } else {
      // Insert new cart item
      const { data: newItem, error: insertError } = await supabaseAdmin
        .from('cart')
        .insert([{
          user_id: user.id,
          product_id: productId,
          quantity: quantity
        }])
        .select()
        .single()

      if (insertError) {
        console.error('Error adding to cart:', insertError)
        return res.status(500).json({ error: 'Failed to add item to cart', details: insertError.message })
      }

      cartItem = newItem
    }

    res.status(201).json({
      message: existingItem ? 'Cart item updated' : 'Item added to cart',
      cartItem: {
        id: cartItem.id,
        productId: cartItem.product_id,
        quantity: cartItem.quantity,
        createdAt: cartItem.created_at,
        updatedAt: cartItem.updated_at
      }
    })
  } catch (error) {
    console.error('Add to cart error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Update cart item quantity
router.put('/:id', async (req, res) => {
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
    const { quantity } = req.body

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid cart item ID format' })
    }

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'Quantity must be at least 1' })
    }

    // Check if cart item exists and belongs to user
    const { data: cartItem, error: checkError } = await supabaseAdmin
      .from('cart')
      .select('*, products(id, stock, stock_status, product_status)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (checkError || !cartItem) {
      return res.status(404).json({ error: 'Cart item not found' })
    }

    // Check product availability
    const product = cartItem.products
    if (product.product_status !== 'Active') {
      return res.status(400).json({ error: 'Product is no longer available' })
    }

    // Check stock availability
    if (product.stock !== null && product.stock < quantity) {
      return res.status(400).json({ 
        error: 'Insufficient stock available',
        availableStock: product.stock || 0
      })
    }

    // Update quantity
    const { data: updatedItem, error: updateError } = await supabaseAdmin
      .from('cart')
      .update({
        quantity: quantity,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating cart item:', updateError)
      return res.status(500).json({ error: 'Failed to update cart item', details: updateError.message })
    }

    res.json({
      message: 'Cart item updated',
      cartItem: {
        id: updatedItem.id,
        productId: updatedItem.product_id,
        quantity: updatedItem.quantity,
        updatedAt: updatedItem.updated_at
      }
    })
  } catch (error) {
    console.error('Update cart item error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Remove item from cart
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

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid cart item ID format' })
    }

    // Check if cart item exists and belongs to user
    const { data: cartItem, error: checkError } = await supabaseAdmin
      .from('cart')
      .select('id, product_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (checkError || !cartItem) {
      return res.status(404).json({ error: 'Cart item not found' })
    }

    // Delete cart item
    const { error: deleteError } = await supabaseAdmin
      .from('cart')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting cart item:', deleteError)
      return res.status(500).json({ error: 'Failed to remove item from cart', details: deleteError.message })
    }

    res.json({
      message: 'Item removed from cart',
      deletedItem: {
        id: cartItem.id,
        productId: cartItem.product_id
      }
    })
  } catch (error) {
    console.error('Remove from cart error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Clear entire cart
router.delete('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    // Delete all cart items for user
    const { error: deleteError } = await supabaseAdmin
      .from('cart')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error clearing cart:', deleteError)
      return res.status(500).json({ error: 'Failed to clear cart', details: deleteError.message })
    }

    res.json({
      message: 'Cart cleared successfully'
    })
  } catch (error) {
    console.error('Clear cart error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
