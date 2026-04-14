// Test NLP debugging
const { simpleNLP } = require('./lib/virtual-doctor/simple-fallback.ts');

async function testNLPDebug() {
  try {
    console.log('🧠 Testing NLP Debug...\n');
    
    const testText = 'I need fever medicines';
    console.log('Input text:', testText);
    
    const result = await simpleNLP(testText);
    console.log('NLP Result:', JSON.stringify(result, null, 2));
    
    console.log('\n📊 Analysis:');
    console.log('Symptoms found:', result.symptoms);
    console.log('Illnesses found:', result.illnesses);
    console.log('Medicines found:', result.medicines);
    console.log('Confidence:', result.confidence);
    console.log('Source:', result.source);
    
  } catch (error) {
    console.error('❌ NLP test failed:', error);
  }
}

testNLPDebug();
