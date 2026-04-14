import twilio from "twilio"
import { prisma } from './prisma'
import { formatPhoneForTwilio } from "./phoneUtils"

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
 * Send SMS via Twilio
 */
async function sendViaTwilio(phone: string, message: string): Promise<boolean> {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const accountSid = systemSettings?.twilioAccountSid || process.env.TWILIO_ACCOUNT_SID
    const authToken = systemSettings?.twilioAuthToken || process.env.TWILIO_AUTH_TOKEN
    const fromNumber = systemSettings?.twilioPhoneNumber || process.env.TWILIO_PHONE_NUMBER
    const DEFAULT_COUNTRY = process.env.DEFAULT_COUNTRY || "PK"

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error("Twilio credentials not found")
    }

    if (process.env.SENDING_SMS === "false") {
      console.log('SMS sending disabled. Would send:', { phone, message })
      return true
    }

    const client = twilio(accountSid, authToken)
    const formattedPhone = formatPhoneForTwilio(phone, DEFAULT_COUNTRY)

    await client.messages.create({
      body: message,
      from: fromNumber,
      to: formattedPhone,
    })

    return true
  } catch (error) {
    console.error("Twilio SMS sending failed:", error)
    return false
  }
}

/**
 * Send SMS via Nexmo (Vonage)
 */
async function sendViaNexmo(phone: string, message: string): Promise<boolean> {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const apiKey = systemSettings?.nexmoApiKey || process.env.NEXMO_API_KEY
    const apiSecret = systemSettings?.nexmoApiSecret || process.env.NEXMO_API_SECRET
    const fromNumber = systemSettings?.nexmoFromNumber || process.env.NEXMO_FROM_NUMBER

    if (!apiKey || !apiSecret) {
      throw new Error("Nexmo credentials not found")
    }

    if (process.env.SENDING_SMS === "false") {
      console.log('SMS sending disabled. Would send:', { phone, message })
      return true
    }

    // Nexmo/Vonage API endpoint
    const response = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        api_secret: apiSecret,
        to: phone,
        from: fromNumber || 'Kilo',
        text: message,
      }),
    })

    const result = await response.json()

    if (result.messages && result.messages[0].status === '0') {
      return true
    } else {
      const errorText = result.messages?.[0]?.['error-text'] || 'Nexmo API error'
      throw new Error(errorText)
    }
  } catch (error) {
    console.error("Nexmo SMS sending failed:", error)
    return false
  }
}

/**
 * Send SMS via Africa's Talking
 */
async function sendViaAfricasTalking(phone: string, message: string): Promise<boolean> {
  try {
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const apiKey = systemSettings?.africasTalkingApiKey || process.env.AFRICAS_TALKING_API_KEY
    const username = systemSettings?.africasTalkingUsername || process.env.AFRICAS_TALKING_USERNAME

    if (!apiKey || !username) {
      throw new Error("Africa's Talking credentials not found")
    }

    if (process.env.SENDING_SMS === "false") {
      console.log('SMS sending disabled. Would send:', { phone, message })
      return true
    }

    // Africa's Talking API endpoint
    const response = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        'ApiKey': apiKey,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        username: username,
        to: phone,
        message: message,
      }),
    })

    const result = await response.json()

    if (result.SMSMessageData && result.SMSMessageData.Recipients) {
      const recipient = result.SMSMessageData.Recipients[0]
      if (recipient.status === 'Success') {
        return true
      } else {
        throw new Error(recipient.statusMessage || 'Africa\'s Talking API error')
      }
    } else {
      throw new Error('Africa\'s Talking API error: Invalid response')
    }
  } catch (error) {
    console.error("Africa's Talking SMS sending failed:", error)
    return false
  }
}

/**
 * Send SMS using database template with templateKey
 * @param phone - Recipient phone number
 * @param templateKey - Unique template identifier (e.g., 'PHARMACY_ORDER_SHIPPED')
 * @param data - Variables to replace in template
 */
export async function sendSMSFromTemplate(
  phone: string,
  templateKey: string,
  data: Record<string, any>
) {
  try {
    // Get SMS provider from settings
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const smsProvider = systemSettings?.smsProvider || 'twilio'

    // Fetch template from database using templateKey
    const template = await prisma.smsTemplate.findFirst({
      where: {
        templateKey,
        isActive: true
      }
    })

    if (!template) {
      console.error(`SMS template with key '${templateKey}' not found or inactive`)
      // Fall back to legacy sendOTP if it's an OTP template
      if (templateKey === 'GLOBAL_OTP' && data.otp) {
        return sendOTP(phone, data.otp)
      }
      throw new Error(`Template with key '${templateKey}' not found`)
    }

    // Replace variables in content
    const content = replaceVariables(template.content, data)

    // Route to appropriate SMS provider
    let success = false
    switch (smsProvider) {
      case 'twilio':
        success = await sendViaTwilio(phone, content)
        break
      case 'nexmo':
        success = await sendViaNexmo(phone, content)
        break
      case 'africas_talking':
        success = await sendViaAfricasTalking(phone, content)
        break
      default:
        success = await sendViaTwilio(phone, content)
        break
    }

    if (success) {
      // Update last used timestamp
      await prisma.smsTemplate.update({
        where: { id: template.id },
        data: { lastUsedAt: new Date() }
      })
    }

    return success
  } catch (error) {
    console.error("SMS sending failed:", error)
    return false
  }
}

/**
 * Send OTP via SMS
 * @param phone - Recipient phone number
 * @param otp - OTP code to send
 */
export async function sendOTP(phone: string, otp: string) {
  try {
    // Get SMS provider from settings
    const systemSettings = await prisma.systemSettings.findFirst() as any
    const smsProvider = systemSettings?.smsProvider || 'twilio'

    const message = `Your Kilo Super App verification code is: ${otp}. Valid for 10 minutes.`

    // Route to appropriate SMS provider
    switch (smsProvider) {
      case 'twilio':
        return await sendViaTwilio(phone, message)
      case 'nexmo':
        return await sendViaNexmo(phone, message)
      case 'africas_talking':
        return await sendViaAfricasTalking(phone, message)
      default:
        return await sendViaTwilio(phone, message)
    }
  } catch (error) {
    console.error("SMS sending failed:", error)
    return false
  }
}

/**
 * Generate OTP code
 */
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
