import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'

const router = express.Router()

// Get active promotion (public endpoint for frontend - only 1 promotion allowed)
router.get('/', async (req, res) => {
  try {
    // Check if supabaseAdmin is available
    if (!supabaseAdmin) {
      console.error('supabaseAdmin is not configured')
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'SUPABASE_SERVICE_ROLE_KEY is not set'
      })
    }

    // First, check if table exists and get all promotions (for debugging)
    const { data: allPromotions, error: allError } = await supabaseAdmin
      .from('promotions')
      .select('*')

    if (allError) {
      console.error('Error fetching promotions:', allError)
      // Check if it's a table not found error
      if (allError.message?.includes('relation') || allError.message?.includes('does not exist')) {
        return res.status(500).json({
          error: 'Promotions table not found',
          details: 'Please run the create_promotions_table.sql migration in Supabase',
          message: allError.message
        })
      }
      return res.status(500).json({
        error: 'Error fetching promotion',
        details: allError.message
      })
    }

    console.log('Total promotions in database:', allPromotions?.length || 0)

    // Get active promotions
    const activePromotions = (allPromotions || []).filter(p => p.is_active === true)
    console.log('Active promotions:', activePromotions.length)

    if (activePromotions.length === 0) {
      console.log('No active promotions found')
      return res.json({
        promotion: null,
        debug: {
          totalPromotions: allPromotions?.length || 0,
          activePromotions: 0
        }
      })
    }

    // Filter for non-expired promotions
    const now = new Date()
    const validPromotions = activePromotions.filter(promo => {
      if (!promo.countdown_end_date) {
        console.log('Promotion has no countdown date:', promo.id, promo.main_title)
        return true
      }
      const endDate = new Date(promo.countdown_end_date)
      const isValid = endDate > now
      console.log('Promotion countdown check:', promo.id, promo.main_title, 'End:', endDate, 'Now:', now, 'Valid:', isValid)
      return isValid
    })

    console.log('Valid (non-expired) promotions:', validPromotions.length)

    // Get the most recent one
    const promotion = validPromotions.length > 0 
      ? validPromotions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      : null

    // Return single promotion or null
    if (!promotion) {
      console.log('No valid promotion found after filtering')
      return res.json({
        promotion: null,
        debug: {
          totalPromotions: allPromotions?.length || 0,
          activePromotions: activePromotions.length,
          validPromotions: 0
        }
      })
    }

    console.log('Returning promotion:', promotion.id, promotion.main_title)

    // Format response for frontend
    res.json({
      promotion: {
        id: promotion.id,
        headerText: promotion.header_text,
        subtitle: promotion.subtitle,
        mainTitle: promotion.main_title,
        countdownEndDate: promotion.countdown_end_date,
        buttonText: promotion.button_text || 'SHOP NOW',
        buttonLink: promotion.button_link || '/products',
        productImage: promotion.product_image,
        backgroundImage: promotion.background_image,
        backgroundColor: promotion.background_color || '#FEF3C7'
      }
    })
  } catch (error) {
    console.error('Get promotion error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
