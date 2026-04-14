const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function migratePharmacySpecializations() {
  try {
    console.log('Starting pharmacy specializations migration...')

    // First, let's create some default medicine origins if they don't exist
    const defaultOrigins = [
      { name: 'NIGERIAN', displayName: 'Nigerian' },
      { name: 'INDIAN', displayName: 'Indian' },
      { name: 'CHINESE', displayName: 'Chinese' },
      { name: 'AMERICAN', displayName: 'American' },
      { name: 'EUROPEAN', displayName: 'European' },
      { name: 'GENERIC', displayName: 'Generic' }
    ]

    for (const origin of defaultOrigins) {
      await prisma.medicineOrigin.upsert({
        where: { name: origin.name },
        update: {},
        create: origin
      })
    }

    console.log('Default medicine origins created/updated')
    console.log('Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

migratePharmacySpecializations()
  .then(() => {
    console.log('Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Migration script failed:', error)
    process.exit(1)
  })
