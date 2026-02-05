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

    // Get active promotions (ignore countdown_end_date - we're not using countdown timers)
    const activePromotions = (allPromotions || []).filter(p => p.is_active === true)

    if (activePromotions.length === 0) {
      return res.json({ promotion: null })
    }

    // Get the most recent active promotion
    const promotion = activePromotions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

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
