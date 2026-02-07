import { Resend } from 'resend'

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY)

// Cache to prevent duplicate emails within a short time window
const emailSentCache = new Map()
const CACHE_TTL = 60000 // 60 seconds - prevent duplicate emails within 1 minute

/**
 * Send welcome email to newly registered user
 * @param {string} to - Recipient email address
 * @param {string} name - User's full name or username
 * @returns {Promise<Object>} - Result of email sending
 */
export const sendWelcomeEmail = async (to, name) => {
  try {
    // Validate environment variables
    if (!process.env.RESEND_API_KEY) {
      console.error('[EMAIL] ❌ Resend API key not configured.')
      console.error('[EMAIL] Please set RESEND_API_KEY environment variable.')
      return { success: false, error: 'Email service not configured. Missing: RESEND_API_KEY' }
    }

    // Check cache to prevent duplicate emails
    const cacheKey = `welcome-${to.toLowerCase()}`
    const cached = emailSentCache.get(cacheKey)
    if (cached && (Date.now() - cached) < CACHE_TTL) {
      console.log('[EMAIL] ⏭️  Skipping duplicate welcome email to:', to, '(already sent recently)')
      return { success: true, messageId: 'cached', skipped: true }
    }

    // Validate sender email
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.COMPANY_EMAIL || 'onboarding@resend.dev'
    if (!fromEmail || fromEmail === 'onboarding@resend.dev') {
      console.warn('[EMAIL] ⚠️  Using default Resend sender email. Set RESEND_FROM_EMAIL for production.')
    }

    console.log('[EMAIL] Sending welcome email via Resend to:', to)
    
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
    
    // Extract first name from full name
    const firstName = name ? name.split(' ')[0] : 'there'
    const companyName = process.env.COMPANY_NAME || 'MarketGreen'
    const frontendUrl = process.env.FRONTEND_URL || 'https://marketgreen.shop'
    const companyEmail = process.env.COMPANY_EMAIL || fromEmail
    
    const { data, error } = await resend.emails.send({
      from: `${companyName} <${fromEmail}>`,
      to: to,
      subject: `Welcome to ${companyName}! 🎉`,
      html: getWelcomeEmailTemplate(firstName, frontendUrl, companyName, companyEmail)
    })

    if (error) {
      // Remove from cache on failure so it can be retried
      emailSentCache.delete(cacheKey)
      console.error('[EMAIL] ❌ Error sending welcome email:', {
        to: to,
        error: error.message,
        name: error.name
      })
      return { success: false, error: error.message }
    }

    console.log('[EMAIL] ✅ Welcome email sent successfully. Message ID:', data?.id)
    return { success: true, messageId: data?.id }
  } catch (error) {
    // Remove from cache on failure so it can be retried
    emailSentCache.delete(cacheKey)
    console.error('[EMAIL] ❌ Exception sending welcome email:', {
      to: to,
      error: error.message,
      stack: error.stack
    })
    // Don't throw error - email failure shouldn't break signup
    return { success: false, error: error.message }
  }
}

/**
 * Generate HTML template for welcome email
 * @param {string} firstName - User's first name
 * @param {string} frontendUrl - Frontend URL for links
 * @param {string} companyName - Company name
 * @param {string} companyEmail - Company support email
 * @returns {string} - HTML email template
 */
