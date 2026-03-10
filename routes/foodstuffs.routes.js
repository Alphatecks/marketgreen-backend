import express from 'express'
import { supabase } from '../config/supabase.js'

const router = express.Router()

/**
 * GET /api/foodstuffs/popular
 * Returns popular foodstuffs from active products (derived from product tags by usage count).
 * Query: limit (default 20) - max number of items to return.
 * Response: { foodstuffs: string[] } - names only, ordered by popularity.
 */
router.get('/popular', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50)

    const { data: products, error } = await supabase
      .from('products')
      .select('tags')
      .eq('product_status', 'Active')

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    const countByItem = new Map()
    for (const row of products || []) {
      const tags = row?.tags
      if (Array.isArray(tags)) {
        for (const t of tags) {
          const name = typeof t === 'string' ? t.trim() : String(t).trim()
          if (!name) continue
          countByItem.set(name, (countByItem.get(name) || 0) + 1)
        }
      }
    }

    const sorted = [...countByItem.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name]) => name)

    res.json({ foodstuffs: sorted })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
