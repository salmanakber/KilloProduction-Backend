const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const defaultCurrencies = [
  {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    isDefault: true,
    isActive: true,
    exchangeRate: 1.0,
    decimalPlaces: 2
  },
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    isDefault: false,
    isActive: true,
    exchangeRate: 0.0012, // Approximate rate to NGN
    decimalPlaces: 2
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    isDefault: false,
    isActive: true,
    exchangeRate: 0.0011, // Approximate rate to NGN
    decimalPlaces: 2
  },
  {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    isDefault: false,
    isActive: true,
    exchangeRate: 0.00095, // Approximate rate to NGN
    decimalPlaces: 2
  },
  {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'C$',
    isDefault: false,
    isActive: true,
    exchangeRate: 0.0016, // Approximate rate to NGN
    decimalPlaces: 2
  },
  {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    isDefault: false,
    isActive: true,
    exchangeRate: 0.0018, // Approximate rate to NGN
    decimalPlaces: 2
  }
]

async function seedCurrencies() {
  try {
    console.log('🌱 Starting currency seeding...')

    // Check if currencies already exist
    const existingCurrencies = await prisma.currency.findMany()
    
    if (existingCurrencies.length > 0) {
      console.log('✅ Currencies already exist, skipping seed...')
      console.log(`Found ${existingCurrencies.length} currencies`)
      return
    }

    // Create default currencies
    const createdCurrencies = await Promise.all(
      defaultCurrencies.map(async (currency) => {
        const created = await prisma.currency.create({ data: currency })
        console.log(`✅ Created currency: ${created.code} - ${created.name}`)
        return created
      })
    )

    console.log(`🎉 Successfully seeded ${createdCurrencies.length} currencies!`)
    
    // Display summary
    const defaultCurrency = createdCurrencies.find(c => c.isDefault)
    if (defaultCurrency) {
      console.log(`🏆 Default currency set to: ${defaultCurrency.code} (${defaultCurrency.name})`)
    }

  } catch (error) {
    console.error('❌ Error seeding currencies:', error)
    throw error
  } finally {
    await prisma.$disconnect()
  }
}

// Run the seed function
if (require.main === module) {
  seedCurrencies()
    .then(() => {
      console.log('✅ Currency seeding completed successfully!')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Currency seeding failed:', error)
      process.exit(1)
    })
}

module.exports = { seedCurrencies }
