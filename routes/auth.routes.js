import express from 'express'
import { supabase } from '../config/supabase.js'
import { validatePassword, validateEmail, validateUsername } from '../utils/validation.js'

const router = express.Router()

// Signup endpoint - GET handler for documentation/testing
router.get('/signup', (req, res) => {
  res.status(405).json({
    error: 'Method Not Allowed',
    message: 'This endpoint only accepts POST requests. Please use POST with email, username, and password in the request body.',
    method: 'POST',
    endpoint: '/api/auth/signup',
    requiredFields: ['email', 'username', 'password']
  })
})

// Signup endpoint - matches the UI form
router.post('/signup', async (req, res) => {
  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:8',message:'Signup route - request received',data:{hasEmail:!!req.body.email,hasUsername:!!req.body.username,hasPassword:!!req.body.password,emailPrefix:req.body.email?.substring(0,10)||'undefined'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  try {
    const { email, username, password, marketingEmails } = req.body

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

    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/a231184e-915a-41f4-b027-e9b8c209d3b3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'routes/auth.routes.js:84',message:'Signup - sending success response',data:{hasSession:!!data.session},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
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

    res.json({
      message: 'Login successful',
      user: {
        id: data.user?.id,
        email: data.user?.email,
        username: userProfile?.username || data.user?.user_metadata?.username,
        ...userProfile
      },
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

