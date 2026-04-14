// Test database query for fever medicines
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testDatabaseFever() {
  try {
    console.log('🔍 Testing Database Query for Fever Medicines...\n');
    
    // Test 1: Query by illnessTypes containing "fever"
    console.log('Test 1: Query by illnessTypes containing "fever"');
    const results1 = await prisma.centralMedicine.findMany({
      where: {
        AND: [
          { isActive: true },
          {
            OR: [
              {
                illnessTypes: {
                  path: ['$'],
                  array_contains: ['fever']
                }
              },
              {
                illnessTypes: {
                  path: ['$'],
                  array_contains: ['FEVER']
                }
              }
            ]
          }
        ]
      },
      take: 5
    });
    
    console.log(`Found ${results1.length} medicines with "fever" in illnessTypes:`);
    results1.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Illness Types: ${JSON.stringify(med.illnessTypes)}`);
      console.log(`      - Description: ${med.description}`);
      console.log('');
    });
    
    // Test 2: Query by name containing "fever"
    console.log('Test 2: Query by name containing "fever"');
    const results2 = await prisma.centralMedicine.findMany({
      where: {
        AND: [
          { isActive: true },
          {
            name: {
              contains: 'fever',
              mode: 'insensitive'
            }
          }
        ]
      },
      take: 5
    });
    
    console.log(`Found ${results2.length} medicines with "fever" in name:`);
    results2.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log('');
    });
    
    // Test 3: Query by description containing "fever"
    console.log('Test 3: Query by description containing "fever"');
    const results3 = await prisma.centralMedicine.findMany({
      where: {
        AND: [
          { isActive: true },
          {
            description: {
              contains: 'fever',
              mode: 'insensitive'
            }
          }
        ]
      },
      take: 5
    });
    
    console.log(`Found ${results3.length} medicines with "fever" in description:`);
    results3.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Description: ${med.description}`);
      console.log('');
    });
    
    // Test 4: Get all medicines to see what's in the database
    console.log('Test 4: Get all active medicines');
    const allMedicines = await prisma.centralMedicine.findMany({
      where: { isActive: true },
      take: 10,
      select: {
        name: true,
        genericName: true,
        illnessTypes: true,
        description: true
      }
    });
    
    console.log(`Found ${allMedicines.length} active medicines in database:`);
    allMedicines.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Illness Types: ${JSON.stringify(med.illnessTypes)}`);
      console.log(`      - Description: ${med.description}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseFever();
