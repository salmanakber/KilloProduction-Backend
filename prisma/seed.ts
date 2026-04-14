import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"


const prisma = new PrismaClient()

async function main() {

  try {
    console.log('🌱 Seeding payment gateway settings...')

    // Payment gateway settings configuration
    const paymentMethodsConfig = {
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || '',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
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
    const settings = await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: {
        paymentMethods: paymentMethodsConfig,
        // You can add other settings fields here
        // For example, if you have other JSON fields in your Settings model:
        // paymentSettings: additionalSettings, 
      },
      create: {
        id: 1,
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
    console.error('❌ Error during seeding:', error)
    throw error
  }
}

  // console.log("🌱 Starting database seeding...")

  // // Create admin user
  // const adminUser = await prisma.user.create({
  //   data: {
  //     phone: "+1234567890",
  //     email: "admin@kilosuperapp.com",
  //     name: "Super Admin",
  //     role: "SUPER_ADMIN",
  //     password: bcrypt.hashSync("admin123", 10),
  //     isVerified: true,
  //     userProfile: {
  //       create: {
  //         firstName: "Super",
  //         lastName: "Admin",
  //       },
  //     },
  //     userSettings: {
  //       create: {},
  //     },
  //     wallet: {
  //       create: {
  //         balance: 1000.0,
  //       },
  //     },
  //   },
  // })

  // // Create sample customers
  // const customers = await Promise.all([
  //   prisma.user.create({
  //     data: {
  //       phone: "+1234567891",
  //       email: "john.customer@example.com",
  //       name: "John Customer",
  //       role: "CUSTOMER",
  //       password: bcrypt.hashSync("customer123", 10),
  //       isVerified: true,
  //       userProfile: {
  //         create: {
  //           firstName: "John",
  //           lastName: "Customer",
  //           gender: "MALE",
  //         },
  //       },
  //       userSettings: {
  //         create: {},
  //       },
  //       wallet: {
  //         create: {
  //           balance: 500.0,
  //         },
  //       },
  //       addresses: {
  //         create: [
  //           {
  //             type: "HOME",
  //             title: "Home",
  //             street: "123 Main Street",
  //             city: "New York",
  //             state: "NY",
  //             country: "USA",
  //             postalCode: "10001",
  //             latitude: 40.7128,
  //             longitude: -74.006,
  //             isDefault: true,
  //           },
  //           {
  //             type: "WORK",
  //             title: "Office",
  //             street: "456 Business Ave",
  //             city: "New York",
  //             state: "NY",
  //             country: "USA",
  //             postalCode: "10002",
  //             latitude: 40.7589,
  //             longitude: -73.9851,
  //           },
  //         ],
  //       },
  //     },
  //   }),
  //   prisma.user.create({
  //     data: {
  //       phone: "+1234567892",
  //       email: "jane.customer@example.com",
  //       name: "Jane Customer",
  //       role: "CUSTOMER",
  //       password: bcrypt.hashSync("customer123", 10),
  //       isVerified: true,
  //       userProfile: {
  //         create: {
  //           firstName: "Jane",
  //           lastName: "Customer",
  //           gender: "FEMALE",
  //         },
  //       },
  //       userSettings: {
  //         create: {},
  //       },
  //       wallet: {
  //         create: {
  //           balance: 750.0,
  //         },
  //       },
  //     },
  //   }),
  // ])

  // // Create auto parts vendor
  // const autoPartsVendor = await prisma.user.create({
  //   data: {
  //     phone: "+1234567893",
  //     email: "autoparts@example.com",
  //     name: "Auto Parts Store Owner",
  //     role: "VENDOR",
  //     password: bcrypt.hashSync("vendor123", 10),
  //     isVerified: true,
  //     userProfile: {
  //       create: {
  //         firstName: "Mike",
  //         lastName: "AutoParts",
  //       },
  //     },
  //     userSettings: {
  //       create: {},
  //     },
  //     autoPartsStore: {
  //       create: {
  //         storeName: "Premium Auto Parts",
  //         description: "Quality auto parts for all vehicle makes and models",
  //         address: "789 Auto Street, Detroit, MI 48201",
  //         phone: "+1234567893",
  //         email: "info@premiumautoparts.com",
  //         rating: 4.5,
  //         totalReviews: 150,
  //         totalOrders: 500,
  //         isVerified: true,
  //         deliveryZones: ["Detroit", "Dearborn", "Warren"],
  //         openingHours: {
  //           monday: { open: "08:00", close: "18:00" },
  //           tuesday: { open: "08:00", close: "18:00" },
  //           wednesday: { open: "08:00", close: "18:00" },
  //           thursday: { open: "08:00", close: "18:00" },
  //           friday: { open: "08:00", close: "18:00" },
  //           saturday: { open: "09:00", close: "17:00" },
  //           sunday: { open: "10:00", close: "16:00" },
  //         },
  //       },
  //     },
  //   },
  // })

  // // Create pharmacy vendor
  // const pharmacyVendor = await prisma.user.create({
  //   data: {
  //     phone: "+1234567894",
  //     email: "pharmacy@example.com",
  //     name: "Pharmacy Owner",
  //     role: "VENDOR",
  //     password: bcrypt.hashSync("vendor123", 10),
  //     isVerified: true,
  //     userProfile: {
  //       create: {
  //         firstName: "Sarah",
  //         lastName: "PharmD",
  //       },
  //     },
  //     userSettings: {
  //       create: {},
  //     },
  //     pharmacy: {
  //       create: {
  //         pharmacyName: "HealthCare Pharmacy",
  //         licenseNumber: "PH123456789",
  //         description: "Your trusted neighborhood pharmacy",
  //         address: "321 Health Ave, Boston, MA 02101",
  //         phone: "+1234567894",
  //         email: "info@healthcarepharmacy.com",
  //         rating: 4.8,
  //         totalReviews: 200,
  //         totalOrders: 800,
  //         isVerified: true,
  //         is24Hours: false,
  //         deliveryAvailable: true,
  //         deliveryZones: ["Boston", "Cambridge", "Somerville"],
  //         specialties: ["General", "Pediatric", "Geriatric"],
  //         openingHours: {
  //           monday: { open: "07:00", close: "22:00" },
  //           tuesday: { open: "07:00", close: "22:00" },
  //           wednesday: { open: "07:00", close: "22:00" },
  //           thursday: { open: "07:00", close: "22:00" },
  //           friday: { open: "07:00", close: "22:00" },
  //           saturday: { open: "08:00", close: "20:00" },
  //           sunday: { open: "09:00", close: "18:00" },
  //         },
  //       },
  //     },
  //   },
  // })

  // // Create restaurant vendor
  // const restaurantVendor = await prisma.user.create({
  //   data: {
  //     phone: "+1234567895",
  //     email: "restaurant@example.com",
  //     name: "Restaurant Owner",
  //     role: "VENDOR",
  //     password: bcrypt.hashSync("vendor123", 10),
  //     isVerified: true,
  //     userProfile: {
  //       create: {
  //         firstName: "Tony",
  //         lastName: "Chef",
  //       },
  //     },
  //     userSettings: {
  //       create: {},
  //     },
  //     restaurant: {
  //       create: {
  //         name: "Delicious Bites Restaurant",
  //         description: "Authentic Italian cuisine with fresh ingredients",
  //         cuisine: ["Italian", "Mediterranean"],
  //         address: "555 Food Street, Chicago, IL 60601",
  //         phone: "+1234567895",
  //         email: "orders@deliciousbites.com",
  //         rating: 4.3,
  //         totalReviews: 300,
  //         totalOrders: 1200,
  //         priceRange: "MODERATE",
  //         deliveryTime: "30-45 mins",
  //         deliveryFee: 3.99,
  //         minOrderAmount: 15.0,
  //         maxDeliveryDistance: 8.0,
  //         isVerified: true,
  //         deliveryZones: ["Downtown Chicago", "Loop", "River North"],
  //         specialDiets: ["Vegetarian", "Gluten-Free"],
  //         openingHours: {
  //           monday: { open: "11:00", close: "22:00" },
  //           tuesday: { open: "11:00", close: "22:00" },
  //           wednesday: { open: "11:00", close: "22:00" },
  //           thursday: { open: "11:00", close: "23:00" },
  //           friday: { open: "11:00", close: "23:00" },
  //           saturday: { open: "12:00", close: "23:00" },
  //           sunday: { open: "12:00", close: "21:00" },
  //         },
  //       },
  //     },
  //   },
  // })

  // // Create riders
  // const riders = await Promise.all([
  //   prisma.user.create({
  //     data: {
  //       phone: "+1234567896",
  //       email: "rider1@example.com",
  //       name: "Alex Rider",
  //       role: "RIDER",
  //       password: bcrypt.hashSync("rider123", 10),
  //       isVerified: true,
  //       userProfile: {
  //         create: {
  //           firstName: "Alex",
  //           lastName: "Rider",
  //           gender: "MALE",
  //         },
  //       },
  //       userSettings: {
  //         create: {},
  //       },
  //       riderProfile: {
  //         create: {
  //           vehicleType: "MOTORCYCLE",
  //           vehicleBrand: "Honda",
  //           vehicleModel: "CBR150R",
  //           vehicleYear: "2022",
  //           vehicleColor: "Red",
  //           licensePlate: "ABC123",
  //           licenseNumber: "DL123456789",
  //           licenseExpiry: new Date("2025-12-31"),
  //           modules: ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY"],
  //           isAvailable: true,
  //           rating: 4.7,
  //           totalDeliveries: 250,
  //           totalEarnings: 2500.0,
  //           isVerified: true,
  //           deliveryZones: ["Downtown", "Midtown", "Uptown"],
  //           workingHours: {
  //             monday: { start: "09:00", end: "18:00" },
  //             tuesday: { start: "09:00", end: "18:00" },
  //             wednesday: { start: "09:00", end: "18:00" },
  //             thursday: { start: "09:00", end: "18:00" },
  //             friday: { start: "09:00", end: "20:00" },
  //             saturday: { start: "10:00", end: "20:00" },
  //             sunday: { start: "12:00", end: "18:00" },
  //           },
  //         },
  //       },
  //     },
  //   }),
  // ])

  // // Create promo codes
  // const promoCodes = await Promise.all([
  //   prisma.promoCode.create({
  //     data: {
  //       code: "WELCOME10",
  //       title: "Welcome Discount",
  //       description: "10% off your first order",
  //       type: "PERCENTAGE",
  //       value: 10,
  //       minOrderAmount: 25.0,
  //       maxDiscount: 10.0,
  //       usageLimit: 1000,
  //       modules: ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY"],
  //       startsAt: new Date(),
  //       expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  //     },
  //   }),
  //   prisma.promoCode.create({
  //     data: {
  //       code: "FREEDEL",
  //       title: "Free Delivery",
  //       description: "Free delivery on orders over $30",
  //       type: "FREE_DELIVERY",
  //       value: 0,
  //       minOrderAmount: 30.0,
  //       usageLimit: 500,
  //       modules: ["FOOD", "GROCERY"],
  //       startsAt: new Date(),
  //       expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
  //     },
  //   }),
  // ])

  // // Create ride types
  // const rideTypes = await Promise.all([
  //   prisma.rideType.create({
  //     data: {
  //       name: "Economy",
  //       description: "Affordable rides for everyday travel",
  //       icon: "🚗",
  //       basePrice: 500.0,
  //       pricePerKm: 100.0,
  //       pricePerMinute: 5.0,
  //       capacity: "1-4 passengers",
  //       features: ["AC", "Music", "Clean"],
  //       vehicleType: "CAR",
  //       isActive: true,
  //     },
  //   }),
  //   prisma.rideType.create({
  //     data: {
  //       name: "Premium",
  //       description: "Luxury rides with premium vehicles",
  //       icon: "🚙",
  //       basePrice: 800.0,
  //       pricePerKm: 150.0,
  //       pricePerMinute: 8.0,
  //       capacity: "1-4 passengers",
  //       features: ["AC", "Music", "Premium Interior", "Professional Driver"],
  //       vehicleType: "CAR",
  //       isActive: true,
  //     },
  //   }),
  //   prisma.rideType.create({
  //     data: {
  //       name: "Motorcycle",
  //       description: "Fast and efficient motorcycle rides",
  //       icon: "🏍️",
  //       basePrice: 300.0,
  //       pricePerKm: 80.0,
  //       pricePerMinute: 3.0,
  //       capacity: "1-2 passengers",
  //       features: ["Helmet Provided", "Fast Delivery"],
  //       vehicleType: "MOTORCYCLE",
  //       isActive: true,
  //     },
  //   }),
  //   prisma.rideType.create({
  //     data: {
  //       name: "Van",
  //       description: "Spacious van rides for groups and luggage",
  //       icon: "🚐",
  //       basePrice: 700.0,
  //       pricePerKm: 120.0,
  //       pricePerMinute: 6.0,
  //       capacity: "1-8 passengers",
  //       features: ["AC", "Luggage Space", "Group Friendly"],
  //       vehicleType: "VAN",
  //       isActive: true,
  //     },
  //   }),
  //   prisma.rideType.create({
  //     data: {
  //       name: "Delivery",
  //       description: "Specialized delivery service",
  //       icon: "📦",
  //       basePrice: 400.0,
  //       pricePerKm: 90.0,
  //       pricePerMinute: 4.0,
  //       capacity: "Cargo only",
  //       features: ["Secure Cargo", "Tracking", "Insurance"],
  //       vehicleType: "TRUCK",
  //       isActive: true,
  //     },
  //   }),
  // ])

  // console.log("✅ Database seeding completed successfully!")
  // console.log(`Created:`)
  // console.log(`- 1 Admin user`)
  // console.log(`- 2 Customer users`)
  // console.log(`- 3 Vendor users (Auto Parts, Pharmacy, Restaurant)`)
  // console.log(`- 1 Rider user`)
  // console.log(`- 2 Promo codes`)
  // console.log(`- ${rideTypes.length} Ride types`)


main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
