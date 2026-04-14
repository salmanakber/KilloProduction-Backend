const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function seedWholesalers() {
  try {
    console.log('🌱 Seeding wholesalers and related data...')

    // Create wholesaler data
    const wholesalersData = [
      {
        companyName: 'MediPharm Solutions Ltd',
        licenseNumber: 'WH001-MED-2024',
        description: 'Leading pharmaceutical wholesaler specializing in generic medicines and medical supplies',
        address: '123 Pharmaceutical Avenue, Victoria Island, Lagos',
        phone: '+2348012345678',
        email: 'info@medipharm.com',
        website: 'https://medipharm.com',
        specialties: ['Generic Medicines', 'Antibiotics', 'Pain Relief'],
        deliveryZones: ['Lagos', 'Ogun', 'Oyo'],
        paymentTerms: 'Net 30',
        rating: 4.8,
        totalOrders: 156
      },
      {
        companyName: 'HealthCare Distributors NG',
        licenseNumber: 'WH002-HCD-2024',
        description: 'Comprehensive healthcare product distributor serving hospitals and pharmacies',
        address: '456 Healthcare Boulevard, Ikeja, Lagos',
        phone: '+2348023456789',
        email: 'contact@healthcareng.com',
        website: 'https://healthcareng.com',
        specialties: ['Hospital Supplies', 'Surgical Equipment', 'Diagnostic Tools'],
        deliveryZones: ['Lagos', 'Rivers', 'Kano'],
        paymentTerms: 'Net 45',
        rating: 4.6,
        totalOrders: 89
      },
      {
        companyName: 'Nigerian Drug Store Ltd',
        licenseNumber: 'WH003-NDS-2024',
        description: 'Traditional and modern medicine wholesaler with nationwide coverage',
        address: '789 Drug Street, Surulere, Lagos',
        phone: '+2348034567890',
        email: 'sales@nigeriandrugstore.com',
        website: 'https://nigeriandrugstore.com',
        specialties: ['Traditional Medicine', 'Herbal Supplements', 'Vitamins'],
        deliveryZones: ['Lagos', 'Ondo', 'Ekiti'],
        paymentTerms: 'Net 30',
        rating: 4.4,
        totalOrders: 67
      },
      {
        companyName: 'PharmaTech Industries',
        licenseNumber: 'WH004-PTI-2024',
        description: 'Technology-driven pharmaceutical wholesaler with advanced inventory management',
        address: '321 Tech Park, Lekki, Lagos',
        phone: '+2348045678901',
        email: 'hello@pharmatech.com',
        website: 'https://pharmatech.com',
        specialties: ['Biotech Products', 'Specialty Medicines', 'Clinical Supplies'],
        deliveryZones: ['Lagos', 'Abuja', 'Port Harcourt'],
        paymentTerms: 'Net 60',
        rating: 4.9,
        totalOrders: 234
      },
      {
        companyName: 'MediCare Wholesale Ltd',
        licenseNumber: 'WH005-MCW-2024',
        description: 'Family-owned wholesaler with 20+ years of experience in pharmaceutical distribution',
        address: '654 Care Road, Yaba, Lagos',
        phone: '+2348056789012',
        email: 'info@medicarewholesale.com',
        website: 'https://medicarewholesale.com',
        specialties: ['Pediatric Medicines', 'Elderly Care', 'Family Health'],
        deliveryZones: ['Lagos', 'Ogun', 'Ondo'],
        paymentTerms: 'Net 30',
        rating: 4.7,
        totalOrders: 123
      },
      {
        companyName: 'Global Pharma Distributors',
        licenseNumber: 'WH006-GPD-2024',
        description: 'International pharmaceutical distributor with local presence',
        address: '987 Global Plaza, Victoria Island, Lagos',
        phone: '+2348067890123',
        email: 'contact@globalpharma.com',
        website: 'https://globalpharma.com',
        specialties: ['Imported Medicines', 'Branded Products', 'Specialty Drugs'],
        deliveryZones: ['Lagos', 'Abuja', 'Kano', 'Port Harcourt'],
        paymentTerms: 'Net 45',
        rating: 4.5,
        totalOrders: 178
      },
      {
        companyName: 'EcoMed Supplies',
        licenseNumber: 'WH007-EMS-2024',
        description: 'Eco-friendly medical supplies and sustainable healthcare products',
        address: '147 Eco Street, Ikoyi, Lagos',
        phone: '+2348078901234',
        email: 'info@ecomedsupplies.com',
        website: 'https://ecomedsupplies.com',
        specialties: ['Eco-friendly Products', 'Sustainable Supplies', 'Green Healthcare'],
        deliveryZones: ['Lagos', 'Abuja'],
        paymentTerms: 'Net 30',
        rating: 4.3,
        totalOrders: 45
      },
      {
        companyName: 'RapidMed Express',
        licenseNumber: 'WH008-RME-2024',
        description: 'Fast delivery pharmaceutical wholesaler with same-day delivery options',
        address: '258 Express Way, Alausa, Lagos',
        phone: '+2348089012345',
        email: 'orders@rapidmed.com',
        website: 'https://rapidmed.com',
        specialties: ['Emergency Medicines', 'Fast Delivery', '24/7 Service'],
        deliveryZones: ['Lagos', 'Ogun'],
        paymentTerms: 'Net 15',
        rating: 4.8,
        totalOrders: 312
      }
    ]

    // Create wholesalers with user accounts
    const createdWholesalers = []
    for (const wholesalerData of wholesalersData) {
      try {
        // Generate password
        const password = 'Password123!'
        const hashedPassword = await bcrypt.hash(password, 12)

        // Create user and wholesaler in transaction
        const result = await prisma.$transaction(async (tx) => {
          // Create user
          const user = await tx.user.create({
            data: {
              name: wholesalerData.companyName,
              email: wholesalerData.email,
              phone: wholesalerData.phone,
              password: hashedPassword,
                             role: 'VENDOR',
              isActive: true,
            },
          })

          // Create wholesaler
          const wholesaler = await tx.wholesaler.create({
            data: {
              userId: user.id,
              companyName: wholesalerData.companyName,
              licenseNumber: wholesalerData.licenseNumber,
              description: wholesalerData.description,
              address: wholesalerData.address,
              phone: wholesalerData.phone,
              email: wholesalerData.email,
              website: wholesalerData.website,
              specialties: wholesalerData.specialties,
              deliveryZones: wholesalerData.deliveryZones,
              paymentTerms: wholesalerData.paymentTerms,
              rating: wholesalerData.rating,
              totalOrders: wholesalerData.totalOrders,
              isVerified: Math.random() > 0.3, // 70% verified
            },
          })

          return { user, wholesaler, password }
        })

        createdWholesalers.push(result.wholesaler)
        console.log(`✅ Created wholesaler: ${wholesalerData.companyName}`)
        console.log(`   Email: ${wholesalerData.email}`)
        console.log(`   Password: ${password}`)
      } catch (error) {
        console.error(`❌ Failed to create wholesaler ${wholesalerData.companyName}:`, error.message)
      }
    }

    console.log(`\n🎉 Created ${createdWholesalers.length} wholesalers successfully!`)

    // Create sample products for each wholesaler
    console.log('\n📦 Creating sample products...')

    const productTemplates = [
      {
        name: 'Paracetamol 500mg',
        genericName: 'Acetaminophen',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '500mg',
        form: 'TABLET',
        category: 'Analgesic',
        unitPrice: 150,
        minOrderQuantity: 100,
        stock: 5000,
        batchNumber: 'BATCH-001-2024',
        manufacturingDate: new Date('2024-01-15'),
        expiryDate: new Date('2026-01-15'),
        countryOfOrigin: 'Nigeria'
      },
      {
        name: 'Amoxicillin 250mg',
        genericName: 'Amoxicillin',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '250mg',
        form: 'CAPSULE',
        category: 'Antibiotic',
        unitPrice: 200,
        minOrderQuantity: 50,
        stock: 3000,
        batchNumber: 'BATCH-002-2024',
        manufacturingDate: new Date('2024-02-01'),
        expiryDate: new Date('2025-12-01'),
        countryOfOrigin: 'India'
      },
      {
        name: 'Ibuprofen 400mg',
        genericName: 'Ibuprofen',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '400mg',
        form: 'TABLET',
        category: 'NSAID',
        unitPrice: 180,
        minOrderQuantity: 100,
        stock: 4000,
        batchNumber: 'BATCH-003-2024',
        manufacturingDate: new Date('2024-01-20'),
        expiryDate: new Date('2026-01-20'),
        countryOfOrigin: 'Nigeria'
      },
      {
        name: 'Vitamin C 1000mg',
        genericName: 'Ascorbic Acid',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '1000mg',
        form: 'TABLET',
        category: 'Vitamin',
        unitPrice: 120,
        minOrderQuantity: 200,
        stock: 8000,
        batchNumber: 'BATCH-004-2024',
        manufacturingDate: new Date('2024-01-10'),
        expiryDate: new Date('2026-01-10'),
        countryOfOrigin: 'Nigeria'
      },
      {
        name: 'Omeprazole 20mg',
        genericName: 'Omeprazole',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '20mg',
        form: 'CAPSULE',
        category: 'PPI',
        unitPrice: 250,
        minOrderQuantity: 50,
        stock: 2000,
        batchNumber: 'BATCH-005-2024',
        manufacturingDate: new Date('2024-02-15'),
        expiryDate: new Date('2025-12-15'),
        countryOfOrigin: 'India'
      },
      {
        name: 'Metformin 500mg',
        genericName: 'Metformin',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '500mg',
        form: 'TABLET',
        category: 'Antidiabetic',
        unitPrice: 300,
        minOrderQuantity: 100,
        stock: 2500,
        batchNumber: 'BATCH-006-2024',
        manufacturingDate: new Date('2024-01-25'),
        expiryDate: new Date('2026-01-25'),
        countryOfOrigin: 'Nigeria'
      },
      {
        name: 'Cetirizine 10mg',
        genericName: 'Cetirizine',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '10mg',
        form: 'TABLET',
        category: 'Antihistamine',
        unitPrice: 100,
        minOrderQuantity: 150,
        stock: 6000,
        batchNumber: 'BATCH-007-2024',
        manufacturingDate: new Date('2024-02-10'),
        expiryDate: new Date('2026-02-10'),
        countryOfOrigin: 'Nigeria'
      },
      {
        name: 'Loratadine 10mg',
        genericName: 'Loratadine',
        brand: 'Generic',
        manufacturer: 'Various',
        dosage: '10mg',
        form: 'TABLET',
        category: 'Antihistamine',
        unitPrice: 120,
        minOrderQuantity: 100,
        stock: 3500,
        batchNumber: 'BATCH-008-2024',
        manufacturingDate: new Date('2024-01-30'),
        expiryDate: new Date('2026-01-30'),
        countryOfOrigin: 'India'
      }
    ]

    // Create products for each wholesaler
    for (const wholesaler of createdWholesalers) {
      const numProducts = Math.floor(Math.random() * 4) + 3 // 3-6 products per wholesaler
      const selectedProducts = productTemplates
        .sort(() => 0.5 - Math.random())
        .slice(0, numProducts)

      for (const productTemplate of selectedProducts) {
        try {
          await prisma.wholesalerProduct.create({
            data: {
              wholesalerId: wholesaler.id,
              ...productTemplate,
              isActive: true,
            },
          })
        } catch (error) {
          console.error(`❌ Failed to create product for ${wholesaler.companyName}:`, error.message)
        }
      }
      console.log(`✅ Created ${numProducts} products for ${wholesaler.companyName}`)
    }

    // Create sample pharmacies for orders
    console.log('\n🏥 Creating sample pharmacies...')
    
    const pharmaciesData = [
      {
        companyName: 'City Pharmacy',
        phone: '+2348090123456',
        email: 'info@citypharmacy.com',
        address: '123 Main Street, Lagos',
        licenseNumber: 'PH001-CITY-2024',
        isVerified: true
      },
      {
        companyName: 'Health Plus Pharmacy',
        phone: '+2348091234567',
        email: 'contact@healthplus.com',
        address: '456 Health Road, Ikeja',
        licenseNumber: 'PH002-HP-2024',
        isVerified: true
      },
      {
        companyName: 'MediCare Pharmacy',
        phone: '+2348092345678',
        email: 'sales@medicarepharmacy.com',
        address: '789 Care Avenue, Victoria Island',
        licenseNumber: 'PH003-MC-2024',
        isVerified: true
      }
    ]

    const createdPharmacies = []
    for (const pharmacyData of pharmaciesData) {
      try {
        const password = 'Password123!'
        const hashedPassword = await bcrypt.hash(password, 12)

        const result = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              name: pharmacyData.companyName,
              email: pharmacyData.email,
              phone: pharmacyData.phone,
              password: hashedPassword,
              role: 'VENDOR',
              isActive: true,
            },
          })

                     const pharmacy = await tx.pharmacy.create({
             data: {
               userId: user.id,
               pharmacyName: pharmacyData.companyName,
               phone: pharmacyData.phone,
               email: pharmacyData.email,
               address: pharmacyData.address,
               licenseNumber: pharmacyData.licenseNumber,
               isVerified: pharmacyData.isVerified,
               status: 'ACTIVE',
             },
           })

          return { user, pharmacy, password }
        })

        createdPharmacies.push(result.pharmacy)
        console.log(`✅ Created pharmacy: ${pharmacyData.companyName}`)
      } catch (error) {
        console.error(`❌ Failed to create pharmacy ${pharmacyData.companyName}:`, error.message)
      }
    }

    // Create sample supplier orders
    console.log('\n📋 Creating sample supplier orders...')

    const orderStatuses = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']
    const paymentStatuses = ['PENDING', 'PAID', 'FAILED']

    for (let i = 0; i < 25; i++) {
      try {
        const wholesaler = createdWholesalers[Math.floor(Math.random() * createdWholesalers.length)]
        const pharmacy = createdPharmacies[Math.floor(Math.random() * createdPharmacies.length)]
        const status = orderStatuses[Math.floor(Math.random() * orderStatuses.length)]
        const paymentStatus = paymentStatuses[Math.floor(Math.random() * paymentStatuses.length)]

        // Get wholesaler products
        const products = await prisma.wholesalerProduct.findMany({
          where: { wholesalerId: wholesaler.id, isActive: true },
          take: Math.floor(Math.random() * 3) + 1, // 1-3 products per order
        })

        if (products.length === 0) continue

        // Create order
        const order = await prisma.supplierOrder.create({
          data: {
            pharmacyId: pharmacy.id,
            wholesalerId: wholesaler.id,
            orderNumber: `SO-${Date.now()}-${i + 1}`,
            status,
            totalAmount: 0, // Will be calculated
            paymentStatus,
            paymentTerms: wholesaler.paymentTerms,
            deliveryDate: status === 'DELIVERED' ? new Date() : null,
            notes: `Sample order ${i + 1}`,
          },
        })

        // Create order items
        let totalAmount = 0
        for (const product of products) {
          const quantity = Math.floor(Math.random() * 50) + 10 // 10-60 units
          const unitPrice = product.unitPrice
          const totalPrice = quantity * unitPrice
          totalAmount += totalPrice

          await prisma.supplierOrderItem.create({
            data: {
              supplierOrderId: order.id,
              productId: product.id,
              productName: product.name,
              quantity,
              unitPrice,
              totalPrice,
            },
          })
        }

        // Update order total
        await prisma.supplierOrder.update({
          where: { id: order.id },
          data: { totalAmount },
        })

        console.log(`✅ Created order: ${order.orderNumber} - ${status}`)
      } catch (error) {
        console.error(`❌ Failed to create order ${i + 1}:`, error.message)
      }
    }

    console.log('\n🎉 Wholesaler seeding completed successfully!')
    console.log('\n📊 Summary:')
    console.log(`   • ${createdWholesalers.length} wholesalers created`)
    console.log(`   • ${createdPharmacies.length} pharmacies created`)
    console.log(`   • Sample products created for each wholesaler`)
    console.log(`   • 25 sample supplier orders created`)
    console.log('\n🔑 Login Credentials:')
    console.log('   Use the email and password combinations shown above to test the system')

  } catch (error) {
    console.error('❌ Error seeding wholesalers:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedWholesalers()
