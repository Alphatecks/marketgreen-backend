import { Resend } from 'resend'

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY)

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

    // Validate sender email
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.COMPANY_EMAIL || 'onboarding@resend.dev'
    if (!fromEmail || fromEmail === 'onboarding@resend.dev') {
      console.warn('[EMAIL] ⚠️  Using default Resend sender email. Set RESEND_FROM_EMAIL for production.')
    }

    console.log('[EMAIL] Sending welcome email via Resend to:', to)
    
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
