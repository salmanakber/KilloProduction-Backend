import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedPaymentSettings() {
  try {
    console.log('🌱 Seeding payment gateway settings...')

    // Payment gateway settings configuration
    const paymentMethodsConfig = {
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
        merchantDisplayName: process.env.STRIPE_MERCHANT_DISPLAY_NAME || 'SuperKillo',
        isEnabled: !!process.env.STRIPE_SECRET_KEY,
        description: 'Stripe - Global payment processor'
      },
      paystack: {
        secretKey: process.env.PAYSTACK_SECRET_KEY || '',
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
        isEnabled: !!process.env.PAYSTACK_SECRET_KEY,
        description: 'Paystack - African payment processor'
      },
      firstmonie: {
        secretKey: process.env.FIRSTMONIE_SECRET_KEY || '',
        publicKey: process.env.FIRSTMONIE_PUBLIC_KEY || '',
        isEnabled: !!process.env.FIRSTMONIE_SECRET_KEY,
        description: 'Firstmonie - Nigerian payment processor'
      }
    }

    // Additional payment settings
    const additionalSettings = {
      defaultCurrency: 'NGN',
      supportedCurrencies: ['NGN', 'USD', 'EUR', 'GBP', 'GHS', 'ZAR', 'KES'],
      paymentTimeout: 900, // 15 minutes in seconds
      retryAttempts: 3,
      webhookRetryDelay: 5000, // 5 seconds
      minimumPaymentAmount: 100, // Minimum amount in smallest currency unit
      maximumPaymentAmount: 1000000, // Maximum amount in smallest currency unit
      allowedPaymentMethods: ['card', 'bank_transfer', 'wallet'],
      autoCapture: true,
      requireConfirmation: false,
      enableRecurringPayments: true,
      enablePartialRefunds: true,
      enableFullRefunds: true,
      refundTimeLimit: 30, // days
      chargebackProtection: true,
      fraudDetection: true,
      kycRequired: false,
      kycAmountThreshold: 50000, // Amount above which KYC is required
      taxIncluded: false,
      taxRate: 0, // Percentage
      processingFees: {
        stripe: { percentage: 2.9, fixed: 30 }, // 2.9% + 30¢
        paystack: { percentage: 1.5, fixed: 100 }, // 1.5% + ₦100
        firstmonie: { percentage: 1.0, fixed: 50 } // 1.0% + ₦50
      },
      settlementSchedule: {
        stripe: 'daily',
        paystack: 'daily',
        firstmonie: 'daily'
      },
      supportedCountries: ['NG', 'GH', 'ZA', 'KE', 'US', 'GB', 'CA', 'AU'],
      supportedCurrenciesByGateway: {
        stripe: ['USD', 'EUR', 'GBP', 'NGN', 'GHS', 'ZAR', 'CAD', 'AUD'],
        paystack: ['NGN', 'GHS', 'ZAR', 'USD', 'KES'],
        firstmonie: ['NGN']
      }
    }

    // Create or update settings
    const settings = await (prisma as any).settings.upsert({
      where: { id: 'default' },
      update: {
        paymentMethods: paymentMethodsConfig,
        // You can add other settings fields here
        // For example, if you have other JSON fields in your Settings model:
        // paymentSettings: additionalSettings,
      },
      create: {
        id: 'default',
        paymentMethods: paymentMethodsConfig,
        // Add other default settings here
        // paymentSettings: additionalSettings,
      }
    })

    console.log('✅ Payment gateway settings seeded successfully!')
    console.log('📊 Settings ID:', settings.id)
    console.log('🔧 Payment Methods Configured:', Object.keys(paymentMethodsConfig))
    
    // Log which gateways are enabled
    const enabledGateways = Object.entries(paymentMethodsConfig)
      .filter(([_, config]: [string, any]) => config.isEnabled)
      .map(([key, _]) => key)
    
    console.log('🚀 Enabled Gateways:', enabledGateways)
    
    if (enabledGateways.length === 0) {
      console.log('⚠️  Warning: No payment gateways are enabled!')
      console.log('💡 Make sure to set the following environment variables:')
      console.log('   - STRIPE_SECRET_KEY & STRIPE_PUBLISHABLE_KEY')
      console.log('   - PAYSTACK_SECRET_KEY & PAYSTACK_PUBLIC_KEY')
      console.log('   - FIRSTMONIE_SECRET_KEY & FIRSTMONIE_PUBLIC_KEY')
    }

    return settings
  } catch (error) {
    console.error('❌ Error seeding payment settings:', error)
    throw error
  }
}

