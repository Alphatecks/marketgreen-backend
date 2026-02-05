import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'

const router = express.Router()

// Get active promotion (public endpoint for frontend - only 1 promotion allowed)
router.get('/', async (req, res) => {
  try {
    // Check if supabaseAdmin is available
    if (!supabaseAdmin) {
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'SUPABASE_SERVICE_ROLE_KEY is not set'
      })
    }

    // Get all promotions
    const { data: allPromotions, error: allError } = await supabaseAdmin
      .from('promotions')
      .select('*')

    if (allError) {
      // Check if it's a table not found error
      if (allError.message?.includes('relation') || allError.message?.includes('does not exist')) {
        return res.status(500).json({
          error: 'Promotions table not found',
          details: 'Please run the create_promotions_table.sql migration in Supabase'
        })
      }
      return res.status(500).json({
        error: 'Error fetching promotion',
        details: allError.message
      })
    }

    // Get active promotions
    const activePromotions = (allPromotions || []).filter(p => p.is_active === true)

    if (activePromotions.length === 0) {
      return res.json({ promotion: null })
    }

    // Filter for non-expired promotions
    // If countdown_end_date is null/empty, promotion is always valid (no expiration)
    // If countdown_end_date is set, only show if it's in the future
    const now = new Date()
    const validPromotions = activePromotions.filter(promo => {
      // If no countdown date (null or empty string), promotion is always valid
      if (!promo.countdown_end_date || promo.countdown_end_date.trim() === '') {
        return true
      }
      
      // Parse the countdown end date
      const endDate = new Date(promo.countdown_end_date)
      
      // Check if date is valid
      if (isNaN(endDate.getTime())) {
        return true // Treat invalid dates as no expiration
      }
      
      // Compare dates (promotion is valid if end date is in the future)
      return endDate > now
    })

    // Get the most recent one
    const promotion = validPromotions.length > 0 
      ? validPromotions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      : null

    // Return single promotion or null
    if (!promotion) {
      return res.json({ promotion: null })
    }

    // Format response for frontend - return all promotion data (pictures, title, details)
    res.json({
      promotion: {
        id: promotion.id,
        headerText: promotion.header_text,
        subtitle: promotion.subtitle,
        mainTitle: promotion.main_title,
        buttonText: promotion.button_text || 'SHOP NOW',
        buttonLink: promotion.button_link || '/products',
        productImage: promotion.product_image,
        backgroundImage: promotion.background_image,
        backgroundColor: promotion.background_color || '#FEF3C7',
        displayOrder: promotion.display_order || 0
      }
    })
  } catch (error) {
    console.error('Get promotion error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
