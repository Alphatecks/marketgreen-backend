import express from 'express'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { validatePassword, validateEmail, validateUsername, validateFullName, validatePhone } from '../utils/validation.js'
import { sendWelcomeEmail } from '../utils/emailService.js'

const router = express.Router()

// Signup endpoint - GET handler for documentation/testing
router.get('/signup', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'This endpoint only accepts POST requests. Please use POST with email, username, password, fullName, and phone in the request body.',
    method: 'POST',
    endpoint: '/api/auth/signup',
    requiredFields: ['email', 'username', 'password', 'fullName', 'phone']
  })
})

// Signup endpoint - matches the UI form
router.post('/signup', async (req, res) => {
  try {
    const { email, username, password, fullName, phone, phoneNumber, marketingEmails } = req.body

    // Support both 'phone' and 'phoneNumber' field names
    const phoneValue = phone || phoneNumber

    // Debug: Log received phone value for troubleshooting
    console.log('Signup request - phone received:', { 
      phone: phoneValue, 
      phoneField: phone ? 'phone' : phoneNumber ? 'phoneNumber' : 'none',
      type: typeof phoneValue, 
      isUndefined: phoneValue === undefined,
      isNull: phoneValue === null,
      isEmptyString: phoneValue === '',
      length: phoneValue?.length,
      rawBody: { phone, phoneNumber }
    })

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

    // Validate full name
    const fullNameValidation = validateFullName(fullName)
    if (!fullNameValidation.isValid) {
      return res.status(400).json({ 
        error: fullNameValidation.error,
        field: 'fullName'
      })
    }

    // Validate phone
    const phoneValidation = validatePhone(phoneValue)
    if (!phoneValidation.isValid) {
      return res.status(400).json({ 
        error: phoneValidation.error,
        field: 'phone'
      })
    }


    // Sign up user with Supabase Admin client to auto-confirm email
    // This ensures users can login immediately and welcome email is sent reliably
    let data, error, session
    
    if (supabaseAdmin) {
      // Use admin client to create user with auto-confirmed email (permanent solution)
      console.log('[AUTH] Using admin client to create user with auto-confirmed email')
      const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true, // Auto-confirm email - bypasses Supabase email confirmation
        user_metadata: {
          username: username,
          full_name: fullName.trim(),
          phone: phoneValue,
          marketing_emails: marketingEmails || false
        }
      })
      
      if (adminError) {
        console.error('[AUTH] Admin user creation error:', adminError)
        error = adminError
        data = null
        session = null
      } else if (adminData?.user) {
        // User created successfully with admin client (email auto-confirmed)
        // Return user immediately - frontend can handle login since email is confirmed
        console.log('[AUTH] User created successfully with admin client, email auto-confirmed')
        
        data = {
          user: adminData.user,
          session: null // User is confirmed, frontend can login immediately
        }
        session = null
        error = null
      } else {
        // Unexpected: adminData exists but no user
        console.error('[AUTH] Admin user creation returned data but no user object:', adminData)
        error = { message: 'User creation failed - no user data returned' }
        data = null
        session = null
      }
    } else {
      // Fallback to regular signup if admin client is not available
      console.warn('[AUTH] Admin client not available, using regular signup. Set SUPABASE_SERVICE_ROLE_KEY for auto-confirmation.')
      const signUpResult = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            username: username,
            full_name: fullName.trim(),
            phone: phoneValue,
            marketing_emails: marketingEmails || false
          },
          emailRedirectTo: `${process.env.FRONTEND_URL || 'https://marketgreen.shop'}/auth/callback`
        }
      })
      data = signUpResult.data
      error = signUpResult.error
      session = signUpResult.data?.session || null
    }


    if (error) {
      // Safely extract error message
      const errorMessage = error?.message || error?.msg || (typeof error === 'string' ? error : JSON.stringify(error)) || 'An unknown error occurred'
      
      // Handle specific Supabase errors
      if (errorMessage.includes('already registered') || errorMessage.includes('User already registered')) {
        return res.status(409).json({ 
          error: 'An account with this email already exists',
          field: 'email'
        })
      }
      
      // Log the full error for debugging
      console.error('[AUTH] Signup error details:', {
        error: error,
        message: errorMessage,
        status: error?.status,
        code: error?.code
      })
      
      return res.status(400).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error : undefined
      })
    }

    // Handle user profile - database trigger may have already created it
    if (data?.user) {
      // Check if profile already exists (created by database trigger)
      const { data: existingProfile, error: checkError } = await supabase
        .from('profiles')
        .select('id, username, full_name, phone, marketing_emails')
        .eq('id', data.user.id)
        .single()

      if (checkError && checkError.code === 'PGRST116') {
        // Profile doesn't exist (PGRST116 = no rows returned), create it
        // This happens if the database trigger didn't fire or failed
        console.log('[AUTH] Profile not found, creating manually...')
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            username: username,
            email: email,
            full_name: fullName.trim(),
            phone: phoneValue,
            marketing_emails: marketingEmails || false,
            created_at: new Date().toISOString()
          })

        if (profileError) {
          console.error('[AUTH] Error creating profile:', profileError)
          // Don't fail signup if profile creation fails
        } else {
          console.log('[AUTH] Profile created successfully')
        }
      } else if (existingProfile) {
        // Profile exists (created by database trigger), update metadata if needed
        const needsUpdate = 
          existingProfile.username !== username ||
          existingProfile.full_name !== fullName.trim() ||
          existingProfile.phone !== phoneValue ||
          existingProfile.marketing_emails !== (marketingEmails || false)

        if (needsUpdate) {
          console.log('[AUTH] Profile exists, updating metadata...')
          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              username: username,
              full_name: fullName.trim(),
              phone: phoneValue,
              marketing_emails: marketingEmails || false
            })
            .eq('id', data.user.id)

          if (updateError) {
            console.warn('[AUTH] Error updating profile metadata:', updateError)
            // Don't fail signup
          } else {
            console.log('[AUTH] Profile metadata updated successfully')
          }
        } else {
          console.log('[AUTH] Profile already exists with correct data')
        }
      } else if (checkError) {
        // Other error checking for profile
        console.warn('[AUTH] Error checking profile:', checkError)
        // Don't fail signup - profile might still be created by trigger
      }
    }

    // Send welcome email (non-blocking - don't fail signup if email fails)
    // Send email regardless of profile creation success
    if (data?.user) {
      console.log('[EMAIL] Attempting to send welcome email to:', email)
      console.log('[EMAIL] Gmail config check:', {
        hasGmailUser: !!process.env.GMAIL_USER,
        hasGmailPassword: !!process.env.GMAIL_APP_PASSWORD,
        gmailUser: process.env.GMAIL_USER ? `${process.env.GMAIL_USER.substring(0, 3)}***` : 'not set'
      })
      
      // Send welcome email with better error handling
      try {
        const emailResult = await sendWelcomeEmail(email, fullName.trim() || username)
        if (emailResult.success) {
          console.log('[EMAIL] ✅ Welcome email sent successfully to:', email, 'Message ID:', emailResult.messageId)
        } else {
          console.error('[EMAIL] ❌ Welcome email failed to send:', {
            email: email,
            error: emailResult.error,
            reason: !process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD 
              ? 'Gmail credentials not configured' 
              : 'Email service error'
          })
        }
      } catch (emailError) {
        console.error('[EMAIL] ❌ Exception sending welcome email:', {
          email: email,
          error: emailError.message,
          stack: emailError.stack
        })
        // Email failure should not affect signup success
      }
    }

    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: data?.user?.id,
        email: data?.user?.email,
        username: username,
        full_name: fullName.trim(),
        phone: phoneValue
      },
      // Session may be null when using admin client - user is auto-confirmed and can login immediately
      session: session || data?.session || null
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

