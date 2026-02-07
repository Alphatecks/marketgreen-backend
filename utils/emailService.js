import nodemailer from 'nodemailer'

// Create reusable transporter for Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD // Use App Password, not regular password
    }
  })
}

/**
 * Send welcome email to newly registered user
 * @param {string} to - Recipient email address
 * @param {string} name - User's full name or username
 * @returns {Promise<Object>} - Result of email sending
 */
export const sendWelcomeEmail = async (to, name) => {
  try {
    // Validate environment variables
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      const missingVars = []
      if (!process.env.GMAIL_USER) missingVars.push('GMAIL_USER')
      if (!process.env.GMAIL_APP_PASSWORD) missingVars.push('GMAIL_APP_PASSWORD')
      
      console.error('[EMAIL] ❌ Gmail credentials not configured. Missing:', missingVars.join(', '))
      console.error('[EMAIL] Please set GMAIL_USER and GMAIL_APP_PASSWORD environment variables.')
      return { success: false, error: `Email service not configured. Missing: ${missingVars.join(', ')}` }
    }

    console.log('[EMAIL] Creating Gmail transporter...')
    const transporter = createTransporter()
    
    // Verify connection
    try {
      await transporter.verify()
      console.log('[EMAIL] ✅ Gmail connection verified')
    } catch (verifyError) {
      console.error('[EMAIL] ❌ Gmail connection verification failed:', verifyError.message)
      return { success: false, error: `Gmail connection failed: ${verifyError.message}` }
    }
    
    // Extract first name from full name
    const firstName = name ? name.split(' ')[0] : 'there'
    
    const mailOptions = {
      from: {
        name: process.env.COMPANY_NAME || 'MarketGreen',
        address: process.env.GMAIL_USER
      },
      to: to,
      subject: `Welcome to ${process.env.COMPANY_NAME || 'MarketGreen'}! 🎉`,
      html: getWelcomeEmailTemplate(firstName, process.env.FRONTEND_URL || 'https://marketgreen.shop')
    }

    console.log('[EMAIL] Sending welcome email to:', to)
    const info = await transporter.sendMail(mailOptions)
    console.log('[EMAIL] ✅ Welcome email sent successfully. Message ID:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('[EMAIL] ❌ Error sending welcome email:', {
      to: to,
      error: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    })
    // Don't throw error - email failure shouldn't break signup
    return { success: false, error: error.message }
  }
}

/**
 * Generate HTML template for welcome email
 * @param {string} firstName - User's first name
 * @param {string} frontendUrl - Frontend URL for links
 * @returns {string} - HTML email template
 */
const getWelcomeEmailTemplate = (firstName, frontendUrl) => {
  const companyName = process.env.COMPANY_NAME || 'MarketGreen'
  const companyEmail = process.env.GMAIL_USER || 'support@marketgreen.shop'
  
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
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return false
    }
    
    const transporter = createTransporter()
    await transporter.verify()
    return true
  } catch (error) {
    console.error('Email connection test failed:', error)
    return false
  }
}
