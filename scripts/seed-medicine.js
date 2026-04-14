const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 🏥 PHARMACY ID - Change this to your pharmacy ID
const PHARMACY_ID = 'cmew8yvwv000g111jnt2qofo7';

// 💊 MEDICINES ARRAY - Add your medicines here
const medicines = [
    // your existing Paracetamol object here...
    {
        centralMedicine: {
          name: 'Losartan',
          genericName: 'Losartan Potassium',
          description: 'Angiotensin II receptor blocker (ARB)',
          purpose: 'Used to treat high blood pressure and protect kidneys',
          dosageInfo: '50mg once daily. Adjust as directed by physician.',
          warnings: 'Avoid during pregnancy. Monitor potassium levels.',
          sideEffects: {
            common: ['Dizziness', 'Fatigue'],
            rare: ['High potassium', 'Kidney dysfunction']
          },
          category: 'Antihypertensive',
          illnessTypes: ['High blood pressure', 'Kidney protection'],
          activeIngredients: ['Losartan Potassium 50mg'],
          form: 'TABLET',
          strength: '50mg',
          manufacturer: 'Merck',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Losartan+50mg'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 22.5,
          stock: 90,
          minStock: 25,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 360 * 24 * 60 * 60 * 1000),
          batchNumber: 'LOS-2024-011',
          supplierInfo: 'CardioMed Supply'
        }
      },
      {
        centralMedicine: {
          name: 'Atorvastatin',
          genericName: 'Atorvastatin Calcium',
          description: 'Statin used to lower cholesterol',
          purpose: 'Used to reduce bad cholesterol and triglycerides',
          dosageInfo: '10-20mg once daily in the evening.',
          warnings: 'Avoid alcohol. Monitor liver enzymes.',
          sideEffects: {
            common: ['Muscle pain', 'Nausea'],
            rare: ['Liver damage', 'Muscle breakdown']
          },
          category: 'Lipid-lowering agent',
          illnessTypes: ['High cholesterol', 'Heart disease prevention'],
          activeIngredients: ['Atorvastatin Calcium 20mg'],
          form: 'TABLET',
          strength: '20mg',
          manufacturer: 'Pfizer',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Atorvastatin+20mg'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 25.0,
          stock: 70,
          minStock: 20,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 500 * 24 * 60 * 60 * 1000),
          batchNumber: 'ATO-2024-012',
          supplierInfo: 'HeartCare Meds'
        }
      },
      {
        centralMedicine: {
          name: 'Clotrimazole Cream',
          genericName: 'Clotrimazole',
          description: 'Antifungal cream',
          purpose: 'Used for skin fungal infections like athlete’s foot',
          dosageInfo: 'Apply thin layer twice daily to affected area.',
          warnings: 'For external use only. Avoid contact with eyes.',
          sideEffects: {
            common: ['Mild itching', 'Redness'],
            rare: ['Rash']
          },
          category: 'Antifungal',
          illnessTypes: ['Fungal infection', 'Athlete’s foot', 'Ringworm'],
          activeIngredients: ['Clotrimazole 1%'],
          form: 'CREAM',
          strength: '1%',
          manufacturer: 'Bayer',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Clotrimazole+Cream'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 12.0,
          stock: 50,
          minStock: 10,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 280 * 24 * 60 * 60 * 1000),
          batchNumber: 'CLO-2024-013',
          supplierInfo: 'DermCare Pharma'
        }
      },
      {
        centralMedicine: {
          name: 'Vitamin C',
          genericName: 'Ascorbic Acid',
          description: 'Essential vitamin for immunity',
          purpose: 'Used to boost immunity and treat vitamin C deficiency',
          dosageInfo: '500mg once daily with water.',
          warnings: 'Avoid excessive dosage; may cause stomach upset.',
          sideEffects: {
            common: ['Heartburn', 'Nausea'],
            rare: ['Kidney stones']
          },
          category: 'Supplement',
          illnessTypes: ['Weak immunity', 'Cold prevention'],
          activeIngredients: ['Ascorbic Acid 500mg'],
          form: 'TABLET',
          strength: '500mg',
          manufacturer: 'NatureMade',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Vitamin+C+500mg'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 15.0,
          stock: 120,
          minStock: 25,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 450 * 24 * 60 * 60 * 1000),
          batchNumber: 'VITC-2024-014',
          supplierInfo: 'NutriLife Co.'
        }
      },
      {
        centralMedicine: {
          name: 'Multivitamin',
          genericName: 'Multivitamin Supplement',
          description: 'Combination of essential vitamins and minerals',
          purpose: 'Used to improve overall health and energy',
          dosageInfo: '1 tablet daily after meal.',
          warnings: 'Do not exceed recommended dose.',
          sideEffects: {
            common: ['Mild nausea'],
            rare: ['Allergic reaction']
          },
          category: 'Supplement',
          illnessTypes: ['Vitamin deficiency', 'Fatigue', 'General wellness'],
          activeIngredients: ['Vitamin A', 'Vitamin D', 'B complex', 'Iron'],
          form: 'TABLET',
          strength: 'Standard',
          manufacturer: 'Centrum',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Multivitamin'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 28.0,
          stock: 100,
          minStock: 20,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 600 * 24 * 60 * 60 * 1000),
          batchNumber: 'MUL-2024-015',
          supplierInfo: 'Wellness Pharma'
        }
      },
      {
        centralMedicine: {
          name: 'Diazepam',
          genericName: 'Diazepam',
          description: 'Benzodiazepine for anxiety relief',
          purpose: 'Used for anxiety, muscle spasms, and insomnia',
          dosageInfo: '5mg once or twice daily as prescribed.',
          warnings: 'Can cause dependency; use only under medical supervision.',
          sideEffects: {
            common: ['Drowsiness', 'Fatigue'],
            rare: ['Dependence', 'Memory issues']
          },
          category: 'Anxiolytic',
          illnessTypes: ['Anxiety', 'Insomnia', 'Muscle spasms'],
          activeIngredients: ['Diazepam 5mg'],
          form: 'TABLET',
          strength: '5mg',
          manufacturer: 'Roche',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Diazepam+5mg'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 30.0,
          stock: 40,
          minStock: 10,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 200 * 24 * 60 * 60 * 1000),
          batchNumber: 'DIA-2024-016',
          supplierInfo: 'CalmCare Pharma'
        }
      },
      {
        centralMedicine: {
          name: 'Hydrocortisone Cream',
          genericName: 'Hydrocortisone',
          description: 'Mild steroid cream for inflammation and itching',
          purpose: 'Used for eczema, insect bites, and rashes',
          dosageInfo: 'Apply thin layer twice daily to affected area.',
          warnings: 'Do not use on broken skin for long periods.',
          sideEffects: {
            common: ['Mild irritation'],
            rare: ['Skin thinning']
          },
          category: 'Corticosteroid',
          illnessTypes: ['Eczema', 'Rash', 'Allergic reaction'],
          activeIngredients: ['Hydrocortisone 1%'],
          form: 'CREAM',
          strength: '1%',
          manufacturer: 'GSK',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Hydrocortisone+Cream'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 14.0,
          stock: 55,
          minStock: 10,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 240 * 24 * 60 * 60 * 1000),
          batchNumber: 'HYD-2024-017',
          supplierInfo: 'SkinMed Supply'
        }
      },
      {
        centralMedicine: {
          name: 'Loperamide',
          genericName: 'Loperamide Hydrochloride',
          description: 'Anti-diarrheal medication',
          purpose: 'Used to control acute diarrhea',
          dosageInfo: '2mg after each loose stool, max 8mg per day.',
          warnings: 'Not for use in children under 12.',
          sideEffects: {
            common: ['Constipation'],
            rare: ['Abdominal pain']
          },
          category: 'Antidiarrheal',
          illnessTypes: ['Diarrhea', 'Stomach upset'],
          activeIngredients: ['Loperamide Hydrochloride 2mg'],
          form: 'CAPSULE',
          strength: '2mg',
          manufacturer: 'Johnson & Johnson',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Loperamide+2mg'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 9.5,
          stock: 90,
          minStock: 20,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000),
          batchNumber: 'LOP-2024-018',
          supplierInfo: 'GastroMed Distributors'
        }
      },
      {
        centralMedicine: {
          name: 'Salbutamol Inhaler',
          genericName: 'Salbutamol Sulfate',
          description: 'Bronchodilator for asthma relief',
          purpose: 'Used for short-term relief of wheezing and shortness of breath',
          dosageInfo: '1-2 puffs as needed. Max 4 times daily.',
          warnings: 'Overuse may reduce effectiveness.',
          sideEffects: {
            common: ['Tremor', 'Increased heart rate'],
            rare: ['Palpitations']
          },
          category: 'Bronchodilator',
          illnessTypes: ['Asthma', 'Wheezing', 'COPD'],
          activeIngredients: ['Salbutamol Sulfate 100mcg'],
          form: 'INHALER',
          strength: '100mcg',
          manufacturer: 'GSK',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Salbutamol+Inhaler'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 35.0,
          stock: 60,
          minStock: 10,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 420 * 24 * 60 * 60 * 1000),
          batchNumber: 'SAL-2024-019',
          supplierInfo: 'RespiraMed'
        }
      },
      {
        centralMedicine: {
          name: 'Iron Supplement',
          genericName: 'Ferrous Sulfate',
          description: 'Iron supplement to treat anemia',
          purpose: 'Used to treat and prevent iron deficiency anemia',
          dosageInfo: '325mg once daily with water or juice.',
          warnings: 'May cause constipation or dark stools.',
          sideEffects: {
            common: ['Constipation', 'Stomach upset'],
            rare: ['Allergic reaction']
          },
          category: 'Supplement',
          illnessTypes: ['Anemia', 'Iron deficiency', 'Fatigue'],
          activeIngredients: ['Ferrous Sulfate 325mg'],
          form: 'TABLET',
          strength: '325mg',
          manufacturer: 'Nature’s Bounty',
          images: {
            primary: 'https://via.placeholder.com/300x300?text=Iron+Supplement'
          },
          isActive: true
        },
        pharmacyMedicine: {
          price: 18.0,
          stock: 100,
          minStock: 20,
          isAvailable: true,
          lastRestocked: new Date(),
          expiryDate: new Date(Date.now() + 500 * 24 * 60 * 60 * 1000),
          batchNumber: 'FER-2024-020',
          supplierInfo: 'NutriCare Supplies'
        }
      }
    
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
      console.log('  Pharmacy:', verification.pharmacy.pharmacyName);
      console.log('  Medicine:', verification.centralMedicine.name);
      console.log('  Price:', verification.price);
      console.log('  Stock:', verification.stock);
      console.log('  Available:', verification.isAvailable);
    }

    console.log('\n🎉 Medicine seed completed successfully!');
    console.log(`✅ Created ${results.length} medicine(s) for pharmacy: ${PHARMACY_ID}`);

  } catch (error) {
    console.error('❌ Error seeding medicine:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedMedicine()
  .then(() => {
    console.log('✅ Seed completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  });