// Login user - matches the UI form
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required',
        field: !email ? 'email' : 'password'
      })
    }

    // Validate email format
    const emailValidation = validateEmail(email)
    if (!emailValidation.isValid) {
      return res.status(400).json({ 
        error: emailValidation.error,
        field: 'email'
      })
    }

    // Attempt login with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    })

    if (error) {
      // Handle specific error cases
      let errorMessage = 'Invalid email or password'
      let statusCode = 401

      if (error.message.includes('Invalid login credentials')) {
        errorMessage = 'Invalid email or password'
      } else if (error.message.includes('Email not confirmed')) {
        errorMessage = 'Please verify your email before logging in'
        statusCode = 403
      } else if (error.message.includes('Too many requests')) {
        errorMessage = 'Too many login attempts. Please try again later'
        statusCode = 429
      } else {
        errorMessage = error.message
      }

      return res.status(statusCode).json({ 
        error: errorMessage,
        field: 'credentials'
      })
    }

    // Fetch user profile if available
    let userProfile = null
    if (data.user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (!profileError && profile) {
        userProfile = profile
      }
    }

    // Build comprehensive user details object
    const userDetails = {
      id: data.user?.id,
      email: data.user?.email || userProfile?.email,
      username: userProfile?.username || data.user?.user_metadata?.username,
      full_name: userProfile?.full_name || null,
      avatar_url: userProfile?.avatar_url || null,
      phone: userProfile?.phone || null,
      marketing_emails: userProfile?.marketing_emails || false,
      role: userProfile?.role || 'user',
      created_at: userProfile?.created_at || data.user?.created_at,
      updated_at: userProfile?.updated_at || null,
      email_confirmed: data.user?.email_confirmed_at ? true : false,
      last_sign_in: data.user?.last_sign_in_at || null
    }

    res.json({
      message: 'Login successful',
      user: userDetails,
      session: {
        access_token: data.session?.access_token,
        refresh_token: data.session?.refresh_token,
        expires_in: data.session?.expires_in,
        token_type: data.session?.token_type
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ 
      error: 'An error occurred during login. Please try again.' 
    })
  }
})

// Logout user
router.post('/logout', async (req, res) => {
  try {
    // Get the access token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      return res.status(401).json({ 
        error: 'No token provided',
        message: 'Authorization token is required for logout'
      })
    }

    // Verify the user is authenticated
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(token)

    if (getUserError || !user) {
      return res.status(401).json({ 
        error: 'Invalid or expired token',
        message: 'Unable to authenticate user for logout'
      })
    }

    // For REST API logout, we verify the token and return success
    // The client should clear the token from storage
    // Note: JWT tokens are stateless and will expire naturally
    // If you need to invalidate tokens server-side, consider using a token blacklist
    
    res.json({ 
      message: 'Logout successful',
      user_id: user.id
    })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ 
      error: 'An error occurred during logout. Please try again.' 
    })
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

