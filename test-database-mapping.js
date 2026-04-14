// Test database mapping function directly
const { findMatchingMedicines } = require('./lib/virtual-doctor/database-mapping.ts');

async function testDatabaseMapping() {
  try {
    console.log('🔍 Testing Database Mapping Function...\n');
    
    // Test with fever as illness
    console.log('Test 1: Searching for fever medicines');
    const result1 = await findMatchingMedicines(['fever'], [], []);
    console.log(`Found ${result1.length} medicines for fever:`);
    result1.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Dosage: ${med.dosage}`);
      console.log(`      - Confidence: ${med.confidence}`);
      console.log(`      - Reason: ${med.matchReason}`);
      console.log('');
    });
    
    // Test with fever as symptom
    console.log('Test 2: Searching for fever as symptom');
    const result2 = await findMatchingMedicines([], [], ['fever']);
    console.log(`Found ${result2.length} medicines for fever symptom:`);
    result2.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Dosage: ${med.dosage}`);
      console.log(`      - Confidence: ${med.confidence}`);
      console.log(`      - Reason: ${med.matchReason}`);
      console.log('');
    });
    
    // Test with both
    console.log('Test 3: Searching for fever as both illness and symptom');
    const result3 = await findMatchingMedicines(['fever'], [], ['fever']);
    console.log(`Found ${result3.length} medicines for fever (both):`);
    result3.forEach((med, index) => {
      console.log(`   ${index + 1}. ${med.name}`);
      console.log(`      - Generic: ${med.genericName}`);
      console.log(`      - Dosage: ${med.dosage}`);
      console.log(`      - Confidence: ${med.confidence}`);
      console.log(`      - Reason: ${med.matchReason}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Database mapping test failed:', error);
  }
}

testDatabaseMapping();


