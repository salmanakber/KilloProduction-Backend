import nodemailer from 'nodemailer'
import { prisma } from './prisma'

/**
 * Get email transporter based on system settings
 * Falls back to environment variables if settings not configured
 */
async function getEmailTransporter() {
  const systemSettings = await prisma.systemSettings.findFirst() as any
  
  // If using custom SMTP, use database settings
  if (systemSettings?.emailProvider === 'smtp') {
    if (systemSettings?.smtpHost && systemSettings?.smtpUser && systemSettings?.smtpPass) {
      return nodemailer.createTransport({
        host: systemSettings.smtpHost,
        port: systemSettings.smtpPort || 587,
        secure: systemSettings.smtpSecure ?? (systemSettings.smtpPort === 465),
        auth: {
          user: systemSettings.smtpUser,
          pass: systemSettings.smtpPass,
        },
        tls: {
          rejectUnauthorized: systemSettings.smtpRejectUnauthorized ?? false,
        },
      })
    }
  }
  
  // Fallback to environment variables or default configuration
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || systemSettings?.smtpHost || 'smtp.brevo.com',
    port: Number(process.env.SMTP_PORT) || systemSettings?.smtpPort || 587,
    secure: (process.env.SMTP_SECURE === 'true') || (systemSettings?.smtpSecure ?? false),
    auth: {
      user: process.env.SMTP_USER || systemSettings?.smtpUser,
      pass: process.env.SMTP_PASS || systemSettings?.smtpPass,
    },
    tls: {
      rejectUnauthorized: (process.env.SMTP_REJECT_UNAUTHORIZED === 'true') || (systemSettings?.smtpRejectUnauthorized ?? false),
    },
  })
}

/**
 * Replace variables in template with actual values
 * @param template - Template string with {{variable}} placeholders
 * @param data - Object with variable values
 */
function replaceVariables(template: string, data: Record<string, any>): string {
  let result = template
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(regex, String(value || ''))
  }
  return result
}

/**
 * Send email via Brevo API
 * Reference: https://developers.brevo.com/docs/batch-send-transactional-emails
 */
