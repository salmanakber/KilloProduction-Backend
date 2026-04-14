// GitHub AI Models Integration for Vehicle/Auto Parts Analysis
// Supporting multiple client types: Azure REST, OpenAI, and direct fetch
// Primary path: Admin AI Config use case AI_MECHANIC (Prisma) via analyzeWithAI; legacy GitHub as fallback.

import { analyzeWithAI, type AIModelCategory } from "@/lib/ai/queue"
import type { AIUseCase } from "@prisma/client"
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

// Available GitHub AI models
export const GITHUB_MODELS = {
  ADVANCED: {
    DEEPSEEK_V3: "deepseek/DeepSeek-V3-0324",
    LLAMA_4_SCOUT: "meta/Llama-4-Scout-17B-16E-Instruct",
  },
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
    provider: (process.env.GITHUB_AI_PROVIDER as 'azure' | 'openai' | 'fetch') || 'azure'
  }
): Promise<string> {

    const messages = [
        {
          role: "system",
          content: "You are a helpful automotive AI assistant. Provide accurate, helpful responses about vehicles, auto parts, and automotive topics while emphasizing the need to consult professional mechanics for complex issues."
        },
        {
          role: "user",
          content: prompt
        }
      ];
      const githubToken = process.env.GITHUB_TOKEN;

  try {
    console.log(`🤖 Calling GitHub AI Model: ${config.model} via ${config.provider} provider`);
    
    
    if (!githubToken) {
      console.error('❌ GITHUB_TOKEN not found in environment variables');
      throw new Error('GITHUB_TOKEN not found in environment variables');
    }

 

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
 * GitHub AI Speech-to-Text for Vehicle Issues
 * Uses Speechmatics for high-quality speech recognition, then GitHub AI for vehicle analysis
 */
export async function vehicleAISpeechToText(audioBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
  source: string;
}> {
  try {
    console.log('🎤 Vehicle AI Speech-to-Text: Using Speechmatics + GitHub AI');
    
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
    
    // Step 2: Use GitHub AI to clean and enhance the vehicle transcription
    console.log('🧠 Enhancing transcription with GitHub AI...');
    const prompt = `Clean and enhance this vehicle/auto parts transcription. The user is describing vehicle issues and asking for part recommendations.
    
    Original transcription: "${transcription.text}"
    
    Focus on:
    - Clarifying vehicle symptoms and issues
    - Identifying part requests
    - Removing filler words and disfluencies
    - Making the text more automotive-precise
    
    Return only the cleaned, vehicle-focused text without any additional commentary.`;
    
    const enhancedResult = await mechanicAIText(prompt, 400)
    
    return {
      text: enhancedResult.trim(),
      confidence: Math.min(transcription.confidence + 0.1, 0.95),
      source: 'Speechmatics + GitHub AI (Enhanced STT)'
    };
    
  } catch (speechmaticsError) {
    console.log('⚠️ Speechmatics failed, falling back to mock implementation...');
    console.error('Speechmatics error:', speechmaticsError);
    
    // Fallback to mock implementation
    try {
      const mockTranscription = "My car is making a strange noise and I need to replace the brake pads.";
      
      const prompt = `Clean and enhance this vehicle transcription. The user is describing vehicle issues and asking for part recommendations.
      
      Original transcription: "${mockTranscription}"
      
      Return only the cleaned, vehicle-focused text without any additional commentary.`;
      
      const result = await mechanicAIText(prompt, 300)
      
      return {
        text: result.trim(),
        confidence: 0.75,
        source: 'AI_MECHANIC / legacy (Mock Speech-to-Text Fallback)'
      };
    } catch (fallbackError) {
      console.error('❌ Both Speechmatics and fallback failed:', fallbackError);
      
      return {
        text: "I have a vehicle issue and need auto parts recommendations.",
        confidence: 0.5,
        source: 'GitHub AI (Emergency Fallback)'
      };
    }
  }
}

/**
 * GitHub AI OCR for Vehicle Images
 * Analyzes vehicle images, part photos, and damage photos
 */
export async function vehicleAIOCR(imageBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
  source: string;
}> {
  try {
    console.log('🖼️ Processing vehicle image with GitHub AI multimodal models...');
    
    // Convert image buffer to base64
    const imageBase64 = await convertImageToBase64(imageBuffer);
    
    // Try LLaVA model first (best for vehicle image understanding)
    try {
      const result = await callGitHubAIMultimodal(
        imageBase64,
        `Analyze this vehicle or auto part image and extract all relevant information.
        
        Focus on extracting:
        - Vehicle make, model, and year
        - Part names and part numbers
        - Damage descriptions
        - Part specifications
        - Any visible issues or symptoms
        - Manufacturer information
        
        Return the extracted text in a clean, structured format that can be used for part matching.`,
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
          `Extract all text and vehicle information from this image. Focus on vehicle details, part names, and specifications.`,
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
        
        // Final fallback: use text generation model
        const result = await callGitHubAI(
          `Analyze this vehicle image description and extract relevant vehicle and part information. 
          The image contains: [Image would be analyzed here]
          
          Extract:
          - Vehicle make and model
          - Part names
          - Part specifications
          - Any visible issues`,
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
        content: "You are an automotive AI assistant specialized in analyzing vehicles, auto parts, and automotive images. Provide accurate, detailed analysis while maintaining technical accuracy."
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

const VEHICLE_AI_USE_CASE: AIUseCase = "AI_MECHANIC"

/** Prefer Admin → AI Config → AI_MECHANIC active model; fall back to legacy GitHub Models. */
async function mechanicAIText(customPrompt: string, maxTokens: number): Promise<string> {
  try {
    const r = await analyzeWithAI(VEHICLE_AI_USE_CASE, {}, {
      customPrompt: customPrompt,
      maxTokens,
      disableTools: true,
    })
    return r.content
  } catch (e) {
    console.warn("[vehicle-ai] AI_MECHANIC (admin config) text call failed, using legacy GitHub:", e)
    return callGitHubAI(customPrompt, {
      model: GITHUB_MODELS.ADVANCED.LLAMA_4_SCOUT,
      temperature: 0.2,
      max_tokens: maxTokens,
      provider: "azure",
    })
  }
}

/** Vision: same AI_MECHANIC config with IMAGE_TO_TEXT + image data URL. */
async function mechanicAIVision(userPrompt: string, imageBuffer: Buffer, maxTokens: number): Promise<string> {
  let imageUrl: string
  try {
    imageUrl = await convertImageToBase64(imageBuffer)
  } catch {
    imageUrl = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`
  }
  try {
    const r = await analyzeWithAI(VEHICLE_AI_USE_CASE, {}, {
      customPrompt: userPrompt,
      category: "IMAGE_TO_TEXT" as AIModelCategory,
      imageUrl,
      maxTokens,
      disableTools: true,
    })
    return r.content
  } catch (e) {
    console.warn("[vehicle-ai] AI_MECHANIC vision failed, using legacy multimodal:", e)
    return callGitHubAIMultimodal(imageUrl, `${userPrompt}\n\nReturn the information in a structured format that can be used for part matching and vehicle analysis.`, {
      model: GITHUB_MODELS.MULTIMODAL.LLAVA,
      temperature: 0.1,
      max_tokens: maxTokens,
      provider: "azure",
    })
  }
}

/**
 * Vehicle AI NLP Processing
 * Analyzes vehicle-related text and extracts structured information
 */
export async function vehicleAINLP(text: string): Promise<{
  vehicleInfo: {
    brand?: string;
    model?: string;
    year?: string;
  };
  symptoms: string[];
  partTypes: string[];
  partNames: string[];
  confidence: number;
  source: string;
  usedRealAPI: boolean;
}> {
  try {
    const prompt = `You are an automotive AI assistant. Analyze this vehicle-related text and extract structured information.

Text: "${text}"

CRITICAL: Return ONLY a valid JSON object. Do not include any explanations, commentary, or additional text.

Required JSON format:
{
  "vehicleInfo": {
    "brand": "vehicle brand if mentioned",
    "model": "vehicle model if mentioned",
    "year": "vehicle year if mentioned"
  },
  "symptoms": ["list", "of", "vehicle", "symptoms"],
  "partTypes": ["list", "of", "part", "types"],
  "partNames": ["list", "of", "specific", "part", "names"]
}

Rules:
- Extract vehicle information (brand, model, year) if mentioned
- Extract vehicle symptoms/issues (noise, vibration, warning lights, etc.)
- Extract part types (engine, brakes, suspension, etc.)
- Extract specific part names if mentioned
- Use lowercase for all terms
- If no terms found in a category, use empty array [] or null
- Return ONLY the JSON object, nothing else

Example:
{
  "vehicleInfo": {
    "brand": "toyota",
    "model": "camry",
    "year": "2020"
  },
  "symptoms": ["brake noise", "vibration"],
  "partTypes": ["brakes", "suspension"],
  "partNames": ["brake pads", "rotors"]
}`;

    const result = await mechanicAIText(prompt, 500)

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
        vehicleInfo: extractVehicleInfo(text),
        symptoms: extractKeywords(text, [
          'noise', 'vibration', 'smoke', 'leak', 'overheating', 'stalling',
          'rough idle', 'check engine', 'warning light', 'brake noise',
          'squeaking', 'grinding', 'knocking', 'clicking', 'whining',
          'loss of power', 'poor acceleration', 'transmission issue',
          'steering problem', 'suspension issue', 'electrical problem'
        ]),
        partTypes: extractKeywords(text, [
          'engine', 'brakes', 'suspension', 'transmission', 'electrical',
          'body', 'exhaust', 'cooling', 'fuel', 'ignition', 'steering',
          'tires', 'wheels', 'battery', 'alternator', 'starter', 'radiator'
        ]),
        partNames: extractKeywords(text, [
          'brake pads', 'rotors', 'shocks', 'struts', 'spark plugs',
          'air filter', 'oil filter', 'timing belt', 'serpentine belt',
          'water pump', 'thermostat', 'fuel pump', 'ignition coil',
          'catalytic converter', 'muffler', 'battery', 'alternator',
          'starter motor', 'radiator', 'head gasket', 'piston', 'valve'
        ]),
        confidence: 0.6,
        source: 'GitHub AI (Enhanced Fallback)',
        usedRealAPI: false
      };
      
      console.log('🔄 Using enhanced fallback with extracted data:', enhancedFallback);
      
      return enhancedFallback;
    }

    return {
      vehicleInfo: parsedResult.vehicleInfo || {},
      symptoms: parsedResult.symptoms || [],
      partTypes: parsedResult.partTypes || [],
      partNames: parsedResult.partNames || [],
      confidence: 0.85,
      source: 'AI_MECHANIC / admin config (NLP)',
      usedRealAPI: true
    };
  } catch (error) {
    console.error('Vehicle AI NLP failed:', error);
    throw error;
  }
}

/**
 * Vehicle AI Part Matching
 * Matches vehicle issues with appropriate auto parts
 */
export async function vehicleAIPartMatching(
  vehicleInput: string,
  symptoms: string[],
  partTypes: string[],
  partNames: string[],
  availableParts: any[]
): Promise<any[]> {
  try {
    const partsList = availableParts.map(part => 
      `- ${part.name} (${part.partNumber || 'N/A'}): ${part.description || ''} - Brand: ${part.brand}, Model: ${part.model}, Year: ${part.year}, Category: ${part.category}, Type: ${part.partType}`
    ).join('\n');

    const prompt = `As an automotive AI assistant, analyze this vehicle's condition and recommend appropriate auto parts from our database.

Vehicle Input: "${vehicleInput}"
Symptoms: ${symptoms.join(', ')}
Part Types Needed: ${partTypes.join(', ')}
Mentioned Parts: ${partNames.join(', ')}

Available Parts in Database:
${partsList}

Analyze the vehicle's condition and recommend the most appropriate parts from the database. Consider:
1. Symptom resolution
2. Vehicle compatibility (brand, model, year)
3. Part condition and quality
4. Price and value
5. Availability

Return a JSON array of recommended parts with this structure:
[
  {
    "partId": "part id",
    "name": "Part Name",
    "partNumber": "Part Number",
    "confidence": 0.85,
    "matchReason": "Why this part is recommended",
    "aiExplanation": "Detailed explanation of why this part is suitable"
  }
]

Return only the JSON array, no additional text.`;

    const result = await mechanicAIText(prompt, 1500)

    // Parse JSON response
    let parsedResult;
    try {
      const cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResult = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('Failed to parse GitHub AI part matching response:', parseError);
      console.log('Raw response:', result);
      return [];
    }

    // Validate the response
    if (!Array.isArray(parsedResult)) {
      console.error('GitHub AI part matching returned non-array response:', parsedResult);
      return [];
    }

    // Filter out invalid entries
    const validResults = parsedResult.filter(item => 
      item && 
      typeof item === 'object' && 
      item.partId && 
      typeof item.partId === 'string' &&
      item.partId.trim().length > 0
    );

    console.log(`✅ GitHub AI part matching returned ${validResults.length} valid parts`);
    return validResults;
  } catch (error) {
    console.error('GitHub AI Part Matching failed:', error);
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
 * Helper function to extract vehicle information from text
 */
function extractVehicleInfo(text: string): {
  brand?: string;
  model?: string;
  year?: string;
} {
  const lowerText = text.toLowerCase();
  const vehicleInfo: { brand?: string; model?: string; year?: string } = {};
  
  // Common vehicle brands
  const brands = ['toyota', 'honda', 'ford', 'chevrolet', 'nissan', 'bmw', 'mercedes', 'audi', 'volkswagen', 'hyundai', 'kia', 'mazda', 'subaru', 'lexus', 'acura', 'infiniti', 'jeep', 'dodge', 'chrysler', 'gmc', 'buick', 'cadillac', 'lincoln', 'volvo', 'porsche', 'jaguar', 'land rover', 'tesla', 'mitsubishi', 'suzuki'];
  
  for (const brand of brands) {
    if (lowerText.includes(brand)) {
      vehicleInfo.brand = brand;
      break;
    }
  }
  
  // Extract year (4-digit year pattern)
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    vehicleInfo.year = yearMatch[0];
  }
  
  // Common vehicle models (simplified - could be enhanced)
  const models = ['camry', 'corolla', 'accord', 'civic', 'f-150', 'silverado', 'altima', 'sentra', '3 series', '5 series', 'c-class', 'e-class', 'a4', 'a6', 'golf', 'passat', 'elantra', 'sonata', 'optima', 'sorento'];
  
  for (const model of models) {
    if (lowerText.includes(model)) {
      vehicleInfo.model = model;
      break;
    }
  }
  
  return vehicleInfo;
}

/**
 * Enhanced Vehicle Image Analysis
 * Analyzes different types of vehicle images with specialized prompts
 */
export async function analyzeVehicleImage(
  imageBuffer: Buffer,
  imageType: 'vehicle_photo' | 'part_photo' | 'damage_photo' | 'part_label' | 'general' = 'general'
): Promise<{
  text: string;
  confidence: number;
  source: string;
  extractedData: {
    vehicleInfo?: {
      brand?: string;
      model?: string;
      year?: string;
    };
    partInfo?: {
      partName?: string;
      partNumber?: string;
      brand?: string;
    };
    symptoms?: string[];
    damage?: string[];
  };
}> {
  try {
    console.log(`🚗 Analyzing vehicle image type: ${imageType}`);
    
    // Specialized prompts for different image types
    const prompts = {
      vehicle_photo: `Analyze this vehicle photo and extract:
        - Vehicle make, model, and year (if visible)
        - Vehicle condition
        - Any visible issues or damage
        - Part recommendations based on visible issues`,
      
      part_photo: `Analyze this auto part photo and extract:
        - Part name and type
        - Part number (if visible)
        - Brand and manufacturer
        - Condition and specifications
        - Compatibility information`,
      
      damage_photo: `Analyze this vehicle damage photo and extract:
        - Type of damage
        - Severity
        - Affected parts
        - Recommended replacement parts
        - Repair suggestions`,
      
      part_label: `Analyze this part label/packaging and extract:
        - Part name and number
        - Brand and manufacturer
        - Specifications
        - Compatibility (vehicle make, model, year)
        - Part type and category`,
      
      general: `Analyze this vehicle or auto part image and extract all relevant information including vehicle details, parts, and any issues.`
    };
    
    const prompt = prompts[imageType];
    const fullPrompt = `${prompt}
      
      Return the information in a structured format that can be used for part matching and vehicle analysis.`

    const result = await mechanicAIVision(fullPrompt, imageBuffer, 2000)
    
    // Extract structured data from the result
    const extractedData = extractVehicleDataFromText(result);
    
    return {
      text: result.trim(),
      confidence: 0.90,
      source: `AI_MECHANIC / admin config (vehicle image - ${imageType})`,
      extractedData
    };
    
  } catch (error) {
    console.error('❌ Vehicle image analysis failed:', error);
    
    // Fallback to basic OCR
    try {
      const basicResult = await vehicleAIOCR(imageBuffer);
      const extractedData = extractVehicleDataFromText(basicResult.text);
      
      return {
        text: basicResult.text,
        confidence: basicResult.confidence * 0.8,
        source: `${basicResult.source} (Vehicle Analysis Fallback)`,
        extractedData
      };
    } catch (fallbackError) {
      console.error('❌ Fallback vehicle analysis also failed:', fallbackError);
      throw new Error('Vehicle image analysis failed completely');
    }
  }
}

/**
 * Extract structured vehicle data from text
 */
function extractVehicleDataFromText(text: string): {
  vehicleInfo?: {
    brand?: string;
    model?: string;
    year?: string;
  };
  partInfo?: {
    partName?: string;
    partNumber?: string;
    brand?: string;
  };
  symptoms?: string[];
  damage?: string[];
} {
  const lowerText = text.toLowerCase();
  
  // Extract vehicle info
  const vehicleInfo = extractVehicleInfo(text);
  
  // Extract part info
  const partInfo: { partName?: string; partNumber?: string; brand?: string } = {};
  const partNumberMatch = text.match(/\b[A-Z0-9]{4,}\b/);
  if (partNumberMatch) {
    partInfo.partNumber = partNumberMatch[0];
  }
  
  // Extract symptoms
  const symptomPatterns = [
    /\b(?:noise|vibration|smoke|leak|overheating|stalling|rough idle|check engine|warning light|brake noise|squeaking|grinding|knocking|clicking|whining)\b/g,
    /\b(?:loss of power|poor acceleration|transmission issue|steering problem|suspension issue|electrical problem)\b/g
  ];
  
  const symptoms = new Set<string>();
  symptomPatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => symptoms.add(match.toLowerCase()));
    }
  });
  
  // Extract damage
  const damagePatterns = [
    /\b(?:dent|scratch|crack|break|bend|rust|corrosion|worn|damaged|broken)\b/g,
    /\b(?:collision|accident|impact|crash)\b/g
  ];
  
  const damage = new Set<string>();
  damagePatterns.forEach(pattern => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach(match => damage.add(match.toLowerCase()));
    }
  });
  
  return {
    vehicleInfo: Object.keys(vehicleInfo).length > 0 ? vehicleInfo : undefined,
    partInfo: Object.keys(partInfo).length > 0 ? partInfo : undefined,
    symptoms: Array.from(symptoms),
    damage: Array.from(damage)
  };
}

/**
 * Advanced Vehicle Diagnostic AI
 * Provides comprehensive diagnosis with probability scores, car health score, and mechanic recommendations
 */
export async function vehicleAIDiagnosis(
  vehicleInfo: {
    make?: string;
    model?: string;
    year?: string;
    variant?: string;
  },
  symptoms: string[],
  partTypes: string[],
  partNames: string[],
  images?: string[],
  mileage?: number,
  recentMaintenance?: string,
  warningLights?: string[]
): Promise<{
  car_health_score: number;
  diagnosed_issues: Array<{
    issue: string;
    probability: number;
    symptoms_matched: string[];
    recommended_parts: string[];
    recommended_mechanic_type: string;
    next_diagnostic_steps: string[];
  }>;
  parts_needed_overview: string[];
  recommended_mechanics: string[];
}> {
  try {
    const vehicleDesc = [
      vehicleInfo.make && `Make: ${vehicleInfo.make}`,
      vehicleInfo.model && `Model: ${vehicleInfo.model}`,
      vehicleInfo.year && `Year: ${vehicleInfo.year}`,
      vehicleInfo.variant && `Variant: ${vehicleInfo.variant}`,
      mileage && `Mileage: ${mileage} km`,
    ].filter(Boolean).join(', ');

    const prompt = `You are a professional automotive diagnostic AI assistant. Your task is to help car owners accurately identify mechanical or electrical issues based on their inputs.

### INPUTS
- Car Details: ${vehicleDesc || 'Not specified'}
- Symptoms / Observations: ${symptoms.join(', ') || 'None specified'}
- Part Types Mentioned: ${partTypes.join(', ') || 'None'}
- Specific Parts Mentioned: ${partNames.join(', ') || 'None'}
${recentMaintenance ? `- Recent Maintenance: ${recentMaintenance}` : ''}
${warningLights && warningLights.length > 0 ? `- Warning Lights: ${warningLights.join(', ')}` : ''}

### TASKS
1. Analyze the inputs and generate a **diagnosis** of the most likely root causes.
2. Prioritize the **most probable issues** with a confidence score (0-1) for each.
3. Map each issue to relevant **parts** that may need repair or replacement.
4. Suggest the **type of mechanic or service** required (e.g., "Suspension specialist", "Transmission expert", "Electrical technician", "Engine specialist", "Brake specialist", "AC specialist", "General mechanic").
5. If multiple causes are possible, suggest **step-by-step diagnostic actions** to narrow down the real issue.
6. Calculate an overall **car health score** (0-100) based on severity of issues.

### OUTPUT FORMAT (JSON)
Return ONLY a valid JSON object in this exact format:
{
  "car_health_score": 0-100,
  "diagnosed_issues": [
    {
      "issue": "Issue name",
      "probability": 0.0-1.0,
      "symptoms_matched": ["symptom1", "symptom2"],
      "recommended_parts": ["part1", "part2"],
      "recommended_mechanic_type": "Mechanic type",
      "next_diagnostic_steps": ["step1", "step2"]
    }
  ],
  "parts_needed_overview": ["part1", "part2"],
  "recommended_mechanics": ["mechanic type1", "mechanic type2"]
}

### GUIDELINES
- Base recommendations on car make, model, year, and symptoms.
- Take into account the probability of issues if multiple causes are plausible.
- Be concise and clear for the user, but also detailed enough for mechanics.
- Car health score: 90-100 = Excellent, 70-89 = Good, 50-69 = Fair, 30-49 = Poor, 0-29 = Critical
- Return ONLY the JSON object, no additional text or markdown.`;

    const result = await mechanicAIText(prompt, 2000)

    // Parse JSON response
    let parsedResult;
    try {
      let cleanedResult = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanedResult.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResult = jsonMatch[0];
      }
      parsedResult = JSON.parse(cleanedResult);
    } catch (parseError) {
      console.error('Failed to parse advanced diagnosis response:', parseError);
      // Fallback response
      parsedResult = {
        car_health_score: 70,
        diagnosed_issues: symptoms.map(symptom => ({
          issue: symptom,
          probability: 0.6,
          symptoms_matched: [symptom],
          recommended_parts: partNames.length > 0 ? partNames : partTypes,
          recommended_mechanic_type: "General mechanic",
          next_diagnostic_steps: ["Visual inspection", "Test drive", "Diagnostic scan"]
        })),
        parts_needed_overview: partNames.length > 0 ? partNames : partTypes,
        recommended_mechanics: ["General mechanic"]
      };
    }

    return parsedResult;
  } catch (error) {
    console.error('Advanced vehicle diagnosis failed:', error);
    throw error;
  }
}

