import express from 'express'
import paystack from 'paystack'
import { supabase, supabaseAdmin } from '../config/supabase.js'
import { sendOrderConfirmationEmail } from '../utils/emailService.js'
import dotenv from 'dotenv'

dotenv.config()

const router = express.Router()

// Initialize Paystack
const paystackClient = paystack(process.env.PAYSTACK_SECRET_KEY)

// Helper function to get backend URL for callback
const getBackendUrl = () => {
  // Try BACKEND_URL first, then RENDER_EXTERNAL_URL (for Render hosting), then construct from request
  return process.env.BACKEND_URL || 
         process.env.RENDER_EXTERNAL_URL || 
         process.env.API_URL ||
         'http://localhost:3000'
}

// Helper function to authenticate user
const authenticateUser = async (req) => {
  const token = req.headers.authorization?.replace('Bearer ', '')
  
  if (!token) {
    return { error: 'No token provided', status: 401 }
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    return { error: 'Invalid or expired token', status: 401 }
  }

  return { user }
}

// Helper function to send order confirmation email after successful payment
// Uses a simple in-memory cache to prevent duplicate emails within a short time window
const emailSentCache = new Map()
const CACHE_TTL = 60000 // 60 seconds - prevent duplicate emails within 1 minute

const sendOrderConfirmation = async (orderId, userId) => {
  try {
    // Check cache to prevent duplicate emails
    const cacheKey = `${orderId}-${userId}`
    const cached = emailSentCache.get(cacheKey)
    if (cached && (Date.now() - cached) < CACHE_TTL) {
      console.log('[EMAIL] ⏭️  Skipping duplicate email for order:', orderId, '(already sent recently)')
      return
    }

    // Fetch order details
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      console.error('[EMAIL] Error fetching order for confirmation email:', orderError)
      return
    }

    // Only send email if order is actually paid and confirmed
    // This prevents sending emails for orders that are already processed
    if (order.payment_status !== 'paid' || order.status !== 'confirmed') {
      console.log('[EMAIL] ⏭️  Skipping email - order not in paid/confirmed state:', {
        orderId,
        payment_status: order.payment_status,
        status: order.status
      })
      return
    }

    // Fetch user profile to get email and name
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name, username')
      .eq('id', userId)
      .single()

    // Get user email - try profile email, then auth.users email
    let userEmail = profile?.email
    let userName = profile?.full_name || profile?.username || 'Customer'

    if (!userEmail && supabaseAdmin) {
      try {
        // Try to get email from auth.users using admin client
        const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (!userError && user?.email) {
          userEmail = user.email
        }
        if (!userName && user?.user_metadata?.full_name) {
          userName = user.user_metadata.full_name
        }
      } catch (authError) {
        console.warn('[EMAIL] Could not fetch user email from auth:', authError.message)
      }
    }

    if (!userEmail) {
      console.error('[EMAIL] No email found for user:', userId)
      return
    }

    // Mark as sent in cache before sending (to prevent race conditions)
    emailSentCache.set(cacheKey, Date.now())
    
    // Clean up old cache entries (keep cache size manageable)
    if (emailSentCache.size > 1000) {
      const now = Date.now()
      for (const [key, timestamp] of emailSentCache.entries()) {
        if (now - timestamp > CACHE_TTL) {
          emailSentCache.delete(key)
        }
      }
    }

    // Send order confirmation email (non-blocking)
    sendOrderConfirmationEmail(userEmail, order, userName)
      .then(result => {
        if (result.success) {
          console.log('[EMAIL] ✅ Order confirmation email sent successfully for order:', orderId, 'Message ID:', result.messageId)
        } else {
          // Remove from cache on failure so it can be retried
          emailSentCache.delete(cacheKey)
          console.error('[EMAIL] ❌ Order confirmation email failed to send:', {
            orderId: orderId,
            email: userEmail,
            error: result.error
          })
        }
      })
      .catch(error => {
        // Remove from cache on failure so it can be retried
        emailSentCache.delete(cacheKey)
        console.error('[EMAIL] ❌ Exception sending order confirmation email:', {
          orderId: orderId,
          email: userEmail,
          error: error.message
        })
      })
  } catch (error) {
    console.error('[EMAIL] ❌ Error in sendOrderConfirmation helper:', error)
    // Don't throw - email failure shouldn't break payment flow
  }
}

