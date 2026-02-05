import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { validateEmail, validatePassword } from '../utils/validation.js'

const router = express.Router()

// Get user profile
router.get('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError) {
      return res.status(401).json({ error: authError.message })
    }

    // Get user profile from profiles table
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error) {
      return res.status(404).json({ error: 'Profile not found' })
    }

    res.json(data)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update user profile
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const {
      username,
      email,
      phone,
      dateOfBirth,
      firstName,
      lastName,
      gender,
      address,
      city,
      state,
      country,
      zipCode,
      fullName,
      avatarUrl
    } = req.body

    // Prepare update data
    const updateData = {}
    const allowedGenders = ['Male', 'Female', 'Other', 'Prefer not to say']

    // Username validation
    if (username !== undefined) {
      if (username && username.trim().length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters' })
      }
      updateData.username = username?.trim() || null
    }

    // Email validation
    if (email !== undefined) {
      if (email && !validateEmail(email)) {
        return res.status(400).json({ error: 'Invalid email format' })
      }
      updateData.email = email?.trim() || null
    }

    // Phone validation
    if (phone !== undefined) {
      updateData.phone = phone?.trim() || null
    }

    // Date of birth validation and conversion
    if (dateOfBirth !== undefined) {
      if (dateOfBirth) {
        // Handle dd/mm/yyyy format
        let dateValue = dateOfBirth
        if (typeof dateOfBirth === 'string' && dateOfBirth.includes('/')) {
          const parts = dateOfBirth.split('/')
          if (parts.length === 3) {
            // Convert dd/mm/yyyy to yyyy-mm-dd
            dateValue = `${parts[2]}-${parts[1]}-${parts[0]}`
          }
        }
        const parsedDate = new Date(dateValue)
        if (isNaN(parsedDate.getTime())) {
          return res.status(400).json({ error: 'Invalid date of birth format. Use dd/mm/yyyy or yyyy-mm-dd' })
        }
        // Check if date is in the future
        if (parsedDate > new Date()) {
          return res.status(400).json({ error: 'Date of birth cannot be in the future' })
        }
        updateData.date_of_birth = parsedDate.toISOString().split('T')[0]
      } else {
        updateData.date_of_birth = null
      }
    }

    // First name and last name
    if (firstName !== undefined) {
      updateData.first_name = firstName?.trim() || null
    }

    if (lastName !== undefined) {
      updateData.last_name = lastName?.trim() || null
    }

    // Get current profile to build full_name if first_name or last_name are being updated
    if (firstName !== undefined || lastName !== undefined) {
      // Get current profile values
      const { data: currentProfile } = await supabaseAdmin
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', user.id)
        .single()

      const finalFirstName = updateData.first_name !== undefined 
        ? updateData.first_name 
        : (currentProfile?.first_name || null)
      const finalLastName = updateData.last_name !== undefined 
        ? updateData.last_name 
        : (currentProfile?.last_name || null)

      // Build full_name from first_name + last_name
      if (finalFirstName || finalLastName) {
        updateData.full_name = [finalFirstName, finalLastName].filter(Boolean).join(' ').trim() || null
      }
    }

    // Full name (can override first_name + last_name if explicitly provided)
    if (fullName !== undefined) {
      updateData.full_name = fullName?.trim() || null
    }

    // Gender validation
    if (gender !== undefined) {
      if (gender && !allowedGenders.includes(gender)) {
        return res.status(400).json({ 
          error: `Invalid gender. Must be one of: ${allowedGenders.join(', ')}` 
        })
      }
      updateData.gender = gender || null
    }

    // Address fields
    if (address !== undefined) {
      updateData.address = address?.trim() || null
    }

    if (city !== undefined) {
      updateData.city = city?.trim() || null
    }

    if (state !== undefined) {
      updateData.state = state?.trim() || null
    }

    if (country !== undefined) {
      updateData.country = country?.trim() || null
    }

    if (zipCode !== undefined) {
      updateData.zip_code = zipCode?.trim() || null
    }

    // Avatar URL
    if (avatarUrl !== undefined) {
      updateData.avatar_url = avatarUrl?.trim() || null
    }

    // Add updated_at timestamp
    updateData.updated_at = new Date().toISOString()

    // Use admin client to bypass RLS while maintaining security through user validation
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating profile:', error)
      return res.status(400).json({ error: error.message })
    }

    res.json(data)
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Change password
router.put('/change-password', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return res.status(401).json({ error: authError?.message || 'Invalid or expired token' })
    }

    const { currentPassword, newPassword } = req.body

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Current password and new password are required' 
      })
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword)
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        requirements: passwordValidation.errors
      })
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    })

    if (verifyError) {
      return res.status(401).json({ 
        error: 'Current password is incorrect' 
      })
    }

    // Update password using Supabase auth
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) {
      console.error('Error updating password:', updateError)
      return res.status(400).json({ 
        error: 'Failed to update password',
        details: updateError.message
      })
    }

    res.json({
      message: 'Password updated successfully'
    })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({ error: error.message })
  }
})

export default router