async function seedCurrencies() {
  try {
    console.log('🌱 Seeding currencies...')

    const currencies = [
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
        exchangeRate: 750.0, // Example rate: 1 USD = 750 NGN
        decimalPlaces: 2
      },
      {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        isDefault: false,
        isActive: true,
        exchangeRate: 820.0, // Example rate: 1 EUR = 820 NGN
        decimalPlaces: 2
      },
      {
        code: 'GBP',
        name: 'British Pound',
        symbol: '£',
        isDefault: false,
        isActive: true,
        exchangeRate: 950.0, // Example rate: 1 GBP = 950 NGN
        decimalPlaces: 2
      },
      {
        code: 'GHS',
        name: 'Ghanaian Cedi',
        symbol: '₵',
        isDefault: false,
        isActive: true,
        exchangeRate: 65.0, // Example rate: 1 GHS = 65 NGN
        decimalPlaces: 2
      },
      {
        code: 'ZAR',
        name: 'South African Rand',
        symbol: 'R',
        isDefault: false,
        isActive: true,
        exchangeRate: 40.0, // Example rate: 1 ZAR = 40 NGN
        decimalPlaces: 2
      },
      {
        code: 'KES',
        name: 'Kenyan Shilling',
        symbol: 'KSh',
        isDefault: false,
        isActive: true,
        exchangeRate: 5.0, // Example rate: 1 KES = 5 NGN
        decimalPlaces: 2
      }
    ]

    for (const currency of currencies) {
      await prisma.currency.upsert({
        where: { code: currency.code },
        update: currency,
        create: currency
      })
    }

    console.log('✅ Currencies seeded successfully!')
    console.log('💱 Currencies configured:', currencies.length)
    
  } catch (error) {
    console.error('❌ Error seeding currencies:', error)
    throw error
  }
}

async function seedDefaultAdmin() {
  try {
    console.log('🌱 Seeding default admin user...')

    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' }
    })

    if (existingAdmin) {
      console.log('👤 Admin user already exists:', existingAdmin.email)
      return existingAdmin
    }

    // Create default admin user
    const admin = await prisma.user.create({
      data: {
        email: 'admin@superkillo.com',
        name: 'SuperKillo Admin',
        role: 'ADMIN',
        isVerified: true,
        isActive: true,
        password: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password: "password"
        status: 'ACTIVE'
      }
    })

    console.log('✅ Default admin user created!')
    console.log('👤 Admin Email:', admin.email)
    console.log('🔑 Default Password: password')
    console.log('⚠️  Please change the default password immediately!')

    return admin
  } catch (error) {
    console.error('❌ Error seeding admin user:', error)
    throw error
  }
}

async function main() {
  try {
    console.log('🚀 Starting SuperKillo payment system seeding...')
    
    // Seed currencies first
    await seedCurrencies()
    
    // Seed payment settings
    await seedPaymentSettings()
    
    // Seed default admin
    await seedDefaultAdmin()
    
    console.log('🎉 All seeding completed successfully!')
    console.log('')
    console.log('📋 Next steps:')
    console.log('1. Set your payment gateway API keys in environment variables')
    console.log('2. Update the payment settings via admin API if needed')
    console.log('3. Test payment flows with your configured gateways')
    console.log('4. Change the default admin password')
    
  } catch (error) {
    console.error('💥 Seeding failed:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the seeding
if (require.main === module) {
  main()
}

export { seedPaymentSettings, seedCurrencies, seedDefaultAdmin }
