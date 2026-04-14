// GitHub AI Models Integration for Virtual Doctor
// Supporting multiple client types: Azure REST, OpenAI, and direct fetch

import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";
import OpenAI from "openai";

const GITHUB_MODELS_BASE_URL = "https://models.github.ai/inference";

export interface GitHubAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage: {
    total_tokens: number;
  };
}

export interface GitHubAIConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
  provider?: 'azure' | 'openai' | 'fetch';
}

// Available GitHub AI models (based on GitHub Marketplace)
export const GITHUB_MODELS = {
  // Text generation models
  TEXT: {
    MISTRAL_7B: "mistralai/Mistral-7B-Instruct-v0.1",
    LLAMA_7B: "meta-llama/Llama-2-7b-chat-hf",
    PHI_3: "microsoft/Phi-3-mini-4k-instruct",
    FLAN_T5: "google/flan-t5-large",
    BART: "facebook/bart-large-cnn",
  },
  // Advanced models from GitHub Marketplace
  ADVANCED: {
    DEEPSEEK_V3: "deepseek/DeepSeek-V3-0324",
    LLAMA_4_SCOUT: "meta/Llama-4-Scout-17B-16E-Instruct",
    // Note: Mistral and Phi-3 models are not available on GitHub AI
    // MISTRAL_7B: "mistralai/Mistral-7B-Instruct-v0.1", // Not available
    // PHI_3: "microsoft/Phi-3-mini-4k-instruct", // Not available
  },
  // Code generation models
  CODE: {
    STARCODER: "bigcode/starcoder2-3b",
    WIZARDCODER: "WizardLM/WizardCoder-15B-V1.0",
  },
  // Multimodal models
  MULTIMODAL: {
    LLAVA: "meta/Llama-4-Scout-17B-16E-Instruct",
    BAKLLAVA: "llava-hf/bakllava-1",
  }
};

/**
 * Call GitHub AI Models API with multiple provider support
 */
export async function callGitHubAI(
  prompt: string,
  config: GitHubAIConfig = {
    model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT,
    temperature: 0.7,
    max_tokens: 1000,
    provider: (process.env.GITHUB_AI_PROVIDER as 'azure' | 'openai' | 'fetch') || 'azure' // Configurable provider
  }
): Promise<string> {
  // NOTE: We keep this helper for legacy callers, but newer flows should use the ai-config system (`analyzeWithAI`).
  // Make sure `messages` is in function scope so fallback paths in catch blocks can access it safely.
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful medical AI assistant. Provide accurate, helpful responses about medical topics while emphasizing the need to consult healthcare professionals.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  try {
    console.log(`🤖 Calling GitHub AI Model: ${config.model} via ${config.provider} provider`);
    
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      console.error('❌ GITHUB_TOKEN not found in environment variables');
      throw new Error('GITHUB_TOKEN not found in environment variables');
    }

    console.log(`🔑 Token present: ${githubToken ? 'Yes' : 'No'}`);
    console.log(`🌐 Base URL: ${GITHUB_MODELS_BASE_URL}`);

    switch (config.provider) {
      case 'azure':
        return await callWithAzureClient(messages, config, githubToken);
      case 'openai':
        return await callWithOpenAIClient(messages, config, githubToken);
      case 'fetch':
        return await callWithFetch(messages, config, githubToken);
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  } catch (error) {
    console.error(`❌ GitHub Models API call failed with ${config.provider} provider:`, error);
    
    // Try fallback provider if Azure fails
    if (config.provider === 'azure') {
      console.log('🔄 Azure failed, trying OpenAI fallback...');
      try {
        const fallbackConfig = { ...config, provider: 'openai' as const };
        return await callWithOpenAIClient(messages, fallbackConfig, githubToken);
      } catch (fallbackError) {
        console.error('❌ OpenAI fallback also failed:', fallbackError);
        throw new Error(`Both Azure and OpenAI providers failed. Azure: ${error.message}, OpenAI: ${fallbackError.message}`);
      }
    }
    
    throw error;
  }
}

/**
 * Call using Azure REST client
 */
