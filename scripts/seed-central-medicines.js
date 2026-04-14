const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function seedCentralMedicines() {
  try {
    console.log('🌱 Seeding central medicines...')

    // First, ensure we have some medicine origins
    const medicineOrigins = await Promise.all([
      prisma.medicineOrigin.upsert({
        where: { name: 'GENERIC' },
        update: {},
        create: {
          name: 'GENERIC',
          displayName: 'Generic Medicines',
          description: 'Generic pharmaceutical products'
        }
      }),
      prisma.medicineOrigin.upsert({
        where: { name: 'NIGERIAN' },
        update: {},
        create: {
          name: 'NIGERIAN',
          displayName: 'Nigerian Medicines',
          description: 'Medicines manufactured in Nigeria'
        }
      }),
      prisma.medicineOrigin.upsert({
        where: { name: 'INDIAN' },
        update: {},
        create: {
          name: 'INDIAN',
          displayName: 'Indian Medicines',
          description: 'Medicines manufactured in India'
        }
      })
    ])

    console.log('✅ Medicine origins created/updated')

    // Create some central medicines
    const medicines = [
      {
        name: 'Paracetamol 500mg',
        genericName: 'Acetaminophen',
        description: 'Pain reliever and fever reducer',
        purpose: 'Relieves pain and reduces fever',
        category: 'Analgesic',
        form: 'TABLET',
        strength: '500mg',
        manufacturer: 'Generic Pharma',
        illnessTypes: ['fever', 'headache', 'pain'],
        medicineOriginIds: [medicineOrigins[0].id, medicineOrigins[1].id] // Generic and Nigerian
      },
      {
        name: 'Amoxicillin 250mg',
        genericName: 'Amoxicillin',
        description: 'Antibiotic for bacterial infections',
        purpose: 'Treats bacterial infections',
        category: 'Antibiotic',
        form: 'CAPSULE',
        strength: '250mg',
        manufacturer: 'MediCorp',
        illnessTypes: ['infection', 'bacterial'],
        medicineOriginIds: [medicineOrigins[0].id, medicineOrigins[2].id] // Generic and Indian
      },
      {
        name: 'Ibuprofen 400mg',
        genericName: 'Ibuprofen',
        description: 'Non-steroidal anti-inflammatory drug',
        purpose: 'Relieves pain, inflammation, and fever',
        category: 'NSAID',
        form: 'TABLET',
        strength: '400mg',
        manufacturer: 'HealthPharm',
        illnessTypes: ['pain', 'inflammation', 'fever'],
        medicineOriginIds: [medicineOrigins[0].id] // Generic only
      },
      {
        name: 'Vitamin C 1000mg',
        genericName: 'Ascorbic Acid',
        description: 'Vitamin C supplement',
        purpose: 'Boosts immune system and prevents scurvy',
        category: 'Vitamin',
        form: 'TABLET',
        strength: '1000mg',
        manufacturer: 'NutriCorp',
        illnessTypes: ['vitamin_deficiency', 'immunity'],
        medicineOriginIds: [medicineOrigins[0].id, medicineOrigins[1].id] // Generic and Nigerian
      },
      {
        name: 'Omeprazole 20mg',
        genericName: 'Omeprazole',
        description: 'Proton pump inhibitor for acid reflux',
        purpose: 'Reduces stomach acid production',
        category: 'PPI',
        form: 'CAPSULE',
        strength: '20mg',
        manufacturer: 'DigestPharm',
        illnessTypes: ['acid_reflux', 'ulcer', 'heartburn'],
        medicineOriginIds: [medicineOrigins[0].id, medicineOrigins[2].id] // Generic and Indian
      }
    ]

    for (const medicineData of medicines) {
      const { medicineOriginIds, ...medicineInfo } = medicineData
      
      const medicine = await prisma.centralMedicine.create({
        data: {
          ...medicineInfo,
          isActive: true,
          dosageInfo: 'Take as directed by your doctor',
          warnings: 'Consult your doctor before use',
          sideEffects: ['May cause mild side effects'],
          images: []
        }
      })

      // Create medicine origin relationships
      for (const originId of medicineOriginIds) {
        await prisma.centralMedicineOrigin.create({
          data: {
            centralMedicineId: medicine.id,
            medicineOriginId: originId
          }
        })
      }

      console.log(`✅ Created medicine: ${medicine.name}`)
    }

    console.log('🎉 Central medicines seeding completed!')
  } catch (error) {
    console.error('❌ Error seeding central medicines:', error)
  } finally {
    await prisma.$disconnect()
  }
}

seedCentralMedicines()
