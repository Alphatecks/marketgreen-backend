import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { validateEmail } from '../utils/validation.js'

const router = express.Router()

// Get reviews for a specific product (public endpoint - only approved reviews)
router.get('/products/:productId', async (req, res) => {
  try {
    const { productId } = req.params
    const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = req.query

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Get approved reviews for the product
    let query = supabase
      .from('reviews')
      .select('*', { count: 'exact' })
      .eq('product_id', productId)
      .eq('status', 'approved')
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching reviews:', error)
      return res.status(500).json({ error: error.message })
    }

    // Format reviews for frontend
    const formattedReviews = (data || []).map(review => ({
      id: review.id,
      customerName: review.customer_name,
      rating: review.rating,
      reviewText: review.review_text,
      helpfulCount: review.helpful_count || 0,
      createdAt: review.created_at,
      updatedAt: review.updated_at
    }))

    res.json({
      reviews: formattedReviews,
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (count || 0) > parseInt(offset) + parseInt(limit),
      product: {
        id: product.id,
        name: product.name
      }
    })
  } catch (error) {
    console.error('Get product reviews error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Submit a review (requires authentication)
router.post('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required to submit a review' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { productId, rating, reviewText, customerName, customerEmail } = req.body

    // Validate required fields
    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' })
    }

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' })
    }

    if (!reviewText || reviewText.trim().length === 0) {
      return res.status(400).json({ error: 'Review text is required' })
    }

    if (reviewText.trim().length < 10) {
      return res.status(400).json({ error: 'Review text must be at least 10 characters' })
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(productId)) {
      return res.status(400).json({ error: 'Invalid product ID format' })
    }

    // Check if product exists
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, name')
      .eq('id', productId)
      .single()

    if (productError || !product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // Get user profile to get name and email if not provided
    let reviewCustomerName = customerName
    let reviewCustomerEmail = customerEmail

    if (!reviewCustomerName || !reviewCustomerEmail) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

      if (!profileError && profile) {
        reviewCustomerName = reviewCustomerName || profile.full_name || user.email?.split('@')[0] || 'Customer'
        reviewCustomerEmail = reviewCustomerEmail || profile.email || user.email
      } else {
        // Fallback to user email
        reviewCustomerName = reviewCustomerName || user.email?.split('@')[0] || 'Customer'
        reviewCustomerEmail = reviewCustomerEmail || user.email
      }
    }

    // Validate email format
    if (!validateEmail(reviewCustomerEmail)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    // Check if user has already reviewed this product (use admin client to bypass RLS)
    const { data: existingReview, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('product_id', productId)
      .eq('user_id', user.id)
      .single()

    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('Error checking existing review:', checkError)
      return res.status(500).json({ error: 'Error checking for existing review' })
    }

    if (existingReview) {
      return res.status(400).json({ 
        error: 'You have already submitted a review for this product',
        reviewId: existingReview.id
      })
    }

    // Create review (status will be 'pending' by default, needs admin approval)
    // Use admin client to bypass RLS, but we've already validated the user is authenticated
    const reviewData = {
      product_id: productId,
      user_id: user.id,
      customer_name: reviewCustomerName.trim(),
      customer_email: reviewCustomerEmail.trim(),
      rating: parseInt(rating),
      review_text: reviewText.trim(),
      status: 'pending' // Reviews need admin approval
    }

    const { data: review, error: createError } = await supabaseAdmin
      .from('reviews')
      .insert([reviewData])
      .select()
      .single()

    if (createError) {
      console.error('Error creating review:', createError)
      return res.status(500).json({
        error: 'Failed to submit review',
        details: createError.message
      })
    }

    res.status(201).json({
      message: 'Review submitted successfully. It will be visible after admin approval.',
      review: {
        id: review.id,
        productId: review.product_id,
        rating: review.rating,
        reviewText: review.review_text,
        status: review.status,
        createdAt: review.created_at
      }
    })
  } catch (error) {
    console.error('Submit review error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Mark a review as helpful (public endpoint - no auth required)
router.post('/:id/helpful', async (req, res) => {
  try {
    const { id } = req.params

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(id)) {
      return res.status(400).json({ error: 'Invalid review ID format' })
    }

    // Check if review exists and is approved (use admin client to bypass RLS)
    const { data: review, error: checkError } = await supabaseAdmin
      .from('reviews')
      .select('id, helpful_count, status')
      .eq('id', id)
      .single()

    if (checkError || !review) {
      return res.status(404).json({ error: 'Review not found' })
    }

    if (review.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved reviews can be marked as helpful' })
    }

    // Increment helpful count (use admin client to bypass RLS)
    const { data: updatedReview, error: updateError } = await supabaseAdmin
      .from('reviews')
      .update({
        helpful_count: (review.helpful_count || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('helpful_count')
      .single()

    if (updateError) {
      console.error('Error updating helpful count:', updateError)
      return res.status(500).json({
        error: 'Failed to update helpful count',
        details: updateError.message
      })
    }

    res.json({
      message: 'Review marked as helpful',
      helpfulCount: updatedReview.helpful_count
    })
  } catch (error) {
    console.error('Mark helpful error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get user's own reviews (authenticated endpoint)
router.get('/my-reviews', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    const { limit = 50, offset = 0 } = req.query

    // Get user's reviews with product information (use admin client to bypass RLS)
    const { data, error, count } = await supabaseAdmin
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
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    if (error) {
      console.error('Error fetching user reviews:', error)
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
      rating: review.rating,
      reviewText: review.review_text,
      helpfulCount: review.helpful_count || 0,
      status: review.status,
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
    console.error('Get user reviews error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
