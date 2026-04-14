import { prisma } from './prisma'

/**
 * Replace variables in template with actual values
 * @param template - Template string with {{variable}} placeholders
 * @param data - Object with variable values
 */
export function replaceVariables(template: string, data: Record<string, any>): string {
  let result = template
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`{{${key}}}`, 'g')
    result = result.replace(regex, String(value || ''))
  }
  return result
}

/**
 * Get email template by name
 */
export async function getEmailTemplate(name: string) {
  return await prisma.emailTemplate.findFirst({
    where: {
      name,
      isActive: true
    }
  })
}

/**
 * Get SMS template by name
 */
export async function getSmsTemplate(name: string) {
  return await prisma.smsTemplate.findFirst({
    where: {
      name,
      isActive: true
    }
  })
}

/**
 * Render email template with data
 */
export async function renderEmailTemplate(
  templateName: string,
  data: Record<string, any>
) {
  const template = await getEmailTemplate(templateName)
  
  if (!template) {
    throw new Error(`Email template '${templateName}' not found`)
  }

  return {
    subject: replaceVariables(template.subject, data),
    html: replaceVariables(template.htmlContent, data),
    text: template.textContent ? replaceVariables(template.textContent, data) : undefined,
  }
}

/**
 * Render SMS template with data
 */
export async function renderSmsTemplate(
  templateName: string,
  data: Record<string, any>
) {
  const template = await getSmsTemplate(templateName)
  
  if (!template) {
    throw new Error(`SMS template '${templateName}' not found`)
  }

  const content = replaceVariables(template.content, data)
  
  // Check length
  if (content.length > template.maxLength) {
    console.warn(`SMS content exceeds max length: ${content.length} > ${template.maxLength}`)
  }

  return content
}

/**
 * List all available template variables for a template
 */
export async function getTemplateVariables(templateName: string, type: 'email' | 'sms') {
  if (type === 'email') {
    const template = await getEmailTemplate(templateName)
    return template?.variables as string[] || []
  } else {
    const template = await getSmsTemplate(templateName)
    return template?.variables as string[] || []
  }
}