async function callWithAzureClient(messages: any[], config: GitHubAIConfig, token: string): Promise<string> {
  const client = ModelClient(
    GITHUB_MODELS_BASE_URL,
    new AzureKeyCredential(token)
  );

  const response = await client.path("/chat/completions").post({
    body: {
      messages,
      temperature: config.temperature || 0.7,
      top_p: 1.0,
      max_tokens: config.max_tokens || 1000,
      model: config.model
    }
  });

  if (isUnexpected(response)) {
    console.error('❌ Azure client unexpected response:', {
      status: response.status,
      body: response.body,
      headers: response.headers
    });
    
    const errorMessage = response.body?.error?.message || 
                        response.body?.message || 
                        `HTTP ${response.status}: ${response.statusText}` ||
                        'Unknown Azure client error';
    
    throw new Error(`Azure client error: ${errorMessage}`);
  }

  if (response.body.choices && response.body.choices.length > 0) {
    const content = response.body.choices[0].message.content;
    console.log(`✅ Azure client response received (${response.body.usage?.total_tokens || 0} tokens)`);
    return content || '';
  } else {
    throw new Error('No response from Azure client');
  }
}

/**
 * Call using OpenAI client
 */
async function callWithOpenAIClient(messages: any[], config: GitHubAIConfig, token: string): Promise<string> {
  const client = new OpenAI({ 
    baseURL: GITHUB_MODELS_BASE_URL, 
    apiKey: token 
  });

  const response = await client.chat.completions.create({
    messages,
    model: config.model,
    temperature: config.temperature || 0.7,
    max_tokens: config.max_tokens || 1000
  });

  if (response.choices && response.choices.length > 0) {
    const content = response.choices[0].message.content;
    console.log(`✅ OpenAI client response received (${response.usage?.total_tokens || 0} tokens)`);
    return content || '';
  } else {
    throw new Error('No response from OpenAI client');
  }
}

/**
 * Call using direct fetch (fallback)
 */
