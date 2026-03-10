import express from 'express'
import { supabaseAdmin } from '../config/supabase.js'
import { validateEmail } from '../utils/validation.js'

const router = express.Router()

/**
 * POST /api/newsletter
 * Public: submit email for newsletter. No auth required.
 * Body: { email: string }
 */
router.post('/', async (req, res) => {
  try {
    const { email } = req.body

    const validation = validateEmail(email)
    if (!validation.isValid) {
      return res.status(400).json({ error: validation.error, field: 'email' })
    }

    const normalizedEmail = String(email).trim().toLowerCase()

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Newsletter signup is temporarily unavailable' })
    }

    const { data, error } = await supabaseAdmin
      .from('newsletter_subscribers')
      .insert([{ email: normalizedEmail }])
      .select('id, email, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return res.status(200).json({
          message: 'You are already subscribed to our newsletter.',
          subscribed: true
        })
      }
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'Thank you for subscribing to our newsletter.',
      subscribed: true,
      email: data.email
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
