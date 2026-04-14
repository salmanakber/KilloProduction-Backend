import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  try {
    console.log('🌱 Seeding special offers...')

    // Get some pharmacies to assign offers to (optional)
    const pharmacies = await prisma.pharmacy.findMany({
      take: 3,
      select: {
        id: true,
        pharmacyName: true
      }
    })

    console.log(`📊 Found ${pharmacies.length} pharmacies to assign offers to`)

    // Create sample special offers
    const specialOffers = [
      {
        title: "Summer Medicine Sale",
        subtitle: "Beat the heat with healthy savings!",
        description: "Get amazing discounts on essential medicines this summer. Stock up on your health essentials and save big!",
        discountType: "PERCENTAGE" as const,
        discountValue: 25,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
        imageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=500&h=300&fit=crop",
        bannerImageUrl: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=1200&h=400&fit=crop",
        isActive: true,
        maxUses: 1000,
        pharmacyId: pharmacies.length > 0 ? pharmacies[0].id : null,
        conditions: {
          minOrderAmount: 2000,
          excludeCategories: ["prescription"],
          validDays: ["monday", "tuesday", "wednesday", "thursday", "friday"]
        },
        targetAudience: {
          userTypes: ["customer"],
          locations: ["Lagos", "Abuja", "Port Harcourt"],
          ageGroups: ["18-65"]
        }
      },
      {
        title: "New Customer Welcome",
        subtitle: "Welcome to Killo!",
        description: "First time shopping with us? Get 30% off your first medicine order. Start your health journey with savings!",
        discountType: "PERCENTAGE" as const,
        discountValue: 30,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days from now
        imageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=500&h=300&fit=crop",
        bannerImageUrl: "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=1200&h=400&fit=crop",
        isActive: true,
        maxUses: 500,
        pharmacyId: null, // Available for all pharmacies
        conditions: {
          minOrderAmount: 1000,
          firstTimeCustomer: true,
          validPaymentMethods: ["card", "wallet"]
        },
        targetAudience: {
          userTypes: ["customer"],
          newCustomers: true,
          locations: ["Lagos", "Abuja", "Kano", "Ibadan"]
        }
      },
      {
        title: "Weekend Wellness",
        subtitle: "Healthy weekends ahead!",
        description: "Enjoy 20% off on all wellness products every weekend. Take care of your health while saving money.",
        discountType: "PERCENTAGE" as const,
        discountValue: 20,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days from now
        imageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=500&h=300&fit=crop",
        bannerImageUrl: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1f?w=1200&h=400&fit=crop",
        isActive: true,
        maxUses: 2000,
        pharmacyId: pharmacies.length > 1 ? pharmacies[1].id : null,
        conditions: {
          minOrderAmount: 1500,
          validDays: ["saturday", "sunday"],
          categories: ["wellness", "supplements", "vitamins"]
        },
        targetAudience: {
          userTypes: ["customer"],
          locations: ["Lagos", "Abuja", "Port Harcourt", "Kano"],
          preferences: ["wellness", "health"]
        }
      },
      {
        title: "Emergency Medicine Relief",
        subtitle: "Quick relief, great savings!",
        description: "Get ₦500 off on emergency medicines. When you need relief fast, we've got you covered with instant savings.",
        discountType: "FIXED_AMOUNT" as const,
        discountValue: 500,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        imageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=500&h=300&fit=crop",
        bannerImageUrl: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=1200&h=400&fit=crop",
        isActive: true,
        maxUses: 800,
        pharmacyId: pharmacies.length > 2 ? pharmacies[2].id : null,
        conditions: {
          minOrderAmount: 1000,
          categories: ["pain_relief", "fever", "cold_cough"],
          maxDiscount: 500
        },
        targetAudience: {
          userTypes: ["customer"],
          locations: ["Lagos", "Abuja"],
          urgency: "high"
        }
      },
      {
        title: "Family Health Package",
        subtitle: "Health for the whole family!",
        description: "Special discount for family medicine purchases. Keep your loved ones healthy with our family health package offer.",
        discountType: "PERCENTAGE" as const,
        discountValue: 15,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days from now
        imageUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=500&h=300&fit=crop",
        bannerImageUrl: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1200&h=400&fit=crop",
        isActive: true,
        maxUses: 300,
        pharmacyId: null, // Available for all pharmacies
        conditions: {
          minOrderAmount: 5000,
          minItems: 3,
          familyPackage: true,
          validPaymentMethods: ["card", "bank_transfer"]
        },
        targetAudience: {
          userTypes: ["customer"],
          familySize: "large",
          locations: ["Lagos", "Abuja", "Port Harcourt", "Kano", "Ibadan"]
        }
      }
    ]

    // Create the special offers
    const createdOffers = await Promise.all(
      specialOffers.map(async (offerData) => {
        const offer = await prisma.specialOffer.create({
          data: {
            ...offerData,
            conditions: offerData.conditions as any,
            targetAudience: offerData.targetAudience as any
          }
        })
        return offer
      })
    )

    console.log('✅ Special offers seeded successfully!')
    console.log(`📊 Created ${createdOffers.length} special offers:`)
    
    createdOffers.forEach((offer, index) => {
      const pharmacyName = offer.pharmacyId 
        ? pharmacies.find(p => p.id === offer.pharmacyId)?.pharmacyName || "Unknown"
        : "All Pharmacies"
      
      console.log(`   ${index + 1}. ${offer.title} - ${offer.discountType === 'PERCENTAGE' ? `${offer.discountValue}%` : `₦${offer.discountValue}`} off (${pharmacyName})`)
    })

    console.log('\n🎯 Offer Details:')
    console.log('   • Summer Medicine Sale: 25% off, 90 days valid, 1000 max uses')
    console.log('   • New Customer Welcome: 30% off, 60 days valid, 500 max uses')
    console.log('   • Weekend Wellness: 20% off weekends, 120 days valid, 2000 max uses')
    console.log('   • Emergency Medicine Relief: ₦500 off, 30 days valid, 800 max uses')
    console.log('   • Family Health Package: 15% off, 180 days valid, 300 max uses')

    console.log('\n💡 Note: You can update the image URLs in the admin panel to use your own images!')

    return createdOffers
  } catch (error) {
    console.error('❌ Error during special offers seeding:', error)
    throw error
  }
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
