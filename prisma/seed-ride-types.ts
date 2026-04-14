import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Starting ride types seeding...")

  // Check if ride types already exist
  const existingRideTypes = await prisma.rideType.findMany()
  if (existingRideTypes.length > 0) {
    console.log(`⚠️  Found ${existingRideTypes.length} existing ride types. Skipping creation.`)
    console.log("Existing ride types:")
    existingRideTypes.forEach(rt => {
      console.log(`- ${rt.name} (${rt.vehicleType})`)
    })
    return
  }

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

  console.log("✅ Ride types seeding completed successfully!")
  console.log(`Created ${rideTypes.length} ride types:`)
  rideTypes.forEach(rt => {
    console.log(`- ${rt.name} (${rt.vehicleType}): ₦${rt.basePrice} base + ₦${rt.pricePerKm}/km`)
  })
}

main()
  .catch((e) => {
    console.error("❌ Error during ride types seeding:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
