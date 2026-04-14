// Test Google Gemini JSON parsing
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGeminiJSON() {
  try {
    console.log('🔍 Testing Google Gemini JSON parsing...\n');
    
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    if (!apiKey) {
      console.log('❌ GOOGLE_GEMINI_API_KEY not found');
      return;
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `
Analyze the following medical text and extract:
1. Symptoms mentioned
2. Possible illnesses/conditions
3. Medications mentioned
4. Dosage information if present

Text: "I have a severe headache, high fever, and body aches. I think I might have the flu."

Return a JSON response with this structure:
{
  "symptoms": ["symptom1", "symptom2"],
  "illnesses": ["illness1", "illness2"],
  "medicines": ["medicine1", "medicine2"],
  "dosage": "dosage info if found"
}

Be conservative and only include clearly mentioned items. Use medical terminology when possible.
`;

    console.log('🔄 Sending request to Gemini...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    console.log('✅ Raw Gemini Response:');
    console.log(responseText);
    console.log('\n🔄 Cleaning response and parsing JSON...');
    
    // Clean the response text (remove markdown code blocks if present)
    let cleanText = responseText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log('🧹 Cleaned text:', cleanText);
    
    try {
      const parsed = JSON.parse(cleanText);
      console.log('✅ JSON parsed successfully:');
      console.log(JSON.stringify(parsed, null, 2));
    } catch (parseError) {
      console.log('❌ JSON parsing failed:', parseError.message);
      console.log('Cleaned text that failed to parse:', cleanText);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testGeminiJSON();
