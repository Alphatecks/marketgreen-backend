import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'

const router = express.Router()

// Helper function to format time ago
const formatTimeAgo = (date) => {
  const now = new Date()
  const past = new Date(date)
  const diffInSeconds = Math.floor((now - past) / 1000)
  
  if (diffInSeconds < 60) {
    return 'Just now'
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`
  }
  
  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks > 1 ? 's' : ''} ago`
  }
  
  const diffInMonths = Math.floor(diffInDays / 30)
  return `${diffInMonths} month${diffInMonths > 1 ? 's' : ''} ago`
}

// Get user's recent activity
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

    const { limit = 20 } = req.query
    const activities = []

    // 1. Get recent orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    if (!ordersError && orders) {
      orders.forEach(order => {
        activities.push({
          id: `order-${order.id}`,
          type: 'order_placed',
          title: 'Order Placed',
          description: `You placed order #${order.order_number}`,
          timestamp: order.created_at,
          timeAgo: formatTimeAgo(order.created_at),
          icon: 'order', // Frontend can map this to appropriate icon
          metadata: {
            orderId: order.id,
            orderNumber: order.order_number
          }
        })
      })
    }

    // 2. Get recent wishlist additions
    const { data: wishlistItems, error: wishlistError } = await supabaseAdmin
      .from('wishlist')
      .select(`
        id,
        product_id,
        created_at,
        products (
          name
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    if (!wishlistError && wishlistItems) {
      wishlistItems.forEach(item => {
        const productName = item.products?.name || 'item'
        activities.push({
          id: `wishlist-${item.id}`,
          type: 'wishlist_added',
          title: 'Added to Wishlist',
          description: `${productName} added to your wishlist`,
          timestamp: item.created_at,
          timeAgo: formatTimeAgo(item.created_at),
          icon: 'wishlist',
          metadata: {
            wishlistId: item.id,
            productId: item.product_id
          }
        })
      })
    }

    // 3. Get recent voucher/coupon redemptions
    const { data: couponUsages, error: couponError } = await supabaseAdmin
      .from('coupon_usage')
      .select(`
        id,
        coupon_id,
        used_at,
        coupons (
          code
        )
      `)
      .eq('user_id', user.id)
      .order('used_at', { ascending: false })
      .limit(parseInt(limit))

    if (!couponError && couponUsages) {
      couponUsages.forEach(usage => {
        const couponCode = usage.coupons?.code || 'voucher'
        activities.push({
          id: `voucher-${usage.id}`,
          type: 'voucher_redeemed',
          title: 'Voucher Redeemed',
          description: `You redeemed voucher code ${couponCode}`,
          timestamp: usage.used_at,
          timeAgo: formatTimeAgo(usage.used_at),
          icon: 'voucher',
          metadata: {
            couponUsageId: usage.id,
            couponId: usage.coupon_id,
            couponCode: couponCode
          }
        })
      })
    }

    // 4. Get profile update activity (check if profile was updated recently)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('updated_at, created_at')
      .eq('id', user.id)
      .single()

    if (!profileError && profile) {
      // Only include if updated_at is significantly different from created_at
      const createdAt = new Date(profile.created_at)
      const updatedAt = new Date(profile.updated_at)
      const diffInHours = (updatedAt - createdAt) / (1000 * 60 * 60)
      
      // Only show if updated more than 1 hour after creation
      if (diffInHours > 1) {
        activities.push({
          id: `profile-${user.id}`,
          type: 'profile_updated',
          title: 'Profile Updated',
          description: 'You updated your profile information',
          timestamp: profile.updated_at,
          timeAgo: formatTimeAgo(profile.updated_at),
          icon: 'profile',
          metadata: {
            userId: user.id
          }
        })
      }
    }

    // Sort all activities by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

    // Limit to requested number
    const limitedActivities = activities.slice(0, parseInt(limit))

    res.json({
      activities: limitedActivities,
      count: limitedActivities.length,
      total: activities.length
    })
  } catch (error) {
    console.error('Get activity error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
