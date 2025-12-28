import express from 'express'
import { supabase } from '../config/supabase.js'
import { validatePassword, validateEmail, validateUsername } from '../utils/validation.js'

const router = express.Router()

// Signup endpoint - matches the UI form
router.post('/signup', async (req, res) => {
  try {
    const { email, username, password, marketingEmails } = req.body

    // Validate email
    const emailValidation = validateEmail(email)
    if (!emailValidation.isValid) {
      return res.status(400).json({ 
        error: emailValidation.error,
        field: 'email'
      })
    }

    // Validate username
    const usernameValidation = validateUsername(username)
    if (!usernameValidation.isValid) {
      return res.status(400).json({ 
        error: usernameValidation.error,
        field: 'username'
      })
    }

    // Validate password
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return res.status(400).json({ 
        error: 'Password does not meet requirements',
        field: 'password',
        requirements: passwordValidation.errors
      })
    }

    // Sign up user with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
          marketing_emails: marketingEmails || false
        },
        emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/callback`
      }
    })

    if (error) {
      // Handle specific Supabase errors
      if (error.message.includes('already registered')) {
        return res.status(409).json({ 
          error: 'An account with this email already exists',
          field: 'email'
        })
      }
      return res.status(400).json({ 
        error: error.message 
      })
    }

    // Create user profile in profiles table
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          username: username,
          email: email,
          marketing_emails: marketingEmails || false,
          created_at: new Date().toISOString()
        })

      if (profileError) {
        console.error('Error creating profile:', profileError)
        // Don't fail the signup if profile creation fails
      }
    }

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        username: username
      },
      // Include session if email confirmation is disabled
      session: data.session || null
    })
  } catch (error) {
    console.error('Signup error:', error)
    res.status(500).json({ 
      error: 'An error occurred during signup. Please try again.' 
    })
  }
})

// Register new user (alias for backward compatibility)
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username || email.split('@')[0]
        }
      }
    })

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.status(201).json({
      message: 'User registered successfully',
      user: data.user
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      return res.status(401).json({ error: error.message })
    }

    res.json({
      message: 'Login successful',
      user: data.user,
      session: data.session
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Logout user
router.post('/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut()

    if (error) {
      return res.status(400).json({ error: error.message })
    }

    res.json({ message: 'Logout successful' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get current user
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error) {
      return res.status(401).json({ error: error.message })
    }

    res.json({ user })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router