const getWelcomeEmailTemplate = (firstName, frontendUrl, companyName, companyEmail) => {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                Welcome to ${companyName}! 🎉
              </h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 18px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                We're thrilled to have you join the ${companyName} community! Your account has been successfully created, and you're all set to start exploring our amazing collection of eco-friendly products.
              </p>
              
              <p style="margin: 0 0 30px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Here's what you can do next:
              </p>
              
              <!-- Features List -->
              <table role="presentation" style="width: 100%; margin-bottom: 30px;">
                <tr>
                  <td style="padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px; margin-bottom: 15px;">
                    <p style="margin: 0; color: #1f2937; font-size: 15px; line-height: 1.6;">
                      <strong style="color: #059669;">🛍️ Browse Products</strong><br>
                      Discover our curated selection of sustainable and eco-friendly products
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px; margin-bottom: 15px;">
                    <p style="margin: 0; color: #1f2937; font-size: 15px; line-height: 1.6;">
                      <strong style="color: #059669;">💚 Track Orders</strong><br>
                      Monitor your orders and deliveries in real-time
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 15px; background-color: #f0fdf4; border-left: 4px solid #10b981; border-radius: 4px;">
                    <p style="margin: 0; color: #1f2937; font-size: 15px; line-height: 1.6;">
                      <strong style="color: #059669;">⭐ Save Favorites</strong><br>
                      Create wishlists and save your favorite products for later
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${frontendUrl}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3); transition: transform 0.2s;">
                      Start Shopping Now
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you have any questions or need assistance, feel free to reach out to our support team. We're here to help!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                <strong style="color: #1f2937;">${companyName}</strong><br>
                Your trusted partner for sustainable shopping
              </p>
              <p style="margin: 15px 0 10px 0; color: #9ca3af; font-size: 12px;">
                <a href="${frontendUrl}" style="color: #10b981; text-decoration: none;">Visit our website</a> | 
                <a href="mailto:${companyEmail}" style="color: #10b981; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; line-height: 1.5;">
                This email was sent to you because you created an account with ${companyName}.<br>
                If you didn't create this account, please ignore this email.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send order confirmation email after successful payment
 * @param {string} to - Recipient email address
 * @param {Object} order - Order object with all details
 * @param {string} userName - User's full name or username
 * @returns {Promise<Object>} - Result of email sending
 */
export const sendOrderConfirmationEmail = async (to, order, userName) => {
  try {
    // Validate environment variables
    if (!process.env.RESEND_API_KEY) {
      console.error('[EMAIL] ❌ Resend API key not configured.')
      return { success: false, error: 'Email service not configured. Missing: RESEND_API_KEY' }
    }

    // Validate sender email
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.COMPANY_EMAIL || 'onboarding@resend.dev'
    
    console.log('[EMAIL] Sending order confirmation email via Resend to:', to)
    
    // Extract first name from full name
    const firstName = userName ? userName.split(' ')[0] : 'there'
    const companyName = process.env.COMPANY_NAME || 'MarketGreen'
    const frontendUrl = process.env.FRONTEND_URL || 'https://marketgreen.shop'
    const companyEmail = process.env.COMPANY_EMAIL || fromEmail
    
    const { data, error } = await resend.emails.send({
      from: `${companyName} <${fromEmail}>`,
      to: to,
      subject: `Order Confirmation - ${order.order_number || order.id.substring(0, 8)}`,
      html: getOrderConfirmationEmailTemplate(order, firstName, frontendUrl, companyName, companyEmail)
    })

    if (error) {
      console.error('[EMAIL] ❌ Error sending order confirmation email:', {
        to: to,
        error: error.message,
        name: error.name
      })
      return { success: false, error: error.message }
    }

    console.log('[EMAIL] ✅ Order confirmation email sent successfully. Message ID:', data?.id)
    return { success: true, messageId: data?.id }
  } catch (error) {
    console.error('[EMAIL] ❌ Exception sending order confirmation email:', {
      to: to,
      error: error.message,
      stack: error.stack
    })
    // Don't throw error - email failure shouldn't break payment flow
    return { success: false, error: error.message }
  }
}

/**
 * Generate HTML template for order confirmation email
 * @param {Object} order - Order object
 * @param {string} firstName - User's first name
 * @param {string} frontendUrl - Frontend URL for links
 * @param {string} companyName - Company name
 * @param {string} companyEmail - Company support email
 * @returns {string} - HTML email template
 */
