import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize OpenAI only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Initialize Google Gemini only if API key is available
const genAI = process.env.GOOGLE_GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY) : null;

export interface MedicalData {
  symptoms: string[];
  illnesses: string[];
  medicines: string[];
  dosage?: string;
  confidence: number;
  source: string;
}

/**
 * Parse medical data using Infermedica API
 */
export async function infermedicaNLP(text: string): Promise<MedicalData> {
  try {
    const response = await fetch('https://api.infermedica.com/v3/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'App-Id': process.env.INFERMEDICA_APP_ID!,
        'App-Key': process.env.INFERMEDICA_API_KEY!,
      },
      body: JSON.stringify({
        text: text,
        context: ['symptoms', 'risk_factors'],
        include_tokens: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Infermedica API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract symptoms and conditions from Infermedica response
    const symptoms = data.mentions
      ?.filter((mention: any) => mention.type === 'symptom')
      .map((mention: any) => mention.name) || [];
    
    const conditions = data.mentions
      ?.filter((mention: any) => mention.type === 'condition')
      .map((mention: any) => mention.name) || [];

    return {
      symptoms,
      illnesses: conditions,
      medicines: [],
      confidence: 0.85,
      source: 'Infermedica'
    };
  } catch (error) {
    console.error('Infermedica NLP failed:', error);
    throw new Error('Infermedica NLP failed');
  }
}

/**
 * Parse medical data using EndlessMedical API
 */
export async function endlessMedicalNLP(text: string): Promise<MedicalData> {
  try {
    const response = await fetch('https://api.endlessmedical.com/v1/dx', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.ENDLESSMEDICAL_API_KEY}`,
      },
      body: JSON.stringify({
        text: text,
        include_symptoms: true,
        include_conditions: true,
        include_medications: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`EndlessMedical API error: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      symptoms: data.symptoms || [],
      illnesses: data.conditions || [],
      medicines: data.medications || [],
      confidence: 0.8,
      source: 'EndlessMedical'
    };
  } catch (error) {
    console.error('EndlessMedical NLP failed:', error);
    throw new Error('EndlessMedical NLP failed');
  }
}

/**
 * Parse medical data using Azure Health Text Analytics
 */
export async function azureHealthNLP(text: string): Promise<MedicalData> {
  try {
    const response = await fetch(`${process.env.AZURE_HEALTH_ENDPOINT}/text/analytics/v3.1/entities/health`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': process.env.AZURE_HEALTH_API_KEY!,
      },
      body: JSON.stringify({
        documents: [{
          id: '1',
          text: text,
          language: 'en'
        }]
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure Health API error: ${response.status}`);
    }

    const data = await response.json();
    const document = data.documents?.[0];
    
    if (!document) {
      throw new Error('No document data from Azure Health API');
    }

    const symptoms: string[] = [];
    const illnesses: string[] = [];
    const medicines: string[] = [];

    document.entities?.forEach((entity: any) => {
      switch (entity.category) {
        case 'SymptomOrSign':
          symptoms.push(entity.text);
          break;
        case 'Diagnosis':
          illnesses.push(entity.text);
          break;
        case 'MedicationName':
          medicines.push(entity.text);
          break;
      }
    });

    return {
      symptoms,
      illnesses,
      medicines,
      confidence: 0.82,
      source: 'Azure Health Text Analytics'
    };
  } catch (error) {
    console.error('Azure Health NLP failed:', error);
    throw new Error('Azure Health NLP failed');
  }
}

/**
 * Parse medical data using Google Gemini
 */
export async function googleGeminiNLP(text: string): Promise<MedicalData> {
  if (!genAI) {
    throw new Error('Google Gemini API key not configured');
  }
  
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `
Analyze the following medical text and extract:
1. Symptoms mentioned
2. Possible illnesses/conditions
3. Medications mentioned
4. Dosage information if present

Text: "${text}"

Return a JSON response with this structure:
{
  "symptoms": ["symptom1", "symptom2"],
  "illnesses": ["illness1", "illness2"],
  "medicines": ["medicine1", "medicine2"],
  "dosage": "dosage info if found"
}

Be conservative and only include clearly mentioned items. Use medical terminology when possible.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
    if (!responseText) {
      throw new Error('No response from Google Gemini');
    }

    // Clean the response text (remove markdown code blocks if present)
    let cleanText = responseText.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Parse JSON response
    const parsed = JSON.parse(cleanText);
    
    return {
      symptoms: parsed.symptoms || [],
      illnesses: parsed.illnesses || [],
      medicines: parsed.medicines || [],
      dosage: parsed.dosage,
      confidence: 0.8,
      source: 'Google Gemini'
    };
  } catch (error) {
    console.error('Google Gemini NLP failed:', error);
    throw new Error('Google Gemini NLP failed');
  }
}

/**
 * Parse medical data using OpenAI GPT as fallback
 */
export async function openAIGPT(text: string): Promise<MedicalData> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    const prompt = `
Analyze the following medical text and extract:
1. Symptoms mentioned
2. Possible illnesses/conditions
3. Medications mentioned
4. Dosage information if present

Text: "${text}"

Return a JSON response with this structure:
{
  "symptoms": ["symptom1", "symptom2"],
  "illnesses": ["illness1", "illness2"],
  "medicines": ["medicine1", "medicine2"],
  "dosage": "dosage info if found"
}

Be conservative and only include clearly mentioned items. Use medical terminology when possible.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a medical AI assistant that extracts structured medical information from text. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error('No response from OpenAI GPT');
    }

    // Parse JSON response
    const parsed = JSON.parse(responseText);
    
    return {
      symptoms: parsed.symptoms || [],
      illnesses: parsed.illnesses || [],
      medicines: parsed.medicines || [],
      dosage: parsed.dosage,
      confidence: 0.75, // Lower confidence for AI-generated content
      source: 'OpenAI GPT'
    };
  } catch (error) {
    console.error('OpenAI GPT NLP failed:', error);
    throw new Error('OpenAI GPT NLP failed');
  }
}

/**
 * Main function with failover strategy for NLP
 * Order: 1. Infermedica → 2. EndlessMedical → 3. Azure Health → 4. Google Gemini → 5. OpenAI GPT
 */
export async function parseMedicalData(text: string): Promise<MedicalData> {
  const apis = [
    { name: 'Infermedica', func: infermedicaNLP, priority: 1 },
    { name: 'EndlessMedical', func: endlessMedicalNLP, priority: 2 },
    { name: 'Azure Health Text Analytics', func: azureHealthNLP, priority: 3 },
    { name: 'Google Gemini', func: googleGeminiNLP, priority: 4 },
    { name: 'OpenAI GPT', func: openAIGPT, priority: 5 }
  ];

  console.log('🔄 Starting NLP processing with comprehensive API failover...');
  console.log('📋 API Order: Infermedica → EndlessMedical → Azure Health → Google Gemini → OpenAI GPT');

  for (const api of apis) {
    try {
      console.log(`🔄 Attempting ${api.name} (Priority ${api.priority})...`);
      const result = await api.func(text);
      if (result && (result.symptoms.length > 0 || result.illnesses.length > 0 || result.medicines.length > 0)) {
        console.log(`✅ ${api.name} succeeded:`, {
          symptoms: result.symptoms.length,
          illnesses: result.illnesses.length,
          medicines: result.medicines.length,
          confidence: result.confidence,
          source: result.source
        });
        return result;
      } else {
        console.log(`⚠️ ${api.name} returned empty results, trying next API...`);
      }
    } catch (error) {
      console.error(`❌ ${api.name} failed:`, error.message);
    }
  }

  // If all APIs fail, return a basic fallback
  console.warn('⚠️ All NLP services failed, using basic fallback');
  return {
    symptoms: [],
    illnesses: [],
    medicines: [],
    confidence: 0.5,
    source: 'Fallback - All APIs Failed'
  };
}
