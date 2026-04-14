import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function seedServiceAreas() {
  console.log('🌱 Seeding service areas...')

  try {
    // Create global polygon service area
    const karachiCentral = await prisma.serviceArea.create({
      data: {
        name: 'Karachi Central (Global)',
        type: 'POLYGON',
        isActive: true,
        priority: 1,
        isGlobal: true, // This is a global area available to all riders
        riderId: null,
        polygon: {
          create: {
            name: 'Karachi Central (Global)',
            points: [
              { latitude: 24.8567, longitude: 67.0011 },
              { latitude: 24.8667, longitude: 67.0111 },
              { latitude: 24.8467, longitude: 67.0211 },
              { latitude: 24.8367, longitude: 67.0011 },
            ],
            color: '#FF6B6B',
            serviceTypes: ['courier', 'ride', 'delivery'],
            maxDistance: 15,
          },
        },
      },
    })

    console.log('✅ Created global polygon service area:', karachiCentral.name)

    // Create global grid service area
    const karachiGrid = await prisma.serviceArea.create({
      data: {
        name: 'Karachi Grid (Global)',
        type: 'GRID',
        isActive: true,
        priority: 2,
        isGlobal: true, // This is a global area available to all riders
        riderId: null,
        gridCells: {
          create: [
            // Grid cell 1
            {
              cellId: 'grid_24.85_67.00',
              center: { latitude: 24.85, longitude: 67.00 },
              size: 2,
              bounds: {
                north: 24.86,
                south: 24.84,
                east: 67.01,
                west: 66.99,
              },
              serviceTypes: ['courier', 'ride', 'delivery'],
              maxDistance: 3,
            },
            // Grid cell 2
            {
              cellId: 'grid_24.87_67.01',
              center: { latitude: 24.87, longitude: 67.01 },
              size: 2,
              bounds: {
                north: 24.88,
                south: 24.86,
                east: 67.02,
                west: 67.00,
              },
              serviceTypes: ['courier', 'ride', 'delivery'],
              maxDistance: 3,
            },
            // Grid cell 3
            {
              cellId: 'grid_24.85_67.02',
              center: { latitude: 24.85, longitude: 67.02 },
              size: 2,
              bounds: {
                north: 24.86,
                south: 24.84,
                east: 67.03,
                west: 67.01,
              },
              serviceTypes: ['courier', 'ride', 'delivery'],
              maxDistance: 3,
            },
          ],
        },
      },
    })

    console.log('✅ Created global grid service area:', karachiGrid.name)

    // Create another global polygon for testing
    const karachiNorth = await prisma.serviceArea.create({
      data: {
        name: 'Karachi North (Global)',
        type: 'POLYGON',
        isActive: true,
        priority: 3,
        isGlobal: true, // This is a global area available to all riders
        riderId: null,
        polygon: {
          create: {
            name: 'Karachi North',
            points: [
              { latitude: 24.8767, longitude: 67.0011 },
              { latitude: 24.8867, longitude: 67.0111 },
              { latitude: 24.8667, longitude: 67.0211 },
              { latitude: 24.8567, longitude: 67.0011 },
            ],
            color: '#4ECDC4',
            serviceTypes: ['courier', 'ride'],
            maxDistance: 12,
          },
        },
      },
    })

    console.log('✅ Created global north polygon service area:', karachiNorth.name)

    console.log('🎉 Global service areas seeded successfully!')
    console.log('📝 Note: Riders can now create their own personal service areas using the app.')
  } catch (error) {
    console.error('❌ Error seeding service areas:', error)
    throw error
  }
}

async function main() {
  await seedServiceAreas()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
