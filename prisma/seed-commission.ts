import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding commission settings...')

  // Clear existing commission settings
  await prisma.commissionSetting.deleteMany({
    where: {
      commissionType: 'RIDER_COMMISSION'
    }
  })

  // Create rider fare settings for different modules
  const riderFareSettings = [
    {
      module: 'PHARMACY',
      commissionType: 'RIDER_COMMISSION',
      rate: 100, // 100 NGN per km
      minAmount: 50, // Minimum 50 NGN
      maxAmount: 2000, // Maximum 2000 NGN
      description: 'Rider fare for pharmacy medicine deliveries',
      isActive: true
    },
    {
      module: 'FOOD',
      commissionType: 'RIDER_COMMISSION',
      rate: 80, // 80 NGN per km
      minAmount: 40, // Minimum 40 NGN
      maxAmount: 1500, // Maximum 1500 NGN
      description: 'Rider fare for restaurant food deliveries',
      isActive: true
    },
    {
      module: 'GROCERY',
      commissionType: 'RIDER_COMMISSION',
      rate: 90, // 90 NGN per km
      minAmount: 45, // Minimum 45 NGN
      maxAmount: 1800, // Maximum 1800 NGN
      description: 'Rider fare for grocery deliveries',
      isActive: true
    },
    {
      module: 'AUTO_PARTS',
      commissionType: 'RIDER_COMMISSION',
      rate: 120, // 120 NGN per km
      minAmount: 60, // Minimum 60 NGN
      maxAmount: 2500, // Maximum 2500 NGN
      description: 'Rider fare for auto parts deliveries',
      isActive: true
    }
  ]

  for (const setting of riderFareSettings) {
    await prisma.commissionSetting.create({
      data: setting
    })
  }

  // Create platform commission settings
  const platformCommissionSettings = [
    {
      module: 'PHARMACY',
      commissionType: 'PLATFORM_FEE',
      rate: 5, // 5% platform fee
      minAmount: 10, // Minimum 10 NGN
      maxAmount: 500, // Maximum 500 NGN
      description: 'Platform commission for pharmacy orders',
      isActive: true
    },
    {
      module: 'FOOD',
      commissionType: 'PLATFORM_FEE',
      rate: 8, // 8% platform fee
      minAmount: 15, // Minimum 15 NGN
      maxAmount: 800, // Maximum 800 NGN
      description: 'Platform commission for restaurant orders',
      isActive: true
    },
    {
      module: 'GROCERY',
      commissionType: 'PLATFORM_FEE',
      rate: 6, // 6% platform fee
      minAmount: 12, // Minimum 12 NGN
      maxAmount: 600, // Maximum 600 NGN
      description: 'Platform commission for grocery orders',
      isActive: true
    },
    {
      module: 'AUTO_PARTS',
      commissionType: 'PLATFORM_FEE',
      rate: 7, // 7% platform fee
      minAmount: 20, // Minimum 20 NGN
      maxAmount: 1000, // Maximum 1000 NGN
      description: 'Platform commission for auto parts orders',
      isActive: true
    }
  ]

  for (const setting of platformCommissionSettings) {
    await prisma.commissionSetting.create({
      data: setting
    })
  }

  // Create wholesaler commission settings
  const wholesalerCommissionSettings = [
    {
      module: 'PHARMACY',
      commissionType: 'VENDOR_COMMISSION',
      rate: 3, // 3% wholesaler commission
      minAmount: 5, // Minimum 5 NGN
      maxAmount: 300, // Maximum 300 NGN
      description: 'Wholesaler commission for pharmacy orders',
      isActive: true
    }
  ]

  for (const setting of wholesalerCommissionSettings) {
    await prisma.commissionSetting.create({
      data: setting
    })
  }

  console.log('✅ Commission settings seeded successfully!')
  console.log('📊 Created:')
  console.log('  - 4 Rider Fare settings')
  console.log('  - 4 Platform Commission settings')
  console.log('  - 1 Wholesaler Commission setting')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding commission settings:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
