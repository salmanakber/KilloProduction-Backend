import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Seed script for Auto Parts testing
 * Creates vendors, products, and categories for testing the AI vehicle check feature
 */
async function main() {
  console.log('🌱 Seeding auto parts data...')

  // Create test vendors with vendor profiles
  const vendors = await Promise.all([
    prisma.user.upsert({
      where: { email: 'autoparts1@test.com' },
      update: {},
      create: {
        email: 'autoparts1@test.com',
        phone: '+2348012345678',
        name: 'Auto Parts Store 1',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        vendorProfile: {
          create: {
            businessName: 'Premium Auto Parts',
            businessType: 'Auto Parts Retailer',
            address: '123 Main Street',
            city: 'Lagos',
            state: 'Lagos',
            description: 'Premium auto parts for all vehicle makes and models',
          },
        },
      },
    }),
    prisma.user.upsert({
      where: { email: 'autoparts2@test.com' },
      update: {},
      create: {
        email: 'autoparts2@test.com',
        phone: '+2348012345679',
        name: 'Auto Parts Store 2',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        vendorProfile: {
          create: {
            businessName: 'Quick Fix Auto Parts',
            businessType: 'Auto Parts Retailer',
            address: '456 Market Road',
            city: 'Abuja',
            state: 'FCT',
            description: 'Fast and reliable auto parts delivery',
          },
        },
      },
    }),
    prisma.user.upsert({
      where: { email: 'autoparts3@test.com' },
      update: {},
      create: {
        email: 'autoparts3@test.com',
        phone: '+2348012345680',
        name: 'Auto Parts Store 3',
        role: 'VENDOR',
        isVerified: true,
        isActive: true,
        vendorProfile: {
          create: {
            businessName: 'Elite Car Parts',
            businessType: 'Auto Parts Retailer',
            address: '789 Industrial Avenue',
            city: 'Lagos',
            state: 'Lagos',
            description: 'Elite quality parts for luxury vehicles',
          },
        },
      },
    }),
  ])

  console.log('✅ Created vendors:', vendors.length)

  // Get or create categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { id: 'cat-brakes' },
      update: {},
      create: {
        id: 'cat-brakes',
        name: 'Brakes',
        description: 'Brake pads, rotors, calipers, and brake fluid',
        module: 'AUTO_PARTS',
      },
    }),
    prisma.category.upsert({
      where: { id: 'cat-engine' },
      update: {},
      create: {
        id: 'cat-engine',
        name: 'Engine',
        description: 'Engine parts, filters, belts, and fluids',
        module: 'AUTO_PARTS',
      },
    }),
    prisma.category.upsert({
      where: { id: 'cat-suspension' },
      update: {},
      create: {
        id: 'cat-suspension',
        name: 'Suspension',
        description: 'Shocks, struts, springs, and suspension components',
        module: 'AUTO_PARTS',
      },
    }),
    prisma.category.upsert({
      where: { id: 'cat-electrical' },
      update: {},
      create: {
        id: 'cat-electrical',
        name: 'Electrical',
        description: 'Batteries, alternators, starters, and electrical components',
        module: 'AUTO_PARTS',
      },
    }),
  ])

  console.log('✅ Created categories:', categories.length)

  // Create test products
  const products = [
    // Brake Parts
    {
      vendorId: vendors[0].id,
      type: 'AUTO_PART' as const,
      name: 'Premium Brake Pads - Front',
      description: 'High-quality ceramic brake pads for front wheels. Reduces brake noise and dust. Compatible with most sedans and SUVs.',
      price: 45.99,
      comparePrice: 59.99,
      categoryId: categories.find(c => c.name === 'Brakes')?.id || categories[0].id,
      brand: 'PremiumBrake',
      sku: 'BP-FRONT-001',
      stockQuantity: 50,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Brake+Pads'],
    },
    {
      vendorId: vendors[0].id,
      type: 'AUTO_PART' as const,
      name: 'Brake Rotors - Front Set',
      description: 'Vented brake rotors for improved heat dissipation. Fits Toyota Camry, Honda Accord, and similar models.',
      price: 89.99,
      comparePrice: 119.99,
      categoryId: categories.find(c => c.name === 'Brakes')?.id || categories[0].id,
      brand: 'AutoStop',
      sku: 'BR-FRONT-001',
      stockQuantity: 30,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Brake+Rotors'],
    },
    {
      vendorId: vendors[1].id,
      type: 'AUTO_PART',
      name: 'Brake Fluid DOT 4',
      description: 'High-performance brake fluid. DOT 4 specification. 1 quart bottle.',
      price: 12.99,
      comparePrice: 16.99,
      categoryId: categories.find(c => c.name === 'Brakes')?.id || categories[0].id,
      brand: 'QuickFix',
      sku: 'BF-DOT4-001',
      stockQuantity: 100,
      isActive: true,
      isFeatured: false,
      images: ['https://via.placeholder.com/400?text=Brake+Fluid'],
    },
    // Engine Parts
    {
      vendorId: vendors[0].id,
      type: 'AUTO_PART' as const,
      name: 'Air Filter - Premium',
      description: 'High-efficiency air filter. Improves engine performance and fuel economy. Universal fit for most vehicles.',
      price: 24.99,
      comparePrice: 34.99,
      categoryId: categories.find(c => c.name === 'Engine')?.id || categories[1].id,
      brand: 'AirMax',
      sku: 'AF-PREM-001',
      stockQuantity: 75,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Air+Filter'],
    },
    {
      vendorId: vendors[1].id,
      type: 'AUTO_PART',
      name: 'Oil Filter - Standard',
      description: 'Standard oil filter for regular oil changes. Compatible with most 4-cylinder engines.',
      price: 8.99,
      comparePrice: 12.99,
      categoryId: categories.find(c => c.name === 'Engine')?.id || categories[1].id,
      brand: 'QuickFix',
      sku: 'OF-STD-001',
      stockQuantity: 200,
      isActive: true,
      isFeatured: false,
      images: ['https://via.placeholder.com/400?text=Oil+Filter'],
    },
    {
      vendorId: vendors[2].id,
      type: 'AUTO_PART',
      name: 'Timing Belt Kit',
      description: 'Complete timing belt kit with tensioner and pulleys. For Honda, Toyota, and Nissan vehicles.',
      price: 149.99,
      comparePrice: 199.99,
      categoryId: categories.find(c => c.name === 'Engine')?.id || categories[1].id,
      brand: 'EliteParts',
      sku: 'TB-KIT-001',
      stockQuantity: 25,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Timing+Belt'],
    },
    {
      vendorId: vendors[0].id,
      type: 'AUTO_PART' as const,
      name: 'Spark Plugs - Iridium',
      description: 'Iridium spark plugs for improved ignition and fuel efficiency. Set of 4.',
      price: 39.99,
      comparePrice: 54.99,
      categoryId: categories.find(c => c.name === 'Engine')?.id || categories[1].id,
      brand: 'SparkMax',
      sku: 'SP-IR-001',
      stockQuantity: 60,
      isActive: true,
      isFeatured: false,
      images: ['https://via.placeholder.com/400?text=Spark+Plugs'],
    },
    // Suspension Parts
    {
      vendorId: vendors[1].id,
      type: 'AUTO_PART',
      name: 'Front Shock Absorbers - Pair',
      description: 'Heavy-duty shock absorbers for front suspension. Improves ride comfort and handling.',
      price: 129.99,
      comparePrice: 179.99,
      categoryId: categories.find(c => c.name === 'Suspension')?.id || categories[2].id,
      brand: 'SmoothRide',
      sku: 'SH-FRONT-001',
      stockQuantity: 40,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Shock+Absorbers'],
    },
    {
      vendorId: vendors[2].id,
      type: 'AUTO_PART',
      name: 'Strut Assembly - Complete',
      description: 'Complete strut assembly with spring. Direct replacement for OEM. Fits most sedans.',
      price: 199.99,
      comparePrice: 279.99,
      categoryId: categories.find(c => c.name === 'Suspension')?.id || categories[2].id,
      brand: 'EliteParts',
      sku: 'ST-COMP-001',
      stockQuantity: 20,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Strut+Assembly'],
    },
    // Electrical Parts
    {
      vendorId: vendors[0].id,
      type: 'AUTO_PART' as const,
      name: 'Car Battery - 12V 60Ah',
      description: 'Maintenance-free car battery. 3-year warranty. Fits most sedans and small SUVs.',
      price: 149.99,
      comparePrice: 199.99,
      categoryId: categories.find(c => c.name === 'Electrical')?.id || categories[3].id,
      brand: 'PowerMax',
      sku: 'BAT-60AH-001',
      stockQuantity: 35,
      isActive: true,
      isFeatured: true,
      images: ['https://via.placeholder.com/400?text=Car+Battery'],
    },
    {
      vendorId: vendors[1].id,
      type: 'AUTO_PART',
      name: 'Alternator - Remanufactured',
      description: 'Remanufactured alternator. Tested and guaranteed. Compatible with most vehicles.',
      price: 179.99,
      comparePrice: 249.99,
      categoryId: categories.find(c => c.name === 'Electrical')?.id || categories[3].id,
      brand: 'QuickFix',
      sku: 'ALT-REM-001',
      stockQuantity: 15,
      isActive: true,
      isFeatured: false,
      images: ['https://via.placeholder.com/400?text=Alternator'],
    },
    {
      vendorId: vendors[2].id,
      type: 'AUTO_PART',
      name: 'Starter Motor - High Torque',
      description: 'High-torque starter motor for reliable engine starting. Direct OEM replacement.',
      price: 159.99,
      comparePrice: 219.99,
      categoryId: categories.find(c => c.name === 'Electrical')?.id || categories[3].id,
      brand: 'EliteParts',
      sku: 'ST-MOT-001',
      stockQuantity: 18,
      isActive: true,
      isFeatured: false,
      images: ['https://via.placeholder.com/400?text=Starter+Motor'],
    },
  ]

  const createdProducts = await Promise.all(
    products.map((product) =>
      prisma.product.upsert({
        where: { id: `product-${product.sku}` },
        update: {
          ...product,
          type: 'AUTO_PART' as const,
        },
        create: {
          ...product,
          id: `product-${product.sku}`,
          type: 'AUTO_PART' as const,
        },
      })
    )
  )

  console.log('✅ Created products:', createdProducts.length)

  // Create some reviews for products
