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

// Get user's notifications/inbox
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

    const { 
      filter = 'all', // all, unread, read, important
      limit = 50,
      offset = 0
    } = req.query

    // Build query
    let query = supabaseAdmin
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1)

    // Apply filters
    if (filter === 'unread') {
      query = query.eq('is_read', false)
    } else if (filter === 'read') {
      query = query.eq('is_read', true)
    } else if (filter === 'important') {
      query = query.eq('is_important', true)
    }
    // 'all' doesn't need additional filter

    const { data: notifications, error: notificationsError } = await query

    if (notificationsError) {
      console.error('Error fetching notifications:', notificationsError)
      return res.status(500).json({
        error: 'Failed to fetch notifications',
        details: notificationsError.message
      })
    }

    // Get counts for each filter
    const { count: allCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: unreadCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false)

    const { count: readCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', true)

    const { count: importantCount } = await supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_important', true)

    // Format notifications
    const formattedNotifications = (notifications || []).map(notification => ({
      id: notification.id,
      sender: notification.sender,
      category: notification.category,
      title: notification.subject, // Map subject to title for UI
      subtitle: notification.subtitle || null, // Include subtitle
      subject: notification.subject, // Keep for backward compatibility
      message: notification.message,
      preview: notification.preview || notification.message.substring(0, 100) + (notification.message.length > 100 ? '...' : ''),
      icon: notification.icon || 'envelope',
      isRead: notification.is_read,
      isImportant: notification.is_important,
      readAt: notification.read_at,
      createdAt: notification.created_at,
      updatedAt: notification.updated_at,
      timeAgo: formatTimeAgo(notification.created_at)
    }))

    res.json({
      notifications: formattedNotifications,
      counts: {
        all: allCount || 0,
        unread: unreadCount || 0,
        read: readCount || 0,
        important: importantCount || 0
      },
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: allCount || 0
      }
    })
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Mark notification as read
router.put('/:id/read', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { id } = req.params

    // Verify notification belongs to user
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, is_read')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    // Update notification
    const { data: updatedNotification, error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error marking notification as read:', updateError)
      return res.status(500).json({
        error: 'Failed to mark notification as read',
        details: updateError.message
      })
    }

    res.json({
      message: 'Notification marked as read',
      notification: {
        id: updatedNotification.id,
        isRead: updatedNotification.is_read,
        readAt: updatedNotification.read_at
      }
    })
  } catch (error) {
    console.error('Mark as read error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Toggle notification important status
router.put('/:id/important', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { id } = req.params

    // Verify notification belongs to user
    const { data: notification, error: fetchError } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, is_important')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !notification) {
      return res.status(404).json({ error: 'Notification not found' })
    }

    // Toggle important status
    const { data: updatedNotification, error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({
        is_important: !notification.is_important
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error toggling notification important status:', updateError)
      return res.status(500).json({
        error: 'Failed to update notification',
        details: updateError.message
      })
    }

    res.json({
      message: `Notification marked as ${updatedNotification.is_important ? 'important' : 'not important'}`,
      notification: {
        id: updatedNotification.id,
        isImportant: updatedNotification.is_important
      }
    })
  } catch (error) {
    console.error('Toggle important error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { id } = req.params

    // Verify notification belongs to user and delete
    const { error: deleteError } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('Error deleting notification:', deleteError)
      return res.status(500).json({
        error: 'Failed to delete notification',
        details: deleteError.message
      })
    }

    res.json({
      message: 'Notification deleted successfully'
    })
  } catch (error) {
    console.error('Delete notification error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    // Mark all unread notifications as read
    const { error: updateError } = await supabaseAdmin
      .from('notifications')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (updateError) {
      console.error('Error marking all notifications as read:', updateError)
      return res.status(500).json({
        error: 'Failed to mark all notifications as read',
        details: updateError.message
      })
    }

    res.json({
      message: 'All notifications marked as read'
    })
  } catch (error) {
    console.error('Mark all as read error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router
