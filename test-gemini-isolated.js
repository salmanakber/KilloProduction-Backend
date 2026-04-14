// Isolated test for Google Gemini API
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGeminiIsolated() {
  try {
    console.log('🔍 Testing Google Gemini API in isolation...\n');
    
    // Check if API key is loaded
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
    console.log('API Key loaded:', !!apiKey);
    console.log('API Key length:', apiKey ? apiKey.length : 0);
    console.log('API Key starts with:', apiKey ? apiKey.substring(0, 10) + '...' : 'N/A');
    
    if (!apiKey) {
      console.log('❌ GOOGLE_GEMINI_API_KEY not found in environment variables');
      return;
    }
    
    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('✅ GoogleGenerativeAI initialized successfully');
    
    // Test with a simple prompt
    const prompt = 'Extract symptoms from this text: "I have a headache and fever"';
    
    console.log('🔄 Sending request to Gemini...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('✅ Gemini Response:', text);
    
  } catch (error) {
    console.error('❌ Gemini test failed:', error.message);
    console.error('Error details:', error);
  }
}

testGeminiIsolated();
