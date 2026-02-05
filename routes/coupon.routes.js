import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const router = express.Router()

// Helper function to authenticate user (optional for public endpoints)
const authenticateUser = async (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { user: null, error: null }
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    return { user: null, error: null } // Don't fail, just return no user
  }

  return { user, error: null }
}

// Get available coupons (public endpoint)
router.get('/', async (req, res) => {
  try {
    const { active = 'true' } = req.query

    let query = supabase
      .from('coupons')
      .select('id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount, valid_from, valid_until, is_active')
      .eq('is_active', active === 'true')
      .lte('valid_from', new Date().toISOString())
      .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })

    const { data: coupons, error } = await query

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
      validFrom: coupon.valid_from,
      validUntil: coupon.valid_until,
      isActive: coupon.is_active
    }))

    res.json({
      coupons: formattedCoupons,
      total: formattedCoupons.length
    })
  } catch (error) {
    console.error('Get coupons error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Apply/Validate a coupon code
router.post('/apply', async (req, res) => {
  try {
    const { code, orderAmount } = req.body

    // Validate required fields
    if (!code) {
      return res.status(400).json({
        error: 'Coupon code is required'
      })
    }

    if (orderAmount === undefined || orderAmount < 0) {
      return res.status(400).json({
        error: 'Valid order amount is required'
      })
    }

    // Get user if authenticated (for user limit checking)
    const authResult = await authenticateUser(req)
    const userId = authResult.user?.id || null

    // Find the coupon
    const { data: coupon, error: couponError } = await supabaseAdmin
      .from('coupons')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single()

    if (couponError || !coupon) {
      return res.status(404).json({
        error: 'Invalid coupon code',
        message: 'The coupon code you entered is invalid or does not exist'
      })
    }

    // Check if coupon is active
    if (!coupon.is_active) {
      return res.status(400).json({
        error: 'Coupon is not active',
        message: 'This coupon is currently inactive'
      })
    }

    // Check validity dates
    const now = new Date()
    const validFrom = new Date(coupon.valid_from)
    const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null

    if (now < validFrom) {
      return res.status(400).json({
        error: 'Coupon not yet valid',
        message: `This coupon becomes valid on ${validFrom.toLocaleDateString()}`
      })
    }

    if (validUntil && now > validUntil) {
      return res.status(400).json({
        error: 'Coupon has expired',
        message: `This coupon expired on ${validUntil.toLocaleDateString()}`
      })
    }

    // Check minimum order amount
    if (orderAmount < coupon.min_order_amount) {
      return res.status(400).json({
        error: 'Minimum order amount not met',
        message: `This coupon requires a minimum order of ₦${coupon.min_order_amount.toLocaleString()}`
      })
    }

    // Check total usage limit
    if (coupon.usage_limit && coupon.usage_count >= coupon.usage_limit) {
      return res.status(400).json({
        error: 'Coupon usage limit reached',
        message: 'This coupon has reached its maximum usage limit'
      })
    }

    // Check per-user usage limit (if user is authenticated)
    if (userId && coupon.user_limit) {
      const { count: userUsageCount, error: usageError } = await supabaseAdmin
        .from('coupon_usage')
        .select('*', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('user_id', userId)

      if (usageError) {
        console.error('Error checking user coupon usage:', usageError)
      } else if (userUsageCount >= coupon.user_limit) {
        return res.status(400).json({
          error: 'Coupon usage limit reached',
          message: `You have already used this coupon ${userUsageCount} time(s). Maximum allowed: ${coupon.user_limit}`
        })
      }
    }

    // Calculate discount
    let discountAmount = 0

    if (coupon.discount_type === 'percentage') {
      discountAmount = (orderAmount * parseFloat(coupon.discount_value)) / 100
      
      // Apply max discount if specified
      if (coupon.max_discount_amount && discountAmount > coupon.max_discount_amount) {
        discountAmount = parseFloat(coupon.max_discount_amount)
      }
    } else {
      // Fixed amount
      discountAmount = parseFloat(coupon.discount_value)
      
      // Don't exceed order amount
      if (discountAmount > orderAmount) {
        discountAmount = orderAmount
      }
    }

    // Calculate final amount
    const finalAmount = Math.max(0, orderAmount - discountAmount)

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discount_type,
        discountValue: parseFloat(coupon.discount_value),
        minOrderAmount: parseFloat(coupon.min_order_amount),
        maxDiscountAmount: coupon.max_discount_amount ? parseFloat(coupon.max_discount_amount) : null
      },
      calculation: {
        originalAmount: parseFloat(orderAmount),
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        finalAmount: parseFloat(finalAmount.toFixed(2))
      },
      message: 'Coupon applied successfully'
    })
  } catch (error) {
    console.error('Apply coupon error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
