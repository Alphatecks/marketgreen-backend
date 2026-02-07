import express from 'express'
import { supabase } from '../config/supabase.js'
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
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:8',message:'Signup route - request received',data:{hasEmail:!!req.body.email,hasUsername:!!req.body.username,hasPassword:!!req.body.password,hasFullName:!!req.body.fullName,hasPhone:!!req.body.phone,emailPrefix:req.body.email?.substring(0,10)||'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:15',message:'Signup - email validation failed',data:{error:emailValidation.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return res.status(400).json({ 
        error: emailValidation.error,
        field: 'email'
      })
    }

    // Validate username
    const usernameValidation = validateUsername(username)
    if (!usernameValidation.isValid) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:23',message:'Signup - username validation failed',data:{error:usernameValidation.error},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return res.status(400).json({ 
        error: usernameValidation.error,
        field: 'username'
      })
    }

    // Validate password
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:31',message:'Signup - password validation failed',data:{errors:passwordValidation.errors},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:40',message:'Signup - before Supabase call',data:{hasSupabaseClient:!!supabase,frontendUrl:process.env.FRONTEND_URL||'http://localhost:5173'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    // Sign up user with Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:52',message:'Signup - Supabase response',data:{hasError:!!error,hasData:!!data,hasUser:!!data?.user,hasSession:!!data?.session,errorMessage:error?.message||null,errorCode:error?.status||null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion

    if (error) {
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:54',message:'Signup - Supabase error occurred',data:{errorMessage:error.message,errorStatus:error.status,isAlreadyRegistered:error.message.includes('already registered')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
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
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:67',message:'Signup - creating profile',data:{userId:data.user.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:78',message:'Signup - profile creation error',data:{errorMessage:profileError.message,errorCode:profileError.code,errorDetails:profileError.details},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        console.error('Error creating profile:', profileError)
        // Don't fail the signup if profile creation fails
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:81',message:'Signup - profile created successfully',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
      }
    }

    // Send welcome email (non-blocking - don't fail signup if email fails)
    // Send email regardless of profile creation success
    if (data.user) {
      console.log('[EMAIL] Attempting to send welcome email to:', email)
      console.log('[EMAIL] Resend config check:', {
        hasResendApiKey: !!process.env.RESEND_API_KEY,
        fromEmail: process.env.RESEND_FROM_EMAIL || process.env.COMPANY_EMAIL || 'onboarding@resend.dev'
      })
      
      sendWelcomeEmail(email, fullName.trim() || username)
        .then(result => {
          if (result.success) {
            console.log('[EMAIL] ✅ Welcome email sent successfully to:', email, 'Message ID:', result.messageId)
          } else {
            console.error('[EMAIL] ❌ Welcome email failed to send:', {
              email: email,
              error: result.error,
              reason: !process.env.RESEND_API_KEY 
                ? 'Resend API key not configured' 
                : 'Email service error'
            })
          }
        })
        .catch(error => {
          console.error('[EMAIL] ❌ Exception sending welcome email:', {
            email: email,
            error: error.message,
            stack: error.stack
          })
          // Email failure should not affect signup success
        })
    }

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:84',message:'Signup - sending success response',data:{hasSession:!!data.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    res.status(201).json({
      message: 'Account created successfully',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        username: username,
        full_name: fullName.trim(),
        phone: phoneValue
      },
      // Include session if email confirmation is disabled
      session: data.session || null
    })
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:95',message:'Signup - catch block error',data:{errorMessage:error.message,errorStack:error.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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