const getOrderConfirmationEmailTemplate = (order, firstName, frontendUrl, companyName, companyEmail) => {
  const orderNumber = order.order_number || order.id.substring(0, 8).toUpperCase()
  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
  
  // Get status badge color
  const getStatusColor = (status) => {
    const statusMap = {
      'pending': '#f59e0b',
      'processing': '#3b82f6',
      'confirmed': '#10b981',
      'shipped': '#8b5cf6',
      'delivered': '#059669',
      'canceled': '#ef4444',
      'refunded': '#6b7280'
    }
    return statusMap[status?.toLowerCase()] || '#6b7280'
  }

  const statusColor = getStatusColor(order.status)
  const paymentStatus = order.payment_status === 'paid' ? 'Paid' : order.payment_status || 'Pending'
  
  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount || 0)
  }

  // Generate order items HTML
  const items = Array.isArray(order.items) ? order.items : []
  const itemsHtml = items.map(item => {
    // Get product image - try multiple fields
    const productImage = item.image_url || item.main_image || item.image || item.product_image || 
                        (item.product?.main_image) || (item.product?.image_url) || 
                        'https://via.placeholder.com/100x100?text=No+Image'
    
    const productName = item.name || item.product_name || 'Product'
    const quantity = item.quantity || 1
    const price = item.price || item.product_price || 0
    const subtotal = item.subtotal || (price * quantity)
    
    return `
      <tr>
        <td style="padding: 15px; border-bottom: 1px solid #e5e7eb;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 100px; padding-right: 15px; vertical-align: top;">
                <img src="${productImage}" alt="${productName}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; border: 1px solid #e5e7eb;" />
              </td>
              <td style="vertical-align: top;">
                <p style="margin: 0 0 8px 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  ${productName}
                </p>
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">
                  Quantity: ${quantity}
                </p>
                <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  ${formatCurrency(subtotal)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `
  }).join('')

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header with gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                Order Confirmed! ✅
              </h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 18px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              
              <p style="margin: 0 0 30px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                Thank you for your order! We've received your payment and your order has been confirmed. We're preparing your items and will notify you once they're on the way.
              </p>
              
              <!-- Order Details Card -->
              <table role="presentation" style="width: 100%; margin-bottom: 30px; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding-bottom: 10px;">
                          <p style="margin: 0; color: #6b7280; font-size: 14px;">Order Number</p>
                          <p style="margin: 5px 0 0 0; color: #1f2937; font-size: 18px; font-weight: 600;">${orderNumber}</p>
                        </td>
                        <td align="right" style="padding-bottom: 10px;">
                          <p style="margin: 0; color: #6b7280; font-size: 14px;">Order Status</p>
                          <span style="display: inline-block; padding: 6px 12px; background-color: ${statusColor}20; color: ${statusColor}; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 5px;">
                            ${(order.status || 'Pending').charAt(0).toUpperCase() + (order.status || 'Pending').slice(1)}
                          </span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 15px; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Order Date</p>
                          <p style="margin: 0; color: #1f2937; font-size: 14px;">${orderDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 10px;">
                          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Payment Status</p>
                          <p style="margin: 0; color: #10b981; font-size: 14px; font-weight: 600;">${paymentStatus}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Order Items -->
              <h2 style="margin: 0 0 20px 0; color: #1f2937; font-size: 20px; font-weight: 600;">Order Items</h2>
              <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                ${itemsHtml || '<tr><td style="padding: 20px; text-align: center; color: #6b7280;">No items found</td></tr>'}
              </table>
              
              <!-- Order Summary -->
              <table role="presentation" style="width: 100%; margin-bottom: 30px; border-collapse: collapse;">
                <tr>
                  <td style="padding: 15px 0; border-bottom: 1px solid #e5e7eb;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="color: #6b7280; font-size: 14px;">Subtotal</td>
                        <td align="right" style="color: #1f2937; font-size: 14px; font-weight: 600;">${formatCurrency(order.subtotal || order.total_amount)}</td>
                      </tr>
                      ${order.shipping_amount > 0 ? `
                      <tr>
                        <td style="padding-top: 10px; color: #6b7280; font-size: 14px;">Shipping</td>
                        <td align="right" style="padding-top: 10px; color: #1f2937; font-size: 14px; font-weight: 600;">${formatCurrency(order.shipping_amount)}</td>
                      </tr>
                      ` : ''}
                      ${order.tax_amount > 0 ? `
                      <tr>
                        <td style="padding-top: 10px; color: #6b7280; font-size: 14px;">Tax</td>
                        <td align="right" style="padding-top: 10px; color: #1f2937; font-size: 14px; font-weight: 600;">${formatCurrency(order.tax_amount)}</td>
                      </tr>
                      ` : ''}
                      ${order.discount_amount > 0 ? `
                      <tr>
                        <td style="padding-top: 10px; color: #10b981; font-size: 14px;">Discount</td>
                        <td align="right" style="padding-top: 10px; color: #10b981; font-size: 14px; font-weight: 600;">-${formatCurrency(order.discount_amount)}</td>
                      </tr>
                      ` : ''}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 20px 0 0 0;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="color: #1f2937; font-size: 18px; font-weight: 700;">Total</td>
                        <td align="right" style="color: #10b981; font-size: 24px; font-weight: 700;">${formatCurrency(order.total_amount)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Shipping Address -->
              ${order.shipping_address ? `
              <h2 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 20px; font-weight: 600;">Shipping Address</h2>
              <div style="padding: 20px; background-color: #f9fafb; border-radius: 8px; margin-bottom: 30px;">
                <p style="margin: 0; color: #1f2937; font-size: 14px; line-height: 1.8;">
                  ${typeof order.shipping_address === 'string' ? order.shipping_address : 
                    `${order.shipping_address.street || ''}<br>
                    ${order.shipping_address.city || ''}, ${order.shipping_address.state || ''}<br>
                    ${order.shipping_address.postal_code || ''}<br>
                    ${order.shipping_address.country || ''}`}
                </p>
              </div>
              ` : ''}
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${frontendUrl}/orders/${order.id}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                      View Order Details
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you have any questions about your order, feel free to reach out to our support team. We're here to help!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                <strong style="color: #1f2937;">${companyName}</strong><br>
                Your trusted partner for sustainable shopping
              </p>
              <p style="margin: 15px 0 10px 0; color: #9ca3af; font-size: 12px;">
                <a href="${frontendUrl}" style="color: #10b981; text-decoration: none;">Visit our website</a> | 
                <a href="mailto:${companyEmail}" style="color: #10b981; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; line-height: 1.5;">
                This email was sent regarding your order ${orderNumber} with ${companyName}.<br>
                If you have any concerns, please contact our support team.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Send order status update email to customer
 * @param {string} to - Recipient email address
 * @param {Object} order - Order object with updated status
 * @param {string} userName - User's full name or username
 * @param {string} oldStatus - Previous order status
 * @param {string} newStatus - New order status
 * @returns {Promise<Object>} - Result of email sending
 */
export const sendOrderStatusUpdateEmail = async (to, order, userName, oldStatus, newStatus) => {
  try {
    // Validate environment variables
    if (!process.env.RESEND_API_KEY) {
      console.error('[EMAIL] ❌ Resend API key not configured.')
      return { success: false, error: 'Email service not configured. Missing: RESEND_API_KEY' }
    }

    // Validate sender email
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.COMPANY_EMAIL || 'onboarding@resend.dev'
    
    console.log('[EMAIL] Sending order status update email via Resend to:', to)
    
    // Extract first name from full name
    const firstName = userName ? userName.split(' ')[0] : 'there'
    const companyName = process.env.COMPANY_NAME || 'MarketGreen'
    const frontendUrl = process.env.FRONTEND_URL || 'https://marketgreen.shop'
    const companyEmail = process.env.COMPANY_EMAIL || fromEmail
    
    // Get status-specific subject and message
    const statusInfo = getStatusUpdateInfo(newStatus, order.order_number || order.id.substring(0, 8))
    
    const { data, error } = await resend.emails.send({
      from: `${companyName} <${fromEmail}>`,
      to: to,
      subject: statusInfo.subject,
      html: getOrderStatusUpdateEmailTemplate(order, firstName, oldStatus, newStatus, statusInfo, frontendUrl, companyName, companyEmail)
    })

    if (error) {
      console.error('[EMAIL] ❌ Error sending order status update email:', {
        to: to,
        error: error.message,
        name: error.name
      })
      return { success: false, error: error.message }
    }

    console.log('[EMAIL] ✅ Order status update email sent successfully. Message ID:', data?.id)
    return { success: true, messageId: data?.id }
  } catch (error) {
    console.error('[EMAIL] ❌ Exception sending order status update email:', {
      to: to,
      error: error.message,
      stack: error.stack
    })
    return { success: false, error: error.message }
  }
}

/**
 * Get status-specific information for email
 * @param {string} status - Order status
 * @param {string} orderNumber - Order number
 * @returns {Object} - Status info with subject and message
 */
const getStatusUpdateInfo = (status, orderNumber) => {
  const statusMap = {
    'processing': {
      subject: `Your Order #${orderNumber} is Being Processed`,
      icon: '⚙️',
      message: 'We\'ve received your order and our team is now preparing it for shipment.',
      color: '#3b82f6'
    },
    'confirmed': {
      subject: `Order Confirmed - #${orderNumber}`,
      icon: '✅',
      message: 'Your order has been confirmed and is ready for processing.',
      color: '#10b981'
    },
    'shipped': {
      subject: `Your Order #${orderNumber} Has Shipped! 🚚`,
      icon: '🚚',
      message: 'Great news! Your order has been shipped and is on its way to you.',
      color: '#8b5cf6'
    },
    'delivered': {
      subject: `Order Delivered - #${orderNumber} 🎉`,
      icon: '🎉',
      message: 'Your order has been delivered! We hope you enjoy your purchase.',
      color: '#059669'
    },
    'canceled': {
      subject: `Order Cancelled - #${orderNumber}`,
      icon: '❌',
      message: 'Your order has been cancelled. If you have any questions, please contact our support team.',
      color: '#ef4444'
    },
    'refunded': {
      subject: `Refund Processed - Order #${orderNumber}`,
      icon: '💰',
      message: 'Your refund has been processed. The amount will be credited back to your original payment method.',
      color: '#6b7280'
    }
  }
  
  return statusMap[status?.toLowerCase()] || {
    subject: `Order Status Updated - #${orderNumber}`,
    icon: '📦',
    message: `Your order status has been updated to ${status}.`,
    color: '#6b7280'
  }
}

/**
 * Generate HTML template for order status update email
 * @param {Object} order - Order object
 * @param {string} firstName - User's first name
 * @param {string} oldStatus - Previous status
 * @param {string} newStatus - New status
 * @param {Object} statusInfo - Status-specific information
 * @param {string} frontendUrl - Frontend URL for links
 * @param {string} companyName - Company name
 * @param {string} companyEmail - Company support email
 * @returns {string} - HTML email template
 */
const getOrderStatusUpdateEmailTemplate = (order, firstName, oldStatus, newStatus, statusInfo, frontendUrl, companyName, companyEmail) => {
  const orderNumber = order.order_number || order.id.substring(0, 8).toUpperCase()
  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric'
  })
  
  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount || 0)
  }

  // Generate order items HTML (if available)
  const items = Array.isArray(order.items) ? order.items : []
  const itemsHtml = items.length > 0 ? items.slice(0, 3).map(item => {
    const productName = item.name || item.product_name || 'Product'
    const quantity = item.quantity || 1
    return `
      <tr>
        <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">
          ${productName} × ${quantity}
        </td>
      </tr>
    `
  }).join('') : '<tr><td style="padding: 8px 0; color: #6b7280; font-size: 14px;">Order items</td></tr>'

  // Tracking number section (if shipped)
  const trackingSection = newStatus === 'shipped' && order.tracking_number ? `
    <div style="padding: 20px; background-color: #f0f9ff; border-left: 4px solid ${statusInfo.color}; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px; font-weight: 600;">Tracking Number:</p>
      <p style="margin: 0; color: ${statusInfo.color}; font-size: 18px; font-weight: 700; font-family: monospace;">${order.tracking_number}</p>
    </div>
  ` : ''

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Status Update - ${companyName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          
          <!-- Header with status color -->
          <tr>
            <td style="background: linear-gradient(135deg, ${statusInfo.color} 0%, ${statusInfo.color}dd 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
                ${statusInfo.icon} ${statusInfo.subject.split(' - ')[0]}
              </h1>
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 18px; line-height: 1.6;">
                Hi ${firstName},
              </p>
              
              <p style="margin: 0 0 20px 0; color: #4b5563; font-size: 16px; line-height: 1.6;">
                ${statusInfo.message}
              </p>
              
              <!-- Order Details Card -->
              <table role="presentation" style="width: 100%; margin: 20px 0; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="padding-bottom: 10px;">
                          <p style="margin: 0; color: #6b7280; font-size: 14px;">Order Number</p>
                          <p style="margin: 5px 0 0 0; color: #1f2937; font-size: 18px; font-weight: 600;">${orderNumber}</p>
                        </td>
                        <td align="right" style="padding-bottom: 10px;">
                          <p style="margin: 0; color: #6b7280; font-size: 14px;">Order Total</p>
                          <p style="margin: 5px 0 0 0; color: #1f2937; font-size: 18px; font-weight: 600;">${formatCurrency(order.total_amount)}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 15px; border-top: 1px solid #e5e7eb;">
                          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Order Date</p>
                          <p style="margin: 0; color: #1f2937; font-size: 14px;">${orderDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding-top: 10px;">
                          <p style="margin: 0 0 5px 0; color: #6b7280; font-size: 14px;">Status</p>
                          <span style="display: inline-block; padding: 6px 12px; background-color: ${statusInfo.color}20; color: ${statusInfo.color}; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 5px;">
                            ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              ${trackingSection}
              
              <!-- Order Items Preview -->
              ${items.length > 0 ? `
              <h2 style="margin: 30px 0 15px 0; color: #1f2937; font-size: 18px; font-weight: 600;">Order Items</h2>
              <table role="presentation" style="width: 100%; margin-bottom: 20px; border-collapse: collapse;">
                ${itemsHtml}
                ${items.length > 3 ? '<tr><td style="padding: 8px 0; color: #9ca3af; font-size: 12px;">... and more</td></tr>' : ''}
              </table>
              ` : ''}
              
              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; margin: 30px 0;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${frontendUrl}/orders/${order.id}" style="display: inline-block; padding: 16px 32px; background: linear-gradient(135deg, ${statusInfo.color} 0%, ${statusInfo.color}dd 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                      View Order Details
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 30px 0 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                If you have any questions about your order, feel free to reach out to our support team. We're here to help!
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb; text-align: center;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px;">
                <strong style="color: #1f2937;">${companyName}</strong><br>
                Your trusted partner for sustainable shopping
              </p>
              <p style="margin: 15px 0 10px 0; color: #9ca3af; font-size: 12px;">
                <a href="${frontendUrl}" style="color: ${statusInfo.color}; text-decoration: none;">Visit our website</a> | 
                <a href="mailto:${companyEmail}" style="color: ${statusInfo.color}; text-decoration: none;">Contact Support</a>
              </p>
              <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px; line-height: 1.5;">
                This email was sent regarding your order ${orderNumber} with ${companyName}.<br>
                If you have any concerns, please contact our support team.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

/**
 * Test email configuration
 * @returns {Promise<boolean>} - True if email service is properly configured
 */
export const testEmailConnection = async () => {
  try {
    if (!process.env.RESEND_API_KEY) {
      return false
    }
    
    // Resend doesn't have a verify method like nodemailer
    // We can test by checking if the API key is set and the client is initialized
    return !!resend && !!process.env.RESEND_API_KEY
  } catch (error) {
    console.error('Email connection test failed:', error)
    return false
  }
}
