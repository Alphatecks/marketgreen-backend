import { supabase, supabaseAdmin } from '../config/supabase.js'

/**
 * Middleware to authenticate requests using Supabase JWT token
 */
export const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' })
    }

    // Attach user to request object
    req.user = user
    next()
  } catch (error) {
    res.status(500).json({ error: 'Authentication failed' })
  }
}

/**
 * Middleware to check if user is admin
 * Uses admin client to bypass RLS and avoid infinite recursion
 */
export const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    // Use admin client to bypass RLS (avoids infinite recursion)
    // The admin client bypasses RLS policies, preventing the circular dependency
    if (!supabaseAdmin) {
      return res.status(500).json({ 
        error: 'Service role key not configured',
        message: 'SUPABASE_SERVICE_ROLE_KEY must be set to check admin status'
      })
    }

    const { data: profile, error } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single()

    if (error || !profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' })
    }

    next()
  } catch (error) {
    res.status(500).json({ error: 'Authorization failed' })
  }
}

