import express from 'express'
import { supabase } from '../config/supabase.js'

const router = express.Router()

/**
 * GET /api/tags/popular
 * Returns popular tags from active products (by usage count).
 * Query: limit (default 20) - max number of tags to return.
 * Response: { tags: string[] } - tag names only, ordered by popularity.
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

    const countByTag = new Map()
    for (const row of products || []) {
      const tags = row?.tags
      if (Array.isArray(tags)) {
        for (const t of tags) {
          const name = typeof t === 'string' ? t.trim() : String(t).trim()
          if (!name) continue
          countByTag.set(name, (countByTag.get(name) || 0) + 1)
        }
      }
    }

    const sorted = [...countByTag.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name]) => name)

    res.json({ tags: sorted })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
