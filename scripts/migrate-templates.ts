import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Map old string categories to new enum values
const emailCategoryMap: Record<string, string> = {
  'verification': 'VERIFICATION',
  'notification': 'NOTIFICATION',
  'marketing': 'MARKETING',
  'transactional': 'TRANSACTIONAL',
  'support': 'SUPPORT',
  'welcome': 'WELCOME',
  'order_confirmation': 'ORDER_CONFIRMATION',
}

const smsCategoryMap: Record<string, string> = {
  'otp': 'OTP',
  'notification': 'NOTIFICATION',
  'alert': 'ALERT',
  'reminder': 'REMINDER',
}

async function main() {
  console.log('Starting template migration...')
  
  try {
    // Fetch existing templates before schema change
    const existingEmailTemplates = await prisma.$queryRaw`
      SELECT * FROM email_templates
    `
    
    const existingSmsTemplates = await prisma.$queryRaw`
      SELECT * FROM sms_templates
    `

    console.log(`Found ${(existingEmailTemplates as any[]).length} email templates`)
    console.log(`Found ${(existingSmsTemplates as any[]).length} SMS templates`)

    // Drop and recreate tables with new schema
    await prisma.$executeRaw`DROP TABLE IF EXISTS email_templates CASCADE`
    await prisma.$executeRaw`DROP TABLE IF EXISTS sms_templates CASCADE`

    console.log('Tables dropped. Running schema push...')
    
    // Note: You need to run `npx prisma db push` after this script
    console.log('\n⚠️  Please run: npx prisma db push')
    console.log('Then run: npx tsx scripts/reseed-templates.ts\n')

  } catch (error) {
    console.error('Migration failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()