// Get Paystack public key (for frontend to use Paystack Inline)
router.get('/public-key', (req, res) => {
  const publicKey = process.env.PAYSTACK_PUBLIC_KEY
  if (!publicKey) {
    return res.status(500).json({ 
      error: 'Paystack public key not configured',
      details: 'Please set PAYSTACK_PUBLIC_KEY in environment variables'
    })
  }
  res.json({ publicKey })
})

// Charge with authorization (for inline payment forms)
// This endpoint is used when card details are collected on frontend using Paystack Inline
router.post('/charge', async (req, res) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(req)
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error })
    }
    const { user } = authResult

    const {
      email,
      amount,
      authorization_code, // From Paystack inline form
      orderId,
      metadata = {}
    } = req.body

    // Validate required fields
    if (!email || !amount || !authorization_code) {
      return res.status(400).json({ 
        error: 'Email, amount, and authorization_code are required',
        details: 'Please provide email, amount, and authorization_code from Paystack inline form'
      })
    }

    // Validate amount (must be positive and in kobo)
    const amountInKobo = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountInKobo) || amountInKobo <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount',
        details: 'Amount must be a positive number'
      })
    }

    // Prepare metadata
    const paymentMetadata = {
      user_id: user.id,
      order_id: orderId || null,
      ...metadata
    }

    // Charge using authorization code
    const response = await paystackClient.transaction.charge({
      email,
      amount: amountInKobo,
      authorization_code,
      currency: 'NGN',
      metadata: paymentMetadata
    })

    if (!response.status) {
      return res.status(400).json({ 
        error: 'Payment failed',
        details: response.message || 'Unknown error',
        gateway_response: response.gateway_response
      })
    }

    const transaction = response.data

    // Update order payment status if order_id exists
    if (orderId && transaction.status === 'success') {
      // First check current order status to avoid duplicate updates
      const { data: currentOrder } = await supabaseAdmin
        .from('orders')
        .select('payment_status, status')
        .eq('id', orderId)
        .single()

      // Only update if not already paid/confirmed
      if (currentOrder && currentOrder.payment_status !== 'paid') {
        const { error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'paid',
            payment_method: 'paystack',
            status: 'confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .eq('user_id', user.id)

        if (updateError) {
          console.error('Error updating order payment status:', updateError)
        } else {
          // Send order confirmation email after successful payment
          sendOrderConfirmation(orderId, user.id)
        }
      }
    }

    res.json({
      success: transaction.status === 'success',
      status: transaction.status,
      reference: transaction.reference,
      amount: transaction.amount / 100, // Convert from kobo to Naira
      currency: transaction.currency,
      paid_at: transaction.paid_at,
      message: transaction.gateway_response,
      transaction
    })
  } catch (error) {
    console.error('Payment charge error:', error)
    res.status(500).json({ 
      error: 'Failed to process payment',
      details: error.message 
    })
  }
})