async function sendViaBrevo(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string | undefined,
  fromEmail: string,
  fromName: string,
  bravoEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const apiKey = systemSettings?.brevoApiKey || process.env.BREVO_API_KEY


    if (!apiKey) {
      throw new Error('Brevo API key not configured')
    }

    const payload: any = {
      sender: {
        email: fromEmail,
        name: fromName,
      },
      to: [{ email: to }],
      subject,
      htmlContent,
    }

    if (textContent) {
      payload.textContent = textContent
    }

    // Add BCC if bravo email is configured
    if (bravoEmail && bravoEmail.trim()) {
      payload.bcc = [{ email: bravoEmail.trim() }]
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || `Brevo API error: ${response.statusText}`)
    }

    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    console.error('Brevo email sending failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send email via SendGrid API
 */
async function sendViaSendGrid(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string | undefined,
  fromEmail: string,
  fromName: string,
  bravoEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const apiKey = systemSettings?.sendgridApiKey || process.env.SENDGRID_API_KEY
  

    if (!apiKey) {
      throw new Error('SendGrid API key not configured')
    }

    const payload: any = {
      personalizations: [
        {
          to: [{ email: to }],
          subject,
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      content: [
        {
          type: 'text/html',
          value: htmlContent,
        },
      ],
    }

    if (textContent) {
      payload.content.push({
        type: 'text/plain',
        value: textContent,
      })
    }

    // Add BCC if bravo email is configured
    if (bravoEmail && bravoEmail.trim()) {
      payload.personalizations[0].bcc = [{ email: bravoEmail.trim() }]
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`SendGrid API error: ${error}`)
    }

    // SendGrid returns 202 with no body on success
    const messageId = response.headers.get('x-message-id') || 'sent'
    return { success: true, messageId }
  } catch (error: any) {
    console.error('SendGrid email sending failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send email via Mailgun API
 */
async function sendViaMailgun(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string | undefined,
  fromEmail: string,
  fromName: string,
  bravoEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const apiKey = systemSettings?.mailgunApiKey || process.env.MAILGUN_API_KEY
    const domain = systemSettings?.mailgunDomain || process.env.MAILGUN_DOMAIN

    if (!apiKey || !domain) {
      throw new Error('Mailgun API key or domain not configured')
    }

    const formData = new FormData()
    formData.append('from', `${fromName} <${fromEmail}>`)
    formData.append('to', to)
    formData.append('subject', subject)
    formData.append('html', htmlContent)
    if (textContent) {
      formData.append('text', textContent)
    }
    if (bravoEmail && bravoEmail.trim()) {
      formData.append('bcc', bravoEmail.trim())
    }

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`api:${apiKey}`).toString('base64')}`,
      },
      body: formData,
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || `Mailgun API error: ${response.statusText}`)
    }

    return { success: true, messageId: result.id }
  } catch (error: any) {
    console.error('Mailgun email sending failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send email via Amazon SES
 * Note: Requires @aws-sdk/client-ses package: npm install @aws-sdk/client-ses
 */
async function sendViaSES(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string | undefined,
  fromEmail: string,
  fromName: string,
  bravoEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Dynamic import to avoid requiring the package if not using SES
    // @ts-ignore - Optional dependency
    let SES: any
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sesModule = require('@aws-sdk/client-ses')
      SES = sesModule.SES
    } catch (importError: any) {
      if (importError.code === 'MODULE_NOT_FOUND' || importError.message?.includes('Cannot find module')) {
        return { success: false, error: 'AWS SDK not installed. Run: npm install @aws-sdk/client-ses' }
      }
      throw importError
    }
    
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const accessKeyId = systemSettings?.sesAccessKeyId || process.env.AWS_ACCESS_KEY_ID
    const secretAccessKey = systemSettings?.sesSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY
    const region = systemSettings?.sesRegion || process.env.AWS_SES_REGION || 'us-east-1'

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS SES credentials not configured')
    }

    const sesClient = new SES({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })

    const params: any = {
      Source: `${fromName} <${fromEmail}>`,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlContent,
            Charset: 'UTF-8',
          },
        },
      },
    }

    if (textContent) {
      params.Message.Body.Text = {
        Data: textContent,
        Charset: 'UTF-8',
      }
    }

    if (bravoEmail && bravoEmail.trim()) {
      params.Destination.BccAddresses = [bravoEmail.trim()]
    }

    const result = await sesClient.sendEmail(params)

    return { success: true, messageId: result.MessageId }
  } catch (error: any) {
    console.error('Amazon SES email sending failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send email via SMTP (nodemailer)
 */
async function sendViaSMTP(
  to: string,
  subject: string,
  htmlContent: string,
  textContent: string | undefined,
  fromEmail: string,
  bravoEmail?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const emailTransporter = await getEmailTransporter()

    const mailOptions: any = {
      from: fromEmail,
      to: to,
      subject: subject,
      html: htmlContent,
    }

    if (textContent) {
      mailOptions.text = textContent
    }

    // Add BCC if bravo email is configured
    if (bravoEmail && bravoEmail.trim()) {
      mailOptions.bcc = bravoEmail.trim()
    }

    const result = await emailTransporter.sendMail(mailOptions)
    return { success: true, messageId: result.messageId }
  } catch (error: any) {
    console.error('SMTP email sending failed:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Send email using database template with templateKey
 * @param to - Recipient email
 * @param templateKey - Unique template identifier (e.g., 'PHARMACY_ORDER_CONFIRMATION')
 * @param data - Variables to replace in template
 */
export async function sendEmailFromTemplate(
  to: string, 
  templateKey: string, 
  data: Record<string, any>,
  module?: string,
  templateType?: string
) {
  try {
    // Fetch template from database using templateKey
    const whereClause: any = {
      templateKey,
      isActive: true,
    }

    // only add module if it exists
    if (module) {
      whereClause.module = module
    }

    // only add templateType if it exists
    if (templateType) {
      whereClause.category = templateType
    }

    const template = await prisma.emailTemplate.findFirst({
      where: whereClause,
    })

    if (!template) {
      console.error(`Email template with key '${templateKey}' not found or inactive`)
      // Fall back to legacy templates if template not found
      return sendEmail(to, templateKey as any, data)
    }

    // Replace variables in subject and content
    const subject = replaceVariables(template.subject, data)
    const htmlContent = replaceVariables(template.htmlContent, data)
    const textContent = template.textContent ? replaceVariables(template.textContent, data) : undefined

    // Get system settings
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const emailProvider = systemSettings?.emailProvider || 'sendgrid'
    const bravoEmail = systemSettings?.bravoEmail
    const fromEmail = systemSettings?.smtpFrom || process.env.SMTP_USER || process.env.SMTP_FROM || 'noreply@killo.com'
    const fromName = systemSettings?.defaultSender || 'Kilo Super App'

    // Route to appropriate provider
    let result
    switch (emailProvider) {
      case 'brevo':
        result = await sendViaBrevo(to, subject, htmlContent, textContent, fromEmail, fromName, bravoEmail)
        break
      case 'sendgrid':
        result = await sendViaSendGrid(to, subject, htmlContent, textContent, fromEmail, fromName, bravoEmail)
        break
      case 'mailgun':
        result = await sendViaMailgun(to, subject, htmlContent, textContent, fromEmail, fromName, bravoEmail)
        break
      case 'ses':
        result = await sendViaSES(to, subject, htmlContent, textContent, fromEmail, fromName, bravoEmail)
        break
      case 'smtp':
      default:
        result = await sendViaSMTP(to, subject, htmlContent, textContent, fromEmail, bravoEmail)
        break
    }

    if (result.success) {
      // Update last used timestamp
      await prisma.emailTemplate.update({
        where: { id: template.id },
        data: { lastUsedAt: new Date() }
      })
    }

    return result
  } catch (error: any) {
    console.log('error', error)
    console.error('Email sending failed:', error)
    return { success: false, error: error.message }
  }
}

// Email templates (keeping existing templates)
export const emailTemplates = {
  // Wholesaler approval email
  wholesalerApproved: (data: {
    companyName: string
    email: string
    loginUrl: string
    adminContact: string
  }) => ({
    subject: `🎉 Welcome to Killo - Your Wholesaler Account is Approved!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00C851, #007E33); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">🎉 Welcome to Killo!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Your wholesaler account has been approved</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-bottom: 20px;">Congratulations, ${data.companyName}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            We're excited to inform you that your wholesaler account has been successfully approved and is now active on the Killo platform.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00C851;">
            <h3 style="color: #333; margin-top: 0;">What's Next?</h3>
            <ul style="color: #666; line-height: 1.6;">
              <li>Access your wholesaler dashboard to manage products</li>
              <li>Upload your product catalog</li>
              <li>Set up delivery zones and payment terms</li>
              <li>Start receiving orders from pharmacies</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.loginUrl}" style="background: #00C851; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              🚀 Access Your Dashboard
            </a>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d5a2d; margin-top: 0;">Need Help?</h4>
            <p style="color: #666; margin-bottom: 10px;">
              Our support team is here to help you get started. Contact us at:
            </p>
            <p style="color: #00C851; font-weight: bold; margin: 0;">
              📧 ${data.adminContact}
            </p>
          </div>
          
          <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
            Thank you for choosing Killo as your business partner!
          </p>
        </div>
      </div>
    `
  }),

  // Wholesaler rejection email
  wholesalerRejected: (data: {
    companyName: string
    email: string
    reason: string
    adminContact: string
  }) => ({
    subject: `Update on Your Killo Wholesaler Application`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #FF6B35, #E55A2B); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Application Update</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Your wholesaler application requires attention</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-bottom: 20px;">Dear ${data.companyName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Thank you for your interest in becoming a wholesaler partner with Killo. After careful review of your application, we regret to inform you that we are unable to approve your account at this time.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF6B35;">
            <h3 style="color: #333; margin-top: 0;">Reason for Rejection:</h3>
            <p style="color: #666; line-height: 1.6; font-style: italic;">
              "${data.reason}"
            </p>
          </div>
          
          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #e65100; margin-top: 0;">What You Can Do:</h4>
            <ul style="color: #666; line-height: 1.6;">
              <li>Address the issues mentioned above</li>
              <li>Resubmit your application with updated information</li>
              <li>Contact our support team for guidance</li>
            </ul>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d5a2d; margin-top: 0;">Need Assistance?</h4>
            <p style="color: #666; margin-bottom: 10px;">
              Our team is here to help you address any concerns:
            </p>
            <p style="color: #00C851; font-weight: bold; margin: 0;">
              📧 ${data.adminContact}
            </p>
          </div>
          
          <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
            We appreciate your interest in Killo and hope to work with you in the future.
          </p>
        </div>
      </div>
    `
  }),

  // Pharmacy verification approved
  pharmacyApproved: (data: {
    pharmacyName: string
    email: string
    loginUrl: string
    adminContact: string
  }) => ({
    subject: `🎉 Your Pharmacy is Now Live on Killo!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00C851, #007E33); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">🎉 Welcome to Killo!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Your pharmacy verification is complete</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-bottom: 20px;">Congratulations, ${data.pharmacyName}!</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Great news! Your pharmacy verification has been approved and your account is now fully active on the Killo platform.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00C851;">
            <h3 style="color: #333; margin-top: 0;">You Can Now:</h3>
            <ul style="color: #666; line-height: 1.6;">
              <li>Access your pharmacy dashboard</li>
              <li>Add medicines to your inventory</li>
              <li>Receive customer orders</li>
              <li>Manage your pharmacy profile</li>
              <li>Connect with wholesalers</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${data.loginUrl}" style="background: #00C851; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              🚀 Access Your Dashboard
            </a>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d5a2d; margin-top: 0;">Need Help Getting Started?</h4>
            <p style="color: #666; margin-bottom: 10px;">
              Our support team is here to help you succeed:
            </p>
            <p style="color: #00C851; font-weight: bold; margin: 0;">
              📧 ${data.adminContact}
            </p>
          </div>
          
          <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
            Welcome to the Killo family! We're excited to help you grow your business.
          </p>
        </div>
      </div>
    `
  }),

  // Pharmacy verification rejected
  pharmacyRejected: (data: {
    pharmacyName: string
    email: string
    reason: string
    adminContact: string
  }) => ({
    subject: `Update on Your Killo Pharmacy Verification`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #FF6B35, #E55A2B); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Verification Update</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Your pharmacy verification requires attention</p>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-bottom: 20px;">Dear ${data.pharmacyName},</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            Thank you for your interest in joining Killo as a pharmacy partner. After reviewing your verification documents, we need additional information before we can approve your account.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #FF6B35;">
            <h3 style="color: #333; margin-top: 0;">Issues to Address:</h3>
            <p style="color: #666; line-height: 1.6; font-style: italic;">
              "${data.reason}"
            </p>
          </div>
          
          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #e65100; margin-top: 0;">Next Steps:</h4>
            <ul style="color: #666; line-height: 1.6;">
              <li>Review and address the issues mentioned above</li>
              <li>Update your verification documents</li>
              <li>Resubmit your application</li>
              <li>Contact our support team if you need assistance</li>
            </ul>
          </div>
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d5a2d; margin-top: 0;">Need Help?</h4>
            <p style="color: #666; margin-bottom: 10px;">
              Our verification team is here to assist you:
            </p>
            <p style="color: #00C851; font-weight: bold; margin: 0;">
              📧 ${data.adminContact}
            </p>
          </div>
          
          <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
            We look forward to working with you once these issues are resolved.
          </p>
        </div>
      </div>
    `
  }),

  // Generic notification email
  genericNotification: (data: {
    title: string
    message: string
    email: string
    actionUrl?: string
    actionText?: string
    adminContact: string
  }) => ({
    subject: data.title,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #00C851, #007E33); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Killo Notification</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-bottom: 20px;">${data.title}</h2>
          
          <p style="color: #666; line-height: 1.6; margin-bottom: 20px;">
            ${data.message}
          </p>
          
          ${data.actionUrl && data.actionText ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.actionUrl}" style="background: #00C851; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                ${data.actionText}
              </a>
            </div>
          ` : ''}
          
          <div style="background: #e8f5e8; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h4 style="color: #2d5a2d; margin-top: 0;">Need Help?</h4>
            <p style="color: #666; margin-bottom: 10px;">
              Contact our support team:
            </p>
            <p style="color: #00C851; font-weight: bold; margin: 0;">
              📧 ${data.adminContact}
            </p>
          </div>
          
          <p style="color: #999; font-size: 14px; text-align: center; margin-top: 30px;">
            Thank you for choosing Killo!
          </p>
        </div>
      </div>
    `
  })
}

// Email sending function
export async function sendEmail(to: string, template: keyof typeof emailTemplates, data: any) {
  try {
    const emailContent = emailTemplates[template](data)
    
    // Get system settings
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const emailProvider = systemSettings?.emailProvider || 'sendgrid'
    const bravoEmail = systemSettings?.bravoEmail
    const fromEmail = systemSettings?.smtpFrom || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@killo.com'
    const fromName = systemSettings?.defaultSender || 'Kilo Super App'

    // Route to appropriate provider
    switch (emailProvider) {
      case 'brevo':
        return await sendViaBrevo(to, emailContent.subject, emailContent.html, undefined, fromEmail, fromName, bravoEmail)
      case 'sendgrid':
        return await sendViaSendGrid(to, emailContent.subject, emailContent.html, undefined, fromEmail, fromName, bravoEmail)
      case 'mailgun':
        return await sendViaMailgun(to, emailContent.subject, emailContent.html, undefined, fromEmail, fromName, bravoEmail)
      case 'ses':
        return await sendViaSES(to, emailContent.subject, emailContent.html, undefined, fromEmail, fromName, bravoEmail)
      case 'smtp':
      default:
        return await sendViaSMTP(to, emailContent.subject, emailContent.html, undefined, fromEmail, bravoEmail)
    }
  } catch (error: any) {
    console.error('Email sending failed:', error)
    return { success: false, error: error.message }
  }
}

// Utility function to send multiple emails
export async function sendBulkEmails(emails: Array<{ to: string; template: keyof typeof emailTemplates; data: any }>) {
  const results: Array<{ to: string; template: keyof typeof emailTemplates; data: any; result: { success: boolean; messageId?: string; error?: string } }> = []
  
  for (const email of emails) {
    const result = await sendEmail(email.to, email.template, email.data)
    results.push({ ...email, result })
  }
  
  return results
}

// Test email function
export async function testEmailConnection() {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const emailProvider = systemSettings?.emailProvider || 'sendgrid'
    
    // For API providers, we can't easily test without sending an email
    // For SMTP, we can verify the connection
    if (emailProvider === 'smtp') {
      const emailTransporter = await getEmailTransporter()
      await emailTransporter.verify()
      console.log('SMTP connection successful')
      return true
    }
    
    // For API providers, return true (connection test would require API call)
    console.log(`Email provider ${emailProvider} configured (API-based, connection test skipped)`)
    return true
  } catch (error) {
    console.error('Email connection test failed:', error)
    return false
  }
}
