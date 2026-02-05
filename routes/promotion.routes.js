import express from 'express'
import { supabase } from '../config/supabase.js'

const router = express.Router()

// Get active promotion (public endpoint for frontend - only 1 promotion allowed)
router.get('/', async (req, res) => {
  try {
    // Get the single active promotion that hasn't expired
    const now = new Date().toISOString()
    
    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .or(`countdown_end_date.is.null,countdown_end_date.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) {
      return res.status(500).json({
        error: 'Error fetching promotion',
        details: error.message
      })
    }

    // Return single promotion or null
    if (!promotions || promotions.length === 0) {
      return res.json({
        promotion: null
      })
    }

    const promotion = promotions[0]

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