//   const reviews = [
//     {
//       productId: createdProducts[0].id,
//       userId: vendors[0].id,
//       targetId: createdProducts[0].id, // targetId is the productId for PRODUCT reviews
//       targetType: 'PRODUCT' as const,
//       rating: 5,
//       comment: 'Excellent brake pads! Very quiet and effective.',
//     },
//     {
//       productId: createdProducts[0].id,
//       userId: vendors[1].id,
//       targetId: createdProducts[0].id,
//       targetType: 'PRODUCT' as const,
//       rating: 4,
//       comment: 'Good quality, easy to install.',
//     },
//     {
//       productId: createdProducts[3].id,
//       userId: vendors[0].id,
//       targetId: createdProducts[3].id,
//       targetType: 'PRODUCT' as const,
//       rating: 5,
//       comment: 'Great air filter, improved my car\'s performance.',
//     },
//     {
//       productId: createdProducts[9].id,
//       userId: vendors[1].id,
//       targetId: createdProducts[9].id,
//       targetType: 'PRODUCT' as const,
//       rating: 5,
//       comment: 'Battery works perfectly, long-lasting.',
//     },
//   ]

//   await Promise.all(
//     reviews.map((review) =>
//       prisma.review.create({
//         data: review,
//       })
//     )
//   )

