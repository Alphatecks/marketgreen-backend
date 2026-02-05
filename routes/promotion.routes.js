import express from 'express'
import { supabase } from '../config/supabase.js'

const router = express.Router()

// Get active promotions (public endpoint for frontend)
router.get('/', async (req, res) => {
  try {
    const { limit = 10 } = req.query

    // Get active promotions that haven't expired
    const now = new Date().toISOString()
    
    const { data: promotions, error } = await supabase
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .or(`countdown_end_date.is.null,countdown_end_date.gt.${now}`)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(parseInt(limit))

    if (error) {
      return res.status(500).json({
        error: 'Error fetching promotions',
        details: error.message
      })
    }

    // Format response for frontend
    const formattedPromotions = (promotions || []).map(promotion => ({
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
    }))

    res.json({
      promotions: formattedPromotions,
      total: formattedPromotions.length
    })
  } catch (error) {
    console.error('Get promotions error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