// Initialize Paystack payment (redirect method)
router.post('/initialize', async (req, res) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(req)
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error })
    }
    const { user } = authResult

    const {
      email,
      amount,
      orderId,
      metadata = {}
    } = req.body

    // Validate required fields
    if (!email || !amount) {
      return res.status(400).json({ 
        error: 'Email and amount are required',
        details: 'Please provide email and amount in the request body'
      })
    }

    // Validate amount (must be positive and in kobo - smallest currency unit for Naira)
    const amountInKobo = Math.round(parseFloat(amount) * 100) // Convert Naira to kobo
    if (isNaN(amountInKobo) || amountInKobo <= 0) {
      return res.status(400).json({ 
        error: 'Invalid amount',
        details: 'Amount must be a positive number'
      })
    }

    // Prepare metadata
    const paymentMetadata = {
      user_id: user.id,
      order_id: orderId || null,
      ...metadata
    }

    // Initialize Paystack transaction
    const backendUrl = getBackendUrl()
    const response = await paystackClient.transaction.initialize({
      email,
      amount: amountInKobo,
      currency: 'NGN',
      metadata: paymentMetadata,
      callback_url: `${backendUrl}/api/payments/callback`,
      reference: `MKG-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    })

    if (!response.status) {
      return res.status(400).json({ 
        error: 'Failed to initialize payment',
        details: response.message || 'Unknown error'
      })
    }

    res.json({
      success: true,
      authorization_url: response.data.authorization_url,
      access_code: response.data.access_code,
      reference: response.data.reference
    })
  } catch (error) {
    console.error('Payment initialization error:', error)
    res.status(500).json({ 
      error: 'Failed to initialize payment',
      details: error.message 
    })
  }
})

// Paystack callback handler (for redirect after payment)
// This endpoint receives Paystack redirects and verifies payment, then redirects to frontend
router.get('/callback', async (req, res) => {
  try {
    const { reference, trxref } = req.query
    const paymentRef = reference || trxref

    if (!paymentRef) {
      // No reference provided, redirect to frontend with error
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Processing</title>
          <meta http-equiv="refresh" content="2;url=${frontendUrl}/payment/error?error=no_reference">
        </head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>Processing payment...</h2>
            <p>Redirecting...</p>
          </div>
        </body>
        </html>
      `)
    }

    // Verify transaction with Paystack
    const response = await paystackClient.transaction.verify(paymentRef)

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const backendUrl = getBackendUrl()

    if (!response.status) {
      // Verification failed, redirect to frontend with error
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Verification Failed</title>
          <meta http-equiv="refresh" content="2;url=${frontendUrl}/payment/failed?reference=${paymentRef}&error=${encodeURIComponent(response.message || 'Verification failed')}">
        </head>
        <body>
          <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
            <h2>Payment Verification Failed</h2>
            <p>Redirecting...</p>
          </div>
        </body>
        </html>
      `)
    }

    const transaction = response.data
    const isSuccess = transaction.status === 'success'

    // Update order payment status if order_id exists
    if (transaction.metadata?.order_id && isSuccess) {
      const orderId = transaction.metadata.order_id
      
      // First check current order status to avoid duplicate updates
      const { data: currentOrder } = await supabaseAdmin
        .from('orders')
        .select('payment_status, status')
        .eq('id', orderId)
        .single()

      // Only update if not already paid/confirmed
      if (currentOrder && currentOrder.payment_status !== 'paid') {
        // Update order payment status using admin client to bypass RLS
        const { error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'paid',
            payment_method: 'paystack',
            status: 'confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)

        if (updateError) {
          console.error('Error updating order payment status:', updateError)
        } else if (transaction.metadata?.user_id) {
          // Send order confirmation email after successful payment
          sendOrderConfirmation(orderId, transaction.metadata.user_id)
        }
      }
    }

    // Redirect to frontend with success/failure status
    const status = isSuccess ? 'success' : 'failed'
    // Redirect to payment success/failure page (frontend should handle this route)
    const redirectUrl = `${frontendUrl}/payment/${status}?reference=${paymentRef}`

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment ${isSuccess ? 'Success' : 'Failed'}</title>
        <meta http-equiv="refresh" content="2;url=${redirectUrl}">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 400px;
          }
          .success { color: #10b981; }
          .failed { color: #ef4444; }
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="${isSuccess ? 'success' : 'failed'}">
            Payment ${isSuccess ? 'Successful!' : 'Failed'}
          </h2>
          <div class="spinner"></div>
          <p>Redirecting to confirmation page...</p>
          <p style="font-size: 12px; color: #666; margin-top: 20px;">
            If you are not redirected automatically, 
            <a href="${redirectUrl}">click here</a>
          </p>
        </div>
      </body>
      </html>
    `)
  } catch (error) {
    console.error('Payment callback error:', error)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    const { reference, trxref } = req.query
    const paymentRef = reference || trxref || ''
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Payment Error</title>
        <meta http-equiv="refresh" content="3;url=${frontendUrl}/payment/error?${paymentRef ? `reference=${paymentRef}&` : ''}error=${encodeURIComponent(error.message)}">
      </head>
      <body>
        <div style="text-align: center; padding: 50px; font-family: Arial, sans-serif;">
          <h2 style="color: #ef4444;">Payment Processing Error</h2>
          <p>Redirecting...</p>
        </div>
      </body>
      </html>
    `)
  }
})

// Verify Paystack payment
router.get('/verify/:reference', async (req, res) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(req)
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error })
    }
    const { user } = authResult

    const { reference } = req.params

    if (!reference) {
      return res.status(400).json({ error: 'Payment reference is required' })
    }

    // Verify transaction with Paystack
    const response = await paystackClient.transaction.verify(reference)

    if (!response.status) {
      return res.status(400).json({ 
        error: 'Payment verification failed',
        details: response.message || 'Unknown error'
      })
    }

    const transaction = response.data

    // Check if transaction belongs to the authenticated user
    if (transaction.metadata?.user_id !== user.id) {
      return res.status(403).json({ 
        error: 'Unauthorized',
        details: 'This payment does not belong to you'
      })
    }

    // Update order payment status if order_id exists
    if (transaction.metadata?.order_id && transaction.status === 'success') {
      const orderId = transaction.metadata.order_id
      
      // First check current order status to avoid duplicate updates
      const { data: currentOrder } = await supabaseAdmin
        .from('orders')
        .select('payment_status, status')
        .eq('id', orderId)
        .single()

      // Only update if not already paid/confirmed
      if (currentOrder && currentOrder.payment_status !== 'paid') {
        // Update order payment status
        const { error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'paid',
            payment_method: 'paystack',
            status: 'confirmed',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .eq('user_id', user.id)

        if (updateError) {
          console.error('Error updating order payment status:', updateError)
        } else {
          // Send order confirmation email after successful payment
          sendOrderConfirmation(orderId, user.id)
        }
      }
    }

    res.json({
      success: transaction.status === 'success',
      status: transaction.status,
      reference: transaction.reference,
      amount: transaction.amount / 100, // Convert from kobo to Naira
      currency: transaction.currency,
      paid_at: transaction.paid_at,
      metadata: transaction.metadata,
      customer: transaction.customer,
      authorization: transaction.authorization
    })
  } catch (error) {
    console.error('Payment verification error:', error)
    res.status(500).json({ 
      error: 'Failed to verify payment',
      details: error.message 
    })
  }
})

// Paystack webhook handler
// Note: Webhook needs raw body for signature verification
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const hash = req.headers['x-paystack-signature']
    const secret = process.env.PAYSTACK_SECRET_KEY

    // Verify webhook signature
    if (!hash) {
      return res.status(400).json({ error: 'Missing signature' })
    }

    // Verify webhook signature using raw body
    const crypto = await import('crypto')
    const hashComputed = crypto.default
      .createHmac('sha512', secret)
      .update(req.body)
      .digest('hex')

    if (hash !== hashComputed) {
      console.error('Invalid webhook signature')
      return res.status(400).json({ error: 'Invalid signature' })
    }

    // Parse the body after signature verification
    const event = JSON.parse(req.body.toString())

    // Handle different event types
    if (event.event === 'charge.success') {
      const transaction = event.data

      // Update order payment status
      if (transaction.metadata?.order_id) {
        const orderId = transaction.metadata.order_id

        // First check current order status to avoid duplicate updates
        const { data: currentOrder } = await supabaseAdmin
          .from('orders')
          .select('payment_status, status')
          .eq('id', orderId)
          .single()

        // Only update if not already paid/confirmed
        if (currentOrder && currentOrder.payment_status !== 'paid') {
          const { error: updateError } = await supabaseAdmin
            .from('orders')
            .update({
              payment_status: 'paid',
              payment_method: 'paystack',
              status: 'confirmed', // Update order status to confirmed when payment succeeds
              updated_at: new Date().toISOString()
            })
            .eq('id', orderId)

          if (updateError) {
            console.error('Error updating order from webhook:', updateError)
            return res.status(500).json({ error: 'Failed to update order' })
          }

          // Send order confirmation email after successful payment
          if (transaction.metadata?.user_id) {
            sendOrderConfirmation(orderId, transaction.metadata.user_id)
          }
        }
      }
    } else if (event.event === 'charge.failed') {
      const transaction = event.data

      // Update order payment status to failed
      if (transaction.metadata?.order_id) {
        const orderId = transaction.metadata.order_id

        const { error: updateError } = await supabaseAdmin
          .from('orders')
          .update({
            payment_status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)

        if (updateError) {
          console.error('Error updating order from webhook:', updateError)
        }
      }
    }

    // Always return 200 to acknowledge receipt
    res.status(200).json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// Create order with payment initialization
router.post('/create-order', async (req, res) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(req)
    if (authResult.error) {
      return res.status(authResult.status).json({ error: authResult.error })
    }
    const { user } = authResult

    const {
      items,
      shipping_address,
      billing_address,
      subtotal,
      shipping_amount = 0,
      tax_amount = 0,
      discount_amount = 0,
      total_amount,
      payment_method,
      email,
      notes
    } = req.body

    // Validate required fields
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' })
    }

    if (!shipping_address) {
      return res.status(400).json({ error: 'Shipping address is required' })
    }

    if (!total_amount) {
      return res.status(400).json({ error: 'Total amount is required' })
    }

    // Create order in database
    const orderData = {
      user_id: user.id,
      subtotal: parseFloat(subtotal || total_amount),
      tax_amount: parseFloat(tax_amount || 0),
      shipping_amount: parseFloat(shipping_amount || 0),
      discount_amount: parseFloat(discount_amount || 0),
      total_amount: parseFloat(total_amount),
      status: 'pending',
      payment_status: 'pending',
      payment_method: payment_method || null,
      shipping_address: shipping_address,
      billing_address: billing_address || shipping_address,
      items: items,
      notes: notes || null
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([orderData])
      .select()
      .single()

    if (orderError) {
      console.error('Order creation error:', orderError)
      return res.status(400).json({ 
        error: 'Failed to create order',
        details: orderError.message 
      })
    }

    // If payment method is Paystack (credit/debit card or bank transfer), initialize payment
    if (payment_method === 'paystack' || payment_method === 'credit_card' || payment_method === 'bank_transfer') {
      if (!email) {
        return res.status(400).json({ error: 'Email is required for Paystack payment' })
      }

      try {
        const amountInKobo = Math.round(parseFloat(total_amount) * 100)
        const backendUrl = getBackendUrl()
        const paymentResponse = await paystackClient.transaction.initialize({
          email,
          amount: amountInKobo,
          currency: 'NGN',
          metadata: {
            user_id: user.id,
            order_id: order.id
          },
          callback_url: `${backendUrl}/api/payments/callback`,
          reference: `MKG-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        })

        if (!paymentResponse.status) {
          // Order created but payment initialization failed
          return res.status(201).json({
            order,
            payment: {
              initialized: false,
              error: paymentResponse.message || 'Failed to initialize payment'
            },
            message: 'Order created but payment initialization failed. Please try again.'
          })
        }

        return res.status(201).json({
          order,
          payment: {
            initialized: true,
            authorization_url: paymentResponse.data.authorization_url,
            access_code: paymentResponse.data.access_code,
            reference: paymentResponse.data.reference
          },
          message: 'Order created and payment initialized successfully'
        })
      } catch (paymentError) {
        console.error('Payment initialization error:', paymentError)
        // Order created but payment failed
        return res.status(201).json({
          order,
          payment: {
            initialized: false,
            error: paymentError.message
          },
          message: 'Order created but payment initialization failed'
        })
      }
    }

    // For cash on delivery, just return the order
    res.status(201).json({
      order,
      payment: {
        initialized: false,
        method: 'cash_on_delivery'
      },
      message: 'Order created successfully'
    })
  } catch (error) {
    console.error('Create order error:', error)
    res.status(500).json({ 
      error: 'Failed to create order',
      details: error.message 
    })
  }
})

export default router