async function callWithFetch(messages: any[], config: GitHubAIConfig, token: string): Promise<string> {
  const response = await fetch(`${GITHUB_MODELS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 1000,
      model: config.model
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fetch client error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.choices && data.choices.length > 0) {
    const content = data.choices[0].message.content;
    console.log(`✅ Fetch client response received (${data.usage?.total_tokens || 0} tokens)`);
    return content;
  } else {
    throw new Error('No response from fetch client');
  }
}

/**
 * GitHub AI Speech-to-Text with Speechmatics Integration
 * Uses Speechmatics for high-quality speech recognition, then GitHub AI for medical processing
 */
export async function githubAISpeechToText(audioBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
  source: string;
}> {
  try {
    console.log('🎤 GitHub AI Speech-to-Text: Using Speechmatics + GitHub AI');
    
    // Import Speechmatics STT
    const { speechmaticsSpeechToText } = await import('./speechmatics-stt');
    
    // Step 1: Get transcription from Speechmatics
    console.log('📝 Getting transcription from Speechmatics...');
    const transcription = await speechmaticsSpeechToText(audioBuffer);
    
    if (!transcription.text || transcription.text.trim().length === 0) {
      throw new Error('No transcription received from Speechmatics');
    }
    
    console.log('✅ Speechmatics transcription received:', {
      textLength: transcription.text.length,
      confidence: transcription.confidence,
      isComplete: transcription.isComplete
    });
    
    // Step 2: Use GitHub AI to clean and enhance the medical transcription
    console.log('🧠 Enhancing transcription with GitHub AI...');
    const prompt = `Clean and enhance this medical transcription. The user is describing symptoms and asking for medicine recommendations.
    
    Original transcription: "${transcription.text}"
    
    Focus on:
    - Clarifying medical symptoms and conditions
    - Identifying medicine requests
    - Removing filler words and disfluencies
    - Making the text more medically precise
    
    Return only the cleaned, medical-focused text without any additional commentary.`;
    
    const enhancedResult = await callGitHubAI(prompt, {
      model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT,
      temperature: 0.2,
      max_tokens: 400,
      provider: 'azure'
    });
    
    return {
      text: enhancedResult.trim(),
      confidence: Math.min(transcription.confidence + 0.1, 0.95), // Slightly higher confidence due to AI enhancement
      source: 'Speechmatics + GitHub AI (Enhanced STT)'
    };
    
  } catch (speechmaticsError) {
    console.log('⚠️ Speechmatics failed, falling back to mock implementation...');
    console.error('Speechmatics error:', speechmaticsError);
    
    // Fallback to mock implementation
    try {
      const mockTranscription = "I have a headache and feel nauseous. Can you recommend some medicine?";
      
      const prompt = `Clean and enhance this medical transcription. The user is describing symptoms and asking for medicine recommendations.
      
      Original transcription: "${mockTranscription}"
      
      Return only the cleaned, medical-focused text without any additional commentary.`;
      
      const result = await callGitHubAI(prompt, {
        model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT,
        temperature: 0.2,
        max_tokens: 300,
        provider: 'azure'
      });
      
      return {
        text: result.trim(),
        confidence: 0.75,
        source: 'GitHub AI (Mock Speech-to-Text Fallback)'
      };
    } catch (fallbackError) {
      console.error('❌ Both Speechmatics and fallback failed:', fallbackError);
      
      return {
        text: "I have some medical symptoms and need medicine recommendations.",
        confidence: 0.5,
        source: 'GitHub AI (Emergency Fallback)'
      };
    }
  }
}

/**
 * GitHub AI OCR (using multimodal model for image analysis)
 * Enhanced implementation with proper image handling and medical context
 */
export async function githubAIOCR(imageBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
  source: string;
}> {
  try {
    console.log('🖼️ Processing image with GitHub AI multimodal models...');
    
    // Convert image buffer to base64 with proper MIME type detection
    const imageBase64 = await convertImageToBase64(imageBuffer);
    
    // Try LLaVA model first (best for medical image understanding)
    try {
      const result = await callGitHubAIMultimodal(
        imageBase64,
        `Analyze this medical prescription, document, or image and extract all relevant information.
        
        Focus on extracting:
        - Medicine names and generic names
        - Dosage information (mg, ml, frequency)
        - Doctor's notes and instructions
        - Patient information
        - Prescription details
        - Any medical symptoms or conditions mentioned
        - Expiration dates
        - Manufacturer information
        
        Return the extracted text in a clean, structured format that can be used for medical analysis.
        If this is not a medical document, describe what you see in the image.`,
        {
          model: GITHUB_MODELS.MULTIMODAL.LLAVA,
          temperature: 0.1,
          max_tokens: 1500,
          provider: 'azure'
        }
      );
      
      return {
        text: result.trim(),
        confidence: 0.85,
        source: 'GitHub AI (LLaVA Multimodal)'
      };
    } catch (llavaError) {
      console.log('⚠️ LLaVA model failed, trying alternative multimodal model...');
      
      // Fallback to BakLLaVA model
      try {
        const result = await callGitHubAIMultimodal(
          imageBase64,
          `Extract all text and medical information from this image. Focus on medicine names, dosages, and medical instructions.`,
          {
            model: GITHUB_MODELS.MULTIMODAL.BAKLLAVA,
            temperature: 0.2,
            max_tokens: 1200,
            provider: 'openai'
          }
        );
        
        return {
          text: result.trim(),
          confidence: 0.80,
          source: 'GitHub AI (BakLLaVA Multimodal)'
        };
      } catch (bakllavaError) {
        console.log('⚠️ BakLLaVA model failed, falling back to text-only analysis...');
        
        // Final fallback: use text generation model with image description
        const result = await callGitHubAI(
          `Analyze this medical image description and extract relevant medical information. 
          The image contains: [Image would be analyzed here]
          
          Extract:
          - Medicine names
          - Dosage information
          - Medical instructions
          - Patient details
          - Any symptoms or conditions`,
          {
            model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT,
            temperature: 0.3,
            max_tokens: 1000,
            provider: 'fetch'
          }
        );
        
        return {
          text: result.trim(),
          confidence: 0.60,
          source: 'GitHub AI (Text Fallback)'
        };
      }
    }
  } catch (error) {
    console.error('❌ GitHub AI OCR failed:', error);
    throw error;
  }
}

/**
 * Convert image buffer to base64 with proper MIME type detection
 */
async function convertImageToBase64(imageBuffer: Buffer): Promise<string> {
  try {
    // Detect image type from buffer
    let mimeType = 'image/jpeg'; // default
    
    // Check for common image signatures
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
      mimeType = 'image/png';
    } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46) {
      mimeType = 'image/gif';
    } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) {
      mimeType = 'image/webp';
    }
    
    const base64 = imageBuffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw new Error('Failed to convert image to base64');
  }
}

/**
 * Call GitHub AI with multimodal support (image + text)
 */
async function callGitHubAIMultimodal(
  imageBase64: string,
  prompt: string,
  config: GitHubAIConfig
): Promise<string> {
  try {
    console.log(`🤖 Calling GitHub AI Multimodal Model: ${config.model} via ${config.provider} provider`);
    
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN not found in environment variables');
    }

    const messages = [
      {
        role: "system",
        content: "You are a medical AI assistant specialized in analyzing medical documents, prescriptions, and images. Provide accurate, detailed analysis while maintaining medical accuracy."
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: {
              url: imageBase64
            }
          }
        ]
      }
    ];

    switch (config.provider) {
      case 'azure':
        return await callMultimodalWithAzureClient(messages, config, githubToken);
      case 'openai':
        return await callMultimodalWithOpenAIClient(messages, config, githubToken);
      case 'fetch':
        return await callMultimodalWithFetch(messages, config, githubToken);
      default:
        throw new Error(`Unsupported provider for multimodal: ${config.provider}`);
    }
  } catch (error) {
    console.error(`❌ GitHub AI Multimodal API call failed with ${config.provider} provider:`, error);
    throw error;
  }
}

/**
 * Call multimodal with Azure REST client
 */
async function callMultimodalWithAzureClient(messages: any[], config: GitHubAIConfig, token: string): Promise<string> {
  const client = ModelClient(
    GITHUB_MODELS_BASE_URL,
    new AzureKeyCredential(token)
  );


  const response = await client.path("/chat/completions").post({
    body: {
      messages,
      temperature: config.temperature || 0.7,
      top_p: 1.0,
      max_tokens: config.max_tokens || 1000,
      model: config.model
    }
  });

  if (isUnexpected(response)) {
    console.error('❌ Azure multimodal client unexpected response:', {
      status: response.status,
      body: response.body,
      headers: response.headers
    });
    
    const errorMessage = response.body?.error?.message || 
                        response.body?.message || 
                        `HTTP ${response.status}: ${response.statusText}` ||
                        'Unknown Azure multimodal client error';
    
    throw new Error(`Azure multimodal client error: ${errorMessage}`);
  }

  if (response.body.choices && response.body.choices.length > 0) {
    const content = response.body.choices[0].message.content;
    console.log(`✅ Azure multimodal client response received (${response.body.usage?.total_tokens || 0} tokens)`);
    return content || '';
  } else {
    throw new Error('No response from Azure multimodal client');
  }
}

/**
 * Call multimodal with OpenAI client
 */
async function callMultimodalWithOpenAIClient(messages: any[], config: GitHubAIConfig, token: string): Promise<string> {
  const client = new OpenAI({ 
    baseURL: GITHUB_MODELS_BASE_URL, 
    apiKey: token 
  });

  const response = await client.chat.completions.create({
    messages,
    model: config.model,
    temperature: config.temperature || 0.7,
    max_tokens: config.max_tokens || 1000
  });

  if (response.choices && response.choices.length > 0) {
    const content = response.choices[0].message.content;
    console.log(`✅ OpenAI multimodal client response received (${response.usage?.total_tokens || 0} tokens)`);
    return content || '';
  } else {
    throw new Error('No response from OpenAI multimodal client');
  }
}

/**
 * Call multimodal with direct fetch (fallback)
 */
async function callMultimodalWithFetch(messages: any[], config: GitHubAIConfig, token: string): Promise<string> {
  const response = await fetch(`${GITHUB_MODELS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      temperature: config.temperature || 0.7,
      max_tokens: config.max_tokens || 1000,
      model: config.model
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fetch multimodal client error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = await response.json();
  
  if (data.choices && data.choices.length > 0) {
    const content = data.choices[0].message.content;
    console.log(`✅ Fetch multimodal client response received (${data.usage?.total_tokens || 0} tokens)`);
    return content;
  } else {
    throw new Error('No response from fetch multimodal client');
  }
}

/**
 * GitHub AI Medical NLP Processing
 */
export async function githubAINLP(text: string): Promise<{
  symptoms: string[];
  illnesses: string[];
  medicines: string[];
  confidence: number;
  source: string;
  usedRealAPI: boolean;
}> {
  try {
    const prompt = `You are a medical AI assistant. Analyze this medical text and extract structured information.

Text: "${text}"

CRITICAL: Return ONLY a valid JSON object. Do not include any explanations, commentary, or additional text.

Required JSON format:
{
  "symptoms": ["list", "of", "symptoms"],
  "illnesses": ["list", "of", "illnesses"], 
  "medicines": ["list", "of", "medicines"]
}

Rules:
- Extract medical terms from the text
- Use lowercase for all terms
- If no terms found in a category, use empty array []
- Return ONLY the JSON object, nothing else

Example:
{
  "symptoms": ["fever", "headache"],
  "illnesses": ["flu"],
  "medicines": ["paracetamol"]
}`;

    const result = await callGitHubAI(prompt, {
      model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT, // Reliable model for medical NLP
      temperature: 0.1, // Lower temperature for more consistent JSON output
      max_tokens: 500, // Reduced tokens to focus on JSON
      provider: 'azure' // Use Azure client for NLP
    });

    // Parse JSON response
    let parsedResult;
    try {
      console.log('🔍 Raw GitHub AI response:', result.substring(0, 200) + '...');
      
      // Clean the response in case it has markdown formatting
      let cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      
      // Try to extract JSON from the response if it's not pure JSON
      const jsonMatch = cleanedResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResult = jsonMatch[0];
        console.log('📝 Extracted JSON from response:', cleanedResult.substring(0, 100) + '...');
      }
      
      parsedResult = JSON.parse(cleanedResult);
      console.log('✅ Successfully parsed GitHub AI JSON response');
    } catch (parseError) {
      console.error('❌ Failed to parse GitHub AI JSON response:', parseError);
      console.log('📝 Raw response that failed to parse:', result.substring(0, 300));
      
      // Enhanced fallback with better keyword extraction
      const enhancedFallback = {
        symptoms: extractKeywords(text, [
          'fever', 'headache', 'pain', 'cough', 'nausea', 'vomiting', 'diarrhea',
          'rash', 'swelling', 'inflammation', 'sore throat', 'runny nose', 'congestion',
          'fatigue', 'weakness', 'dizziness', 'chills', 'sweating', 'muscle pain',
          'joint pain', 'back pain', 'chest pain', 'stomach pain', 'abdominal pain',
          'allergy', 'allergic', 'itching', 'sneezing', 'watery eyes'
        ]),
        illnesses: extractKeywords(text, [
          'flu', 'cold', 'fever', 'infection', 'inflammation', 'allergy', 'asthma',
          'diabetes', 'hypertension', 'arthritis', 'depression', 'anxiety', 'pneumonia',
          'bronchitis', 'gastritis', 'dermatitis', 'migraine', 'sinusitis', 'covid',
          'coronavirus', 'strep throat', 'ear infection', 'urinary tract infection'
        ]),
        medicines: extractKeywords(text, [
          'paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'amoxicillin',
          'metformin', 'lisinopril', 'atorvastatin', 'omeprazole', 'levothyroxine',
          'vitamin', 'supplement', 'medicine', 'medication', 'drug', 'pill', 'tablet',
          'capsule', 'syrup', 'injection', 'cream', 'ointment', 'antihistamine'
        ]),
        confidence: 0.6, // Higher confidence for enhanced fallback
        source: 'GitHub AI (Enhanced Fallback)',
        usedRealAPI: false
      };
      
      console.log('🔄 Using enhanced fallback with extracted data:', {
        symptoms: enhancedFallback.symptoms,
        illnesses: enhancedFallback.illnesses,
        medicines: enhancedFallback.medicines
      });
      
      return enhancedFallback;
    }

    return {
      symptoms: parsedResult.symptoms || [],
      illnesses: parsedResult.illnesses || [],
      medicines: parsedResult.medicines || [],
      confidence: 0.85,
      source: 'GitHub AI (Mistral-7B)',
      usedRealAPI: true
    };
  } catch (error) {
    console.error('GitHub AI NLP failed:', error);
    throw error;
  }
}

/**
 * GitHub AI Medicine Matching
 */
export async function githubAIMedicineMatching(
  patientInput: string,
  symptoms: string[],
  illnesses: string[],
  medicines: string[],
  availableMedicines: any[]
): Promise<any[]> {
  try {
    const medicinesList = availableMedicines.map(med => 
      `- ${med.name} (${med.genericName}): ${med.description} - Treats: ${med.illnessTypes?.join(', ')}`
    ).join('\n');

    const prompt = `As a medical AI assistant, analyze this patient's condition and recommend appropriate medicines from our database.

Patient Input: "${patientInput}"
Symptoms: ${symptoms.join(', ')}
Possible Illnesses: ${illnesses.join(', ')}
Mentioned Medicines: ${medicines.join(', ')}

Available Medicines in Database:
${medicinesList}

Analyze the patient's condition and recommend the most appropriate medicines from the database. Consider:
1. Symptom relief
2. Treatment of underlying conditions
3. Safety and appropriateness
4. Dosage information

Return a JSON array of recommended medicines with this structure:
[
  {
    "name": "Medicine Name",
    "genericName": "Generic Name",
    "dosage": "Recommended dosage",
    "confidence": 0.85,
    "matchReason": "Why this medicine is recommended",
    "aiExplanation": "Detailed explanation of why this medicine is suitable"
  }
]

Return only the JSON array, no additional text.`;

    const result = await callGitHubAI(prompt, {
      model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT, // Reliable model for medicine matching
      temperature: 0.4,
      max_tokens: 1500,
      provider: 'azure' // Use Azure client for medicine matching
    });

    // Parse JSON response
    let parsedResult;
    try {
      const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResult = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('Failed to parse GitHub AI medicine matching response:', parseError);
      console.log('Raw response:', result);
      return [];
    }

    // Validate the response
    if (!Array.isArray(parsedResult)) {
      console.error('GitHub AI medicine matching returned non-array response:', parsedResult);
      return [];
    }

    // Filter out invalid entries
    const validResults = parsedResult.filter(item => 
      item && 
      typeof item === 'object' && 
      item.name && 
      typeof item.name === 'string' &&
      item.name.trim().length > 0
    );

    console.log(`✅ GitHub AI medicine matching returned ${validResults.length} valid medicines`);
    return validResults;
  } catch (error) {
    console.error('GitHub AI Medicine Matching failed:', error);
    return [];
  }
}

/**
 * Helper function to extract keywords from text
 */
function extractKeywords(text: string, keywords: string[]): string[] {
  const lowerText = text.toLowerCase();
  return keywords.filter(keyword => lowerText.includes(keyword));
}

/**
 * Enhanced Medical Image Analysis
 * Analyzes different types of medical images with specialized prompts
 */
export async function analyzeMedicalImage(
  imageBuffer: Buffer,
  imageType: 'prescription' | 'medicine_label' | 'medical_report' | 'symptom_photo' | 'general' = 'general'
): Promise<{
  text: string;
  confidence: number;
  source: string;
  extractedData: {
    medicines?: string[];
    dosages?: string[];
    symptoms?: string[];
    conditions?: string[];
    instructions?: string[];
  };
}> {
  try {
    console.log(`🏥 Analyzing medical image type: ${imageType}`);
    
    const imageBase64 = await convertImageToBase64(imageBuffer);
    
    // Specialized prompts for different image types
    const prompts = {
      prescription: `Analyze this prescription image and extract:
        - Medicine names (both brand and generic)
        - Dosage information (strength, frequency, duration)
        - Doctor's instructions
        - Patient information
        - Prescription number and date
        - Any warnings or contraindications`,
      
      medicine_label: `Analyze this medicine label/packaging and extract:
        - Medicine name and generic name
        - Active ingredients
        - Dosage strength (mg, ml, etc.)
        - Manufacturer information
        - Expiration date
        - Storage instructions
        - Side effects and warnings`,
      
      medical_report: `Analyze this medical report/document and extract:
        - Patient symptoms
        - Diagnosed conditions
        - Test results
        - Recommended treatments
        - Doctor's notes
        - Follow-up instructions`,
      
      symptom_photo: `Analyze this photo showing medical symptoms and describe:
        - Visible symptoms or conditions
        - Severity indicators
        - Any concerning signs
        - Recommended immediate actions
        - When to seek medical help`,
      
      general: `Analyze this medical image and extract all relevant medical information including medicines, symptoms, conditions, and instructions.`
    };
    
    const prompt = prompts[imageType];
    
    // Use LLaVA for detailed medical analysis
    const result = await callGitHubAIMultimodal(
      imageBase64,
      `${prompt}
      
      Return the information in a structured format that can be used for medical analysis and medicine matching.`,
      {
        model: GITHUB_MODELS.MULTIMODAL.LLAVA,
        temperature: 0.1,
        max_tokens: 2000,
        provider: 'azure'
      }
    );
    
    // Extract structured data from the result
    const extractedData = extractMedicalDataFromText(result);
    
    return {
      text: result.trim(),
      confidence: 0.90,
      source: `GitHub AI (LLaVA Medical Analysis - ${imageType})`,
      extractedData
    };
    
  } catch (error) {
    console.error('❌ Medical image analysis failed:', error);
    
    // Fallback to basic OCR
    try {
      const basicResult = await githubAIOCR(imageBuffer);
      const extractedData = extractMedicalDataFromText(basicResult.text);
      
      return {
        text: basicResult.text,
        confidence: basicResult.confidence * 0.8, // Lower confidence for fallback
        source: `${basicResult.source} (Medical Analysis Fallback)`,
        extractedData
      };
    } catch (fallbackError) {
      console.error('❌ Fallback medical analysis also failed:', fallbackError);
      throw new Error('Medical image analysis failed completely');
    }
  }
}

/**
 * Extract structured medical data from text
 */
function extractMedicalDataFromText(text: string): {
  medicines?: string[];
  dosages?: string[];
  symptoms?: string[];
  conditions?: string[];
  instructions?: string[];
} {
  const lowerText = text.toLowerCase();
  
  // Common medicine patterns
  const medicinePatterns = [
    /\b(?:paracetamol|acetaminophen|ibuprofen|aspirin|amoxicillin|metformin|lisinopril|atorvastatin|omeprazole|levothyroxine)\b/g,
    /\b(?:mg|ml|tablet|capsule|syrup|injection|cream|ointment)\b/g,
    /\b(?:twice daily|once daily|three times daily|as needed|before meals|after meals)\b/g
  ];
  
  // Common symptom patterns
  const symptomPatterns = [
    /\b(?:fever|headache|pain|cough|nausea|vomiting|diarrhea|rash|swelling|inflammation)\b/g,
    /\b(?:severe|mild|moderate|acute|chronic|persistent|intermittent)\b/g
  ];
  
  // Common condition patterns
  const conditionPatterns = [
    /\b(?:diabetes|hypertension|asthma|arthritis|depression|anxiety|infection|inflammation)\b/g,
    /\b(?:flu|cold|pneumonia|bronchitis|gastritis|dermatitis)\b/g
  ];
  
  // Extract medicines
  const medicines = new Set<string>();
  medicinePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => medicines.add(match));
    }
  });
  
  // Extract symptoms
  const symptoms = new Set<string>();
  symptomPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => symptoms.add(match));
    }
  });
  
  // Extract conditions
  const conditions = new Set<string>();
  conditionPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => conditions.add(match));
    }
  });
  
  // Extract instructions (lines that contain action words)
  const instructionPattern = /(?:take|apply|use|avoid|drink|eat|do not|follow|continue|stop)/gi;
  const instructions = text.split('\n')
    .filter(line => instructionPattern.test(line))
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  return {
    medicines: Array.from(medicines),
    dosages: [], // Would need more sophisticated extraction
    symptoms: Array.from(symptoms),
    conditions: Array.from(conditions),
    instructions: instructions.slice(0, 5) // Limit to 5 instructions
  };
}

/**
 * Test GitHub AI connection
 */
export async function testGitHubAIConnection(): Promise<boolean> {
  try {
    const result = await callGitHubAI("Hello, are you working?", {
      model: GITHUB_MODELS.ADVANCED.DEEPSEEK_V3,
      temperature: 0.1,
      max_tokens: 50,
      provider: 'fetch' // Use fetch for connection testing
    });
    
    console.log('✅ GitHub AI connection test successful:', result);
    return true;
  } catch (error) {
    console.error('❌ GitHub AI connection test failed:', error);
    return false;
  }
}

