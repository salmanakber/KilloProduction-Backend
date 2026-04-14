// Test fever medicines query
const fetch = require('node-fetch');

async function testFeverMedicines() {
  try {
    console.log('🌡️ Testing Fever Medicines Query...\n');
    
    const response = await fetch('http://localhost:3000/api/pharmacy/VirtualDoctor', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        textInput: 'I need fever medicines'
      }),
    });
    
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Response received');
      console.log('Processing Info:', JSON.stringify(data.processing_info, null, 2));
      console.log('Diagnosis:', data.diagnosis);
      console.log('Medicines Found:', data.recommended_medicines?.length || 0);
      
      if (data.recommended_medicines && data.recommended_medicines.length > 0) {
        console.log('\n💊 Recommended Medicines:');
        data.recommended_medicines.forEach((med, index) => {
          console.log(`   ${index + 1}. ${med.name}`);
          console.log(`      - Generic: ${med.genericName || 'N/A'}`);
          console.log(`      - Dosage: ${med.dosage}`);
          console.log(`      - Confidence: ${med.confidence}`);
          console.log(`      - Reason: ${med.matchReason}`);
          console.log('');
        });
      } else {
        console.log('❌ No medicines found');
      }
      
      console.log('\n📝 Notes:');
      console.log('English:', data.notes?.english || 'No notes');
      console.log('Hausa:', data.notes?.hausa || 'No notes');
      console.log('Yoruba:', data.notes?.yoruba || 'No notes');
      
    } else {
      const errorText = await response.text();
      console.log('❌ Error Response:', errorText.substring(0, 1000) + '...');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFeverMedicines();


