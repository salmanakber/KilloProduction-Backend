// Test Prisma query directly
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testPrismaQuery() {
  try {
    console.log('🔍 Testing Prisma Query for Fever...\n');
    
    // Test simple query that we know works
    const results = await prisma.centralMedicine.findMany({
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
    
    console.log(`Found ${results.length} medicines for fever:`);
    results.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Illness Types: ${JSON.stringify(med.illnessTypes)}`);
      console.log(`      - Description: ${med.description}`);
      console.log('');
    });
    
    // Test with different query approach
    console.log('\n🔍 Testing Alternative Query...');
    const results2 = await prisma.centralMedicine.findMany({
      where: {
        isActive: true,
        illnessTypes: {
          has: 'fever'
        }
      },
      take: 5
    });
    
    console.log(`Found ${results2.length} medicines with has: 'fever':`);
    results2.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Illness Types: ${JSON.stringify(med.illnessTypes)}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Prisma query test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPrismaQuery();