//   console.log('✅ Created reviews:', reviews.length)

  // Create test mechanics
  console.log('🔧 Creating mechanics...')
  const mechanics = await Promise.all([
    prisma.user.upsert({
      where: { email: 'mechanic1@test.com' },
      update: {},
      create: {
        email: 'mechanic1@test.com',
        phone: '+2348012345690',
        name: 'John Mechanic',
        role: 'MECHANIC',
        isVerified: true,
        isActive: true,
        mechanicProfile: {
          create: {
            businessName: 'Pro Auto Repair',
            businessType: 'Auto Repair Shop',
            address: '789 Mechanic Street',
            city: 'Lagos',
            state: 'Lagos',
            latitude: 6.5244,
            longitude: 3.3792,
            description: 'Professional auto repair services',
            rating: 4.8,
            totalReviews: 45,
            totalJobsCompleted: 120,
            yearsOfExperience: 15,
            hourlyRate: 50,
            serviceRadius: 25,
            isVerified: true,
            expertise: {
              create: [
                { expertiseType: 'Engine', experienceYears: 15, isPrimary: true },
                { expertiseType: 'Transmission', experienceYears: 12, isPrimary: false },
                { expertiseType: 'Brakes', experienceYears: 10, isPrimary: false },
              ]
            }
          }
        }
      },
      include: { mechanicProfile: { include: { expertise: true } } }
    }),
    prisma.user.upsert({
      where: { email: 'mechanic2@test.com' },
      update: {},
      create: {
        email: 'mechanic2@test.com',
        phone: '+2348012345691',
        name: 'Mike Technician',
        role: 'MECHANIC',
        isVerified: true,
        isActive: true,
        mechanicProfile: {
          create: {
            businessName: 'Quick Fix Auto',
            businessType: 'Mobile Mechanic',
            address: '456 Service Road',
            city: 'Abuja',
            state: 'FCT',
            latitude: 9.0765,
            longitude: 7.3986,
            description: 'Mobile mechanic services',
            rating: 4.6,
            totalReviews: 32,
            totalJobsCompleted: 85,
            yearsOfExperience: 10,
            hourlyRate: 40,
            serviceRadius: 30,
            isVerified: true,
            expertise: {
              create: [
                { expertiseType: 'Suspension', experienceYears: 10, isPrimary: true },
                { expertiseType: 'Electrical', experienceYears: 8, isPrimary: false },
                { expertiseType: 'AC', experienceYears: 7, isPrimary: false },
              ]
            }
          }
        }
      },
      include: { mechanicProfile: { include: { expertise: true } } }
    }),
    prisma.user.upsert({
      where: { email: 'mechanic3@test.com' },
      update: {},
      create: {
        email: 'mechanic3@test.com',
        phone: '+2348012345692',
        name: 'David Specialist',
        role: 'MECHANIC',
        isVerified: true,
        isActive: true,
        mechanicProfile: {
          create: {
            businessName: 'Elite Car Service',
            businessType: 'Auto Repair Shop',
            address: '321 Expert Avenue',
            city: 'Lagos',
            state: 'Lagos',
            latitude: 6.4541,
            longitude: 3.3947,
            description: 'Specialized in luxury vehicles',
            rating: 4.9,
            totalReviews: 67,
            totalJobsCompleted: 200,
            yearsOfExperience: 20,
            hourlyRate: 75,
            serviceRadius: 20,
            isVerified: true,
            expertise: {
              create: [
                { expertiseType: 'Engine', experienceYears: 20, isPrimary: true },
                { expertiseType: 'Diagnostics', experienceYears: 18, isPrimary: false },
                { expertiseType: 'General mechanic', experienceYears: 20, isPrimary: false },
              ]
            }
          }
        }
      },
      include: { mechanicProfile: { include: { expertise: true } } }
    }),
  ])

  console.log('✅ Created mechanics:', mechanics.length)
  console.log('🎉 Auto parts seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

