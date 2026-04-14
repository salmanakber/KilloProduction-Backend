import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting MASTER database seeding...")

  // ========================================
  // 1. SEED CURRENCIES
  // ========================================
  console.log("\n💰 Seeding currencies...")
  
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
      exchangeRate: 0.0012,
      decimalPlaces: 2
    },
    {
      code: 'EUR',
      name: 'Euro',
      symbol: '€',
      isDefault: false,
      isActive: true,
      exchangeRate: 0.0011,
      decimalPlaces: 2
    },
    {
      code: 'GBP',
      name: 'British Pound',
      symbol: '£',
      isDefault: false,
      isActive: true,
      exchangeRate: 0.00095,
      decimalPlaces: 2
    },
    {
      code: 'CAD',
      name: 'Canadian Dollar',
      symbol: 'C$',
      isDefault: false,
      isActive: true,
      exchangeRate: 0.0016,
      decimalPlaces: 2
    },
    {
      code: 'AUD',
      name: 'Australian Dollar',
      symbol: 'A$',
      isDefault: false,
      isActive: true,
      exchangeRate: 0.0018,
      decimalPlaces: 2
    }
  ]

  for (const currency of defaultCurrencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: currency,
      create: currency
    })
  }
  console.log("✅ Currencies seeded successfully!")

  // ========================================
  // 2. SEED USERS (ADMIN, CUSTOMERS, VENDORS, RIDERS)
  // ========================================
  console.log("\n👥 Seeding users...")

  // Create admin user
  const adminUser = await prisma.user.upsert({
    where: { phone: "+1234567890" },
    update: {},
    create: {
      phone: "+1234567890",
      email: "admin@kilosuperapp.com",
      name: "Super Admin",
      role: "SUPER_ADMIN",
      password: bcrypt.hashSync("admin123", 10),
      isVerified: true,
      userProfile: {
        create: {
          firstName: "Super",
          lastName: "Admin",
        },
      },
      userSettings: {
        create: {},
      },
      wallet: {
        create: {
          balance: 1000.0,
        },
      },
    },
  })

  // Create sample customers
  const customers = await Promise.all([
    prisma.user.upsert({
      where: { phone: "+1234567891" },
      update: {},
      create: {
        phone: "+1234567891",
        email: "john.customer@example.com",
        name: "John Customer",
        role: "CUSTOMER",
        password: bcrypt.hashSync("customer123", 10),
        isVerified: true,
        userProfile: {
          create: {
            firstName: "John",
            lastName: "Customer",
            gender: "MALE",
          },
        },
        userSettings: {
          create: {},
        },
        wallet: {
          create: {
            balance: 500.0,
          },
        },
        addresses: {
          create: [
            {
              type: "HOME",
              title: "Home",
              street: "123 Main Street",
              city: "New York",
              state: "NY",
              country: "USA",
              postalCode: "10001",
              latitude: 40.7128,
              longitude: -74.006,
              isDefault: true,
            },
            {
              type: "WORK",
              title: "Office",
              street: "456 Business Ave",
              city: "New York",
              state: "NY",
              country: "USA",
              postalCode: "10002",
              latitude: 40.7589,
              longitude: -73.9851,
            },
          ],
        },
      },
    }),
    prisma.user.upsert({
      where: { phone: "+1234567892" },
      update: {},
      create: {
        phone: "+1234567892",
        email: "jane.customer@example.com",
        name: "Jane Customer",
        role: "CUSTOMER",
        password: bcrypt.hashSync("customer123", 10),
        isVerified: true,
        userProfile: {
          create: {
            firstName: "Jane",
            lastName: "Customer",
            gender: "FEMALE",
          },
        },
        userSettings: {
          create: {},
        },
        wallet: {
          create: {
            balance: 750.0,
          },
        },
      },
    }),
  ])

  // Create auto parts vendor
  const autoPartsVendor = await prisma.user.upsert({
    where: { phone: "+1234567893" },
    update: {},
    create: {
      phone: "+1234567893",
      email: "autoparts@example.com",
      name: "Auto Parts Store Owner",
      role: "VENDOR",
      password: bcrypt.hashSync("vendor123", 10),
      isVerified: true,
      userProfile: {
        create: {
          firstName: "Mike",
          lastName: "AutoParts",
        },
      },
      userSettings: {
        create: {},
      },
      autoPartsStore: {
        create: {
          storeName: "Premium Auto Parts",
          description: "Quality auto parts for all vehicle makes and models",
          address: "789 Auto Street, Detroit, MI 48201",
          phone: "+1234567893",
          email: "info@premiumautoparts.com",
          rating: 4.5,
          totalReviews: 150,
          totalOrders: 500,
          isVerified: true,
          deliveryZones: ["Detroit", "Dearborn", "Warren"],
          openingHours: {
            monday: { open: "08:00", close: "18:00" },
            tuesday: { open: "08:00", close: "18:00" },
            wednesday: { open: "08:00", close: "18:00" },
            thursday: { open: "08:00", close: "18:00" },
            friday: { open: "08:00", close: "18:00" },
            saturday: { open: "09:00", close: "17:00" },
            sunday: { open: "10:00", close: "16:00" },
          },
        },
      },
    },
  })

  // Create pharmacy vendor
  const pharmacyVendor = await prisma.user.upsert({
    where: { phone: "+1234567894" },
    update: {},
    create: {
      phone: "+1234567894",
      email: "pharmacy@example.com",
      name: "Pharmacy Owner",
      role: "VENDOR",
      password: bcrypt.hashSync("vendor123", 10),
      isVerified: true,
      userProfile: {
        create: {
          firstName: "Sarah",
          lastName: "PharmD",
        },
      },
      userSettings: {
        create: {},
      },
      pharmacy: {
        create: {
          pharmacyName: "HealthCare Pharmacy",
          licenseNumber: "PH123456789",
          description: "Your trusted neighborhood pharmacy",
          address: "321 Health Ave, Boston, MA 02101",
          phone: "+1234567894",
          email: "info@healthcarepharmacy.com",
          rating: 4.8,
          totalReviews: 200,
          totalOrders: 800,
          isVerified: true,
          is24Hours: false,
          deliveryAvailable: true,
          deliveryZones: ["Boston", "Cambridge", "Somerville"],
          specialties: ["General", "Pediatric", "Geriatric"],
          openingHours: {
            monday: { open: "07:00", close: "22:00" },
            tuesday: { open: "07:00", close: "22:00" },
            wednesday: { open: "07:00", close: "22:00" },
            thursday: { open: "07:00", close: "22:00" },
            friday: { open: "07:00", close: "22:00" },
            saturday: { open: "08:00", close: "20:00" },
            sunday: { open: "09:00", close: "18:00" },
          },
        },
      },
    },
  })

  // Create restaurant vendor
  const restaurantVendor = await prisma.user.upsert({
    where: { phone: "+1234567895" },
    update: {},
    create: {
      phone: "+1234567895",
      email: "restaurant@example.com",
      name: "Restaurant Owner",
      role: "VENDOR",
      password: bcrypt.hashSync("vendor123", 10),
      isVerified: true,
      userProfile: {
        create: {
          firstName: "Tony",
          lastName: "Chef",
        },
      },
      userSettings: {
        create: {},
      },
      restaurant: {
        create: {
          name: "Delicious Bites Restaurant",
          description: "Authentic Italian cuisine with fresh ingredients",
          cuisine: ["Italian", "Mediterranean"],
          address: "555 Food Street, Chicago, IL 60601",
          phone: "+1234567895",
          email: "orders@deliciousbites.com",
          rating: 4.3,
          totalReviews: 300,
          totalOrders: 1200,
          priceRange: "MODERATE",
          deliveryTime: "30-45 mins",
          deliveryFee: 3.99,
          minOrderAmount: 15.0,
          maxDeliveryDistance: 8.0,
          isVerified: true,
          deliveryZones: ["Downtown Chicago", "Loop", "River North"],
          specialDiets: ["Vegetarian", "Gluten-Free"],
          openingHours: {
            monday: { open: "11:00", close: "22:00" },
            tuesday: { open: "11:00", close: "22:00" },
            wednesday: { open: "11:00", close: "22:00" },
            thursday: { open: "11:00", close: "23:00" },
            friday: { open: "11:00", close: "23:00" },
            saturday: { open: "12:00", close: "23:00" },
            sunday: { open: "12:00", close: "21:00" },
          },
        },
      },
    },
  })

  // Create riders
  const riders = await Promise.all([
    prisma.user.upsert({
      where: { phone: "+1234567896" },
      update: {},
      create: {
        phone: "+1234567896",
        email: "rider1@example.com",
        name: "Alex Rider",
        role: "RIDER",
        password: bcrypt.hashSync("rider123", 10),
        isVerified: true,
        userProfile: {
          create: {
            firstName: "Alex",
            lastName: "Rider",
            gender: "MALE",
          },
        },
        userSettings: {
          create: {},
        },
        riderProfile: {
          create: {
            vehicleType: "MOTORCYCLE",
            vehicleBrand: "Honda",
            vehicleModel: "CBR150R",
            vehicleYear: "2022",
            vehicleColor: "Red",
            licensePlate: "ABC123",
            licenseNumber: "DL123456789",
            licenseExpiry: new Date("2025-12-31"),
            modules: ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY"],
            isAvailable: true,
            rating: 4.7,
            totalDeliveries: 250,
            totalEarnings: 2500.0,
            isVerified: true,
            deliveryZones: ["Downtown", "Midtown", "Uptown"],
            workingHours: {
              monday: { start: "09:00", end: "18:00" },
              tuesday: { start: "09:00", end: "18:00" },
              wednesday: { start: "09:00", end: "18:00" },
              thursday: { start: "09:00", end: "18:00" },
              friday: { start: "09:00", end: "20:00" },
              saturday: { start: "10:00", end: "20:00" },
              sunday: { start: "12:00", end: "18:00" },
            },
          },
        },
      },
    }),
  ])

  console.log("✅ Users seeded successfully!")

  // ========================================
  // 3. SEED COMMISSION SETTINGS
  // ========================================
  console.log("\n💸 Seeding commission settings...")

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

  console.log("✅ Commission settings seeded successfully!")

  // ========================================
  // 4. SEED RIDE TYPES
  // ========================================
  console.log("\n🚗 Seeding ride types...")

  // Check if ride types already exist
  const existingRideTypes = await prisma.rideType.findMany()
  if (existingRideTypes.length === 0) {
    // Create ride types
    const rideTypes = await Promise.all([
      prisma.rideType.create({
        data: {
          name: "Economy",
          description: "Affordable rides for everyday travel",
          icon: "🚗",
          basePrice: 500.0,
          pricePerKm: 100.0,
          pricePerMinute: 5.0,
          capacity: "1-4 passengers",
          features: ["AC", "Music", "Clean"],
          vehicleType: "CAR",
          isActive: true,
        },
      }),
      prisma.rideType.create({
        data: {
          name: "Premium",
          description: "Luxury rides with premium vehicles",
          icon: "🚙",
          basePrice: 800.0,
          pricePerKm: 150.0,
          pricePerMinute: 8.0,
          capacity: "1-4 passengers",
          features: ["AC", "Music", "Premium Interior", "Professional Driver"],
          vehicleType: "CAR",
          isActive: true,
        },
      }),
      prisma.rideType.create({
        data: {
          name: "Motorcycle",
          description: "Fast and efficient motorcycle rides",
          icon: "🏍️",
          basePrice: 300.0,
          pricePerKm: 80.0,
          pricePerMinute: 3.0,
          capacity: "1-2 passengers",
          features: ["Helmet Provided", "Fast Delivery"],
          vehicleType: "MOTORCYCLE",
          isActive: true,
        },
      }),
      prisma.rideType.create({
        data: {
          name: "Van",
          description: "Spacious van rides for groups and luggage",
          icon: "🚐",
          basePrice: 700.0,
          pricePerKm: 120.0,
          pricePerMinute: 6.0,
          capacity: "1-8 passengers",
          features: ["AC", "Luggage Space", "Group Friendly"],
          vehicleType: "VAN",
          isActive: true,
        },
      }),
      prisma.rideType.create({
        data: {
          name: "Delivery",
          description: "Specialized delivery service",
          icon: "📦",
          basePrice: 400.0,
          pricePerKm: 90.0,
          pricePerMinute: 4.0,
          capacity: "Cargo only",
          features: ["Secure Cargo", "Tracking", "Insurance"],
          vehicleType: "TRUCK",
          isActive: true,
        },
      }),
      prisma.rideType.create({
        data: {
          name: "Bicycle",
          description: "Eco-friendly bicycle delivery service",
          icon: "🚲",
          basePrice: 200.0,
          pricePerKm: 50.0,
          pricePerMinute: 2.0,
          capacity: "1 passenger + small cargo",
          features: ["Eco-friendly", "Fast in traffic", "Low cost"],
          vehicleType: "BICYCLE",
          isActive: true,
        },
      }),
      prisma.rideType.create({
        data: {
          name: "Scooter",
          description: "Quick scooter rides for short distances",
          icon: "🛵",
          basePrice: 250.0,
          pricePerKm: 60.0,
          pricePerMinute: 2.5,
          capacity: "1-2 passengers",
          features: ["Helmet Provided", "Quick Pickup", "Affordable"],
          vehicleType: "SCOOTER",
          isActive: true,
        },
      }),
    ])
    console.log("✅ Ride types seeded successfully!")
  } else {
    console.log(`⚠️  Found ${existingRideTypes.length} existing ride types. Skipping creation.`)
  }

  // ========================================
  // 5. SEED PROMO CODES
  // ========================================
  console.log("\n🎫 Seeding promo codes...")

  const promoCodes = await Promise.all([
    prisma.promoCode.upsert({
      where: { code: "WELCOME10" },
      update: {},
      create: {
        code: "WELCOME10",
        title: "Welcome Discount",
        description: "10% off your first order",
        type: "PERCENTAGE",
        value: 10,
        minOrderAmount: 25.0,
        maxDiscount: 10.0,
        usageLimit: 1000,
        modules: ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY"],
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    }),
    prisma.promoCode.upsert({
      where: { code: "FREEDEL" },
      update: {},
      create: {
        code: "FREEDEL",
        title: "Free Delivery",
        description: "Free delivery on orders over $30",
        type: "FREE_DELIVERY",
        value: 0,
        minOrderAmount: 30.0,
        usageLimit: 500,
        modules: ["FOOD", "GROCERY"],
        startsAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      },
    }),
  ])

  console.log("✅ Promo codes seeded successfully!")

  // ========================================
  // 6. SEED MEDICINE DATA
  // ========================================
  console.log("\n💊 Seeding medicine data...")

  // Seed illness categories
  const illnessCategories = [
    {
      name: "fever",
      displayName: "Fever & Flu",
      description: "Common fever, cold, and flu symptoms",
      icon: "🤒",
      isCommon: true,
      symptoms: ["Fever", "Cough", "Sore throat", "Runny nose", "Body aches"],
      medicines: ["Paracetamol", "Ibuprofen", "Aspirin", "Vitamin C"],
      isActive: true
    },
    {
      name: "pain",
      displayName: "Pain Management",
      description: "General pain relief and management",
      icon: "😣",
      isCommon: true,
      symptoms: ["Muscle pain", "Joint pain", "Back pain", "Toothache"],
      medicines: ["Ibuprofen", "Paracetamol", "Diclofenac", "Tramadol"],
      isActive: true
    },
    {
      name: "allergies",
      displayName: "Allergies & Antihistamines",
      description: "Allergy treatment and prevention",
      icon: "🤧",
      isCommon: true,
      symptoms: ["Sneezing", "Itchy eyes", "Runny nose", "Skin rashes"],
      medicines: ["Cetirizine", "Loratadine", "Fexofenadine", "Diphenhydramine"],
      isActive: true
    }
  ]

  for (const category of illnessCategories) {
    await prisma.illnessCategory.upsert({
      where: { name: category.name },
      update: category,
      create: category
    })
  }

  // Seed medicine origins
  const medicineOrigins = [
    {
      name: "local",
      displayName: "Local (Nigeria)",
      description: "Medicines manufactured locally in Nigeria",
      isActive: true
    },
    {
      name: "imported",
      displayName: "Imported",
      description: "Medicines imported from other countries",
      isActive: true
    },
    {
      name: "india",
      displayName: "India",
      description: "Medicines manufactured in India",
      isActive: true
    }
  ]

  for (const origin of medicineOrigins) {
    await prisma.medicineOrigin.upsert({
      where: { name: origin.name },
      update: origin,
      create: origin
    })
  }

  // Seed sample central medicines
  const centralMedicines = [
    {
      name: "Paracetamol 500mg",
      genericName: "Acetaminophen",
      description: "Pain reliever and fever reducer",
      purpose: "Relieves pain and reduces fever",
      dosageInfo: "1-2 tablets every 4-6 hours as needed, max 8 tablets per day",
      warnings: "Do not exceed recommended dose. Consult doctor if symptoms persist.",
      sideEffects: ["Nausea", "Stomach upset", "Allergic reactions"],
      category: "pain",
      illnessTypes: ["fever", "headache", "pain"],
      activeIngredients: ["Acetaminophen 500mg"],
      form: "TABLET",
      strength: "500mg",
      manufacturer: "Local Pharmaceutical Co.",
      images: ["paracetamol_500mg_1.jpg"],
      isActive: true
    },
    {
      name: "Ibuprofen 400mg",
      genericName: "Ibuprofen",
      description: "Non-steroidal anti-inflammatory drug for pain and inflammation",
      purpose: "Relieves pain, reduces inflammation and fever",
      dosageInfo: "1-2 tablets every 4-6 hours as needed, max 6 tablets per day",
      warnings: "Take with food. Avoid if you have stomach ulcers.",
      sideEffects: ["Stomach upset", "Dizziness", "Headache"],
      category: "pain",
      illnessTypes: ["fever", "headache", "pain"],
      activeIngredients: ["Ibuprofen 400mg"],
      form: "TABLET",
      strength: "400mg",
      manufacturer: "MediPharm Ltd.",
      images: ["ibuprofen_400mg_1.jpg"],
      isActive: true
    }
  ]

  for (const medicine of centralMedicines) {
    try {
      await prisma.centralMedicine.create({
        data: medicine
      })
    } catch (error) {
      // If medicine already exists, skip it
      console.log(`⚠️  Medicine "${medicine.name}" already exists, skipping...`)
    }
  }

  console.log("✅ Medicine data seeded successfully!")

  // ========================================
  // SUMMARY
  // ========================================
  console.log("\n🎉 MASTER DATABASE SEEDING COMPLETED SUCCESSFULLY!")
  console.log("📊 Created/Updated:")
  console.log(`  - ${defaultCurrencies.length} Currencies`)
  console.log(`  - 1 Admin user`)
  console.log(`  - ${customers.length} Customer users`)
  console.log(`  - 3 Vendor users (Auto Parts, Pharmacy, Restaurant)`)
  console.log(`  - ${riders.length} Rider user`)
  console.log(`  - ${promoCodes.length} Promo codes`)
  console.log(`  - Commission settings for all modules`)
  console.log(`  - Ride types for all vehicle types`)
  console.log(`  - Illness categories and medicine origins`)
  console.log(`  - Sample central medicines`)
  
  console.log("\n🔑 Default Login Credentials:")
  console.log("  Admin: admin@kilosuperapp.com / admin123")
  console.log("  Customer: john.customer@example.com / customer123")
  console.log("  Vendor: autoparts@example.com / vendor123")
  console.log("  Rider: rider1@example.com / rider123")
}

main()
  .catch((e) => {
    console.error("❌ Error during master seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
