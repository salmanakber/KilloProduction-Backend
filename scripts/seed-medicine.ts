import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 🏥 PHARMACY ID - Change this to your pharmacy ID
const PHARMACY_ID = 'cmew8yvwv000g111jnt2qofo7';

// 💊 MEDICINES ARRAY - Add your medicines here
const medicines = [
  {
    // CentralMedicine data
    centralMedicine: {
      name: 'Paracetamol',
      genericName: 'Acetaminophen',
      description: 'Pain reliever and fever reducer',
      purpose: 'Used to treat mild to moderate pain and reduce fever',
      dosageInfo: 'Adults: 500-1000mg every 4-6 hours as needed. Maximum 4000mg per day.',
      warnings: 'Do not exceed recommended dose. Consult doctor if symptoms persist.',
      sideEffects: {
        common: ['Nausea', 'Stomach upset'],
        rare: ['Allergic reactions', 'Liver damage with overdose']
      },
      category: 'Analgesic',
      illnessTypes: ['Headache', 'Fever', 'Pain', 'Cold', 'Flu'],
      activeIngredients: ['Paracetamol 500mg'],
      form: 'TABLET' as const,
      strength: '500mg',
      manufacturer: 'Generic Pharmaceuticals',
      images: {
        primary: 'https://via.placeholder.com/300x300?text=Paracetamol+500mg',
        secondary: []
      },
      isActive: true
    },
    // PharmacyMedicine data
    pharmacyMedicine: {
      price: 15.50,
      stock: 100,
      minStock: 20,
      isAvailable: true,
      lastRestocked: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
      batchNumber: 'PAR-2024-001',
      supplierInfo: 'MedSupply Co.',
      lastSupplierId: null,
      lastSupplierOrderId: null
    }
  },
  // Add more medicines here by copying the structure above
  // {
  //   centralMedicine: {
  //     name: 'Ibuprofen',
  //     genericName: 'Ibuprofen',
  //     description: 'Anti-inflammatory pain reliever',
  //     purpose: 'Used to treat pain, inflammation, and fever',
  //     dosageInfo: 'Adults: 200-400mg every 4-6 hours as needed.',
  //     warnings: 'Take with food to avoid stomach upset.',
  //     sideEffects: {
  //       common: ['Stomach upset', 'Heartburn'],
  //       rare: ['Stomach bleeding', 'Kidney problems']
  //     },
  //     category: 'NSAID',
  //     illnessTypes: ['Pain', 'Inflammation', 'Fever', 'Arthritis'],
  //     activeIngredients: ['Ibuprofen 400mg'],
  //     form: 'TABLET' as const,
  //     strength: '400mg',
  //     manufacturer: 'Generic Pharmaceuticals',
  //     images: {
  //       primary: 'https://via.placeholder.com/300x300?text=Ibuprofen+400mg',
  //       secondary: []
  //     },
  //     isActive: true
  //   },
  //   pharmacyMedicine: {
  //     price: 18.75,
  //     stock: 75,
  //     minStock: 15,
  //     isAvailable: true,
  //     lastRestocked: new Date(),
  //     expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  //     batchNumber: 'IBU-2024-001',
  //     supplierInfo: 'MedSupply Co.',
  //     lastSupplierId: null,
  //     lastSupplierOrderId: null
  //   }
  // }
];

async function seedMedicine() {
  try {
    console.log('🌱 Starting medicine seed...');
    console.log(`📋 Processing ${medicines.length} medicine(s) for pharmacy: ${PHARMACY_ID}`);

    const results = [];

    for (let i = 0; i < medicines.length; i++) {
      const medicine = medicines[i];
      console.log(`\n💊 Processing medicine ${i + 1}/${medicines.length}: ${medicine.centralMedicine.name}`);

      // Create CentralMedicine
      const centralMedicine = await prisma.centralMedicine.create({
        data: medicine.centralMedicine
      });

      console.log('✅ Created CentralMedicine:', centralMedicine.id);

      // Create PharmacyMedicine
      const pharmacyMedicine = await prisma.pharmacyMedicine.create({
        data: {
          ...medicine.pharmacyMedicine,
          pharmacyId: PHARMACY_ID,
          centralMedicineId: centralMedicine.id
        }
      });

      console.log('✅ Created PharmacyMedicine:', pharmacyMedicine.id);

      results.push({
        centralMedicine,
        pharmacyMedicine
      });
    }

    // Verify the data was created correctly
    console.log('\n🔍 Verification:');
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const verification = await prisma.pharmacyMedicine.findUnique({
        where: {
          id: result.pharmacyMedicine.id
        },
        include: {
          centralMedicine: true,
          pharmacy: {
            select: {
              id: true,
              pharmacyName: true
            }
          }
        }
      });

      console.log(`\n📋 Medicine ${i + 1}:`);
      console.log('  Pharmacy:', verification?.pharmacy.pharmacyName);
      console.log('  Medicine:', verification?.centralMedicine.name);
      console.log('  Price:', verification?.price);
      console.log('  Stock:', verification?.stock);
      console.log('  Available:', verification?.isAvailable);
    }

    console.log('\n🎉 Medicine seed completed successfully!');
    console.log(`✅ Created ${results.length} medicine(s) for pharmacy: ${PHARMACY_ID}`);

    return results;

  } catch (error) {
    console.error('❌ Error seeding medicine:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function if this file is executed directly
if (require.main === module) {
  seedMedicine()
    .then(() => {
      console.log('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export default seedMedicine;
