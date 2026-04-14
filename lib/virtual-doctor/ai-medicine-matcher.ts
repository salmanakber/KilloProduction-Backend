// AI-powered medicine matching system
// Uses AI intelligence to understand patient problems and select appropriate medicines from database

import { PrismaClient } from '@prisma/client';
import { analyzeWithAI } from '@/lib/ai/queue';

const prisma = new PrismaClient();

// Dynamic tablet usage - supports any languages from systemPrompt
export interface TabletUsage {
  [language: string]: string; // Dynamic: english, hausa, yoruba, pashto, or any other language
}

export interface AIRecommendedMedicine {
  name: string;
  genericName?: string;
  dosage: string;
  fromDB: boolean;
  warnings?: string;
  sideEffects?: any;
  category?: string;
  strength?: string;
  manufacturer?: string;
  confidence: number;
  matchReason: string;
  aiExplanation: string;
  tabletUsage?: TabletUsage; // Multi-language tablet usage instructions
}

// Dynamic language response - supports any languages the AI returns
export interface MultiLanguageResponse {
  [language: string]: string; // Dynamic: english, hausa, yoruba, pashto, or any other language
}

// Notes can optionally include extra metadata arrays from the system prompt (dropdown + suggested questions)
export type MultiLanguageNotesResponse = MultiLanguageResponse & {
  languages?: LanguageOption[];
  suggestedQuestions?: Array<{
    text: string;
    icon: string;
    category: 'symptom' | 'medicine' | 'condition' | 'general';
  }>;
};

export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
}

export interface LanguageDropdownResponse {
  languages: LanguageOption[];
}

/**
 * Get all medicines from database for AI analysis
 */
export async function getAllMedicines(): Promise<any[]> {
  try {
    const medicines = await prisma.centralMedicine.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        genericName: true,
        description: true,
        illnessTypes: true,
        activeIngredients: true,
        dosageInfo: true,
        warnings: true,
        sideEffects: true,
        category: true,
        strength: true,
        manufacturer: true
      }
    });
    return medicines;
  } catch (error) {
    console.error('Error fetching medicines from database:', error);
    return [];
  }
}

/**
 * Use AI to intelligently match medicines based on patient problem
 */
export async function aiMatchMedicines(
  patientProblem: string,
  symptoms: string[],
  illnesses: string[],
  medicines: string[]
): Promise<AIRecommendedMedicine[]> {
  try {
    console.log('🧠 Using AI config system to intelligently match medicines...');
    
    // Get all medicines from database
    const allMedicines = await getAllMedicines();
    
    if (allMedicines.length === 0) {
      console.log('No medicines found in database');
      return [];
    }

    // Create medicine context for AI
    const medicineContext = allMedicines.map(med => ({
      name: med.name,
      genericName: med.genericName,
      description: med.description,
      illnessTypes: med.illnessTypes,
      activeIngredients: med.activeIngredients,
      dosageInfo: med.dosageInfo,
      warnings: med.warnings,
      sideEffects: med.sideEffects,
      category: med.category,
      strength: med.strength,
      manufacturer: med.manufacturer
    }));

    const matchingInput = {
      patientProblem,
      symptoms,
      illnesses,
      medicines,
    };

//     const minimalMatchingPrompt = `CRITICAL JSON-ONLY RULE:
// - Return ONLY valid JSON (no markdown, no extra text)
// - Start with { and end with }

// TASK: medicine_matching_internal

// Return EXACTLY this JSON shape:
// {
//   "recommendations": [
//     {
//       "medicineName": "Exact database name",
//       "confidence": 0.0,
//       "reason": "Why this medicine is suitable",
//       "aiExplanation": "Brief medical rationale"
//     }
//   ]
// }

// Rules:
// - "medicineName" MUST exactly match an approved database medicine name (case-insensitive is OK, but spelling must match).
// - Keep it concise to avoid truncation.
// - DO NOT include: english/hausa/yoruba/pashto, languages, suggestedQuestions, tabletUsage (those are generated elsewhere).

// INPUT:
// ${JSON.stringify(matchingInput, null, 2)}
// `;

    // Use the AI config system - let the system prompt and custom functions handle everything
    // The search_medicines function is available via customFunctions in the database config
    console.log('🤖 Calling AI config system with AI_DOCTOR useCase...');
    console.log('📋 Using system prompt and custom functions from database configuration');
    
    const aiResponse = await analyzeWithAI('AI_DOCTOR', matchingInput, {
      category: 'TEXT_TO_TEXT',
      maxTokens: 8192, // Prevent truncated JSON when the model is verbose
      // customPrompt: minimalMatchingPrompt,
      // Custom functions (like search_medicines) are automatically included from config
    });

    if (!aiResponse.content || aiResponse.content.trim().length === 0) {
      console.error('❌ AI returned empty content. This might mean:');
      console.error('  1. AI made function calls but final response is empty');
      console.error('  2. System prompt needs to instruct AI to return JSON after function calls');
      console.error('  3. Model returned an error or hit token limit');
      console.error('  4. The AI needs explicit instructions to return medicine recommendations in JSON format');
      throw new Error('No response from AI - content is empty. Your system prompt should instruct the AI to return JSON with medicine recommendations after using search_medicines function.');
    }
    
    console.log(`📥 AI response received (${aiResponse.content.length} chars):`, aiResponse.content.substring(0, 200) + '...');

    // Clean the response text (remove markdown code blocks if present)
    let cleanText = aiResponse.content.trim();
    
    // Remove ```json or ``` code blocks (handle multiline)
    cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    // Extract JSON from response (AI might return text before JSON)
    // Look for the first { and last } to extract the JSON object
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    // Try to parse JSON, but handle cases where AI returns natural language
    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('❌ AI returned invalid JSON (often truncation from token limits or extra text).');
      console.error('First 200 chars:', cleanText.substring(0, 200));
      console.error('Last 200 chars:', cleanText.substring(Math.max(0, cleanText.length - 200)));
      // Try to extract JSON from the response using regex
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } catch {
          throw new Error(
            'AI response is not valid JSON (possible truncation). Increase AI_DOCTOR maxTokens / model context or keep response smaller.'
          );
        }
      } else {
        throw new Error(
          'AI response did not contain a complete JSON object (possible truncation). Increase AI_DOCTOR maxTokens / model context or keep response smaller.'
        );
      }
    }
    
    // Handle new response format with 4 languages
    // The AI might return: { english, hausa, yoruba, pashto, recommendations: [...] }
    // Or just: { recommendations: [...] }
    const recommendationsArray = parsedResponse.recommendations || [];
    
    // Convert AI recommendations to our format
    const recommendations: AIRecommendedMedicine[] = [];
    
    for (const rec of recommendationsArray) {
      // Find the medicine in our database
      const dbMedicine = allMedicines.find(med => 
        med.name.toLowerCase() === rec.medicineName.toLowerCase() ||
        med.genericName?.toLowerCase() === rec.medicineName.toLowerCase()
      );
      
      if (dbMedicine) {
        // Extract tabletUsage from AI response if provided (dynamic - supports any languages)
        let tabletUsage: TabletUsage | undefined = undefined;
        if (rec.tabletUsage && typeof rec.tabletUsage === 'object') {
          // Use the tabletUsage object as-is (it's already dynamic from AI response)
          // The AI should return tabletUsage with language keys matching the systemPrompt languages
          tabletUsage = rec.tabletUsage as TabletUsage;
          
          // Ensure at least english exists as fallback
          if (!tabletUsage.english && !tabletUsage.en) {
            tabletUsage.english = dbMedicine.dosageInfo || 'Consult pharmacist for dosage';
          }
        }
        
        recommendations.push({
          name: dbMedicine.name,
          genericName: dbMedicine.genericName || undefined,
          dosage: dbMedicine.dosageInfo || 'Consult pharmacist for dosage',
          fromDB: true,
          warnings: dbMedicine.warnings || undefined,
          sideEffects: dbMedicine.sideEffects || undefined,
          category: dbMedicine.category,
          strength: dbMedicine.strength || undefined,
          manufacturer: dbMedicine.manufacturer || undefined,
          confidence: rec.confidence || 0.8,
          matchReason: rec.reason || 'AI recommended',
          aiExplanation: rec.aiExplanation || 'AI analysis based on patient condition',
          tabletUsage: tabletUsage
        });
      }
    }

    console.log(`✅ AI config system selected ${recommendations.length} medicines using model: ${aiResponse.modelName}`);
    return recommendations;

  } catch (error) {
    console.error('AI medicine matching failed:', error);
    return [];
  }
}

/**
 * Generate multi-language responses using AI config system
 */
export async function generateMultiLanguageResponse(
  englishText: string,
  context: string = 'medical advice'
): Promise<MultiLanguageResponse> {
  try {
    // Use AI_DOCTOR - system prompt handles translation format
    const aiResponse = await analyzeWithAI('AI_DOCTOR', {
      text: englishText,
      context,
      task: 'translate'
    }, {
      category: 'TEXT_TO_TEXT',
      disableTools: true, // translation should not trigger search_medicines
      // No customPrompt - use system prompt from database
    });

    if (!aiResponse.content) {
      throw new Error('No response from AI');
    }
    
    // Clean the response text
    let cleanText = aiResponse.content.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to parse JSON with error handling
    let translation: any;
    try {
      translation = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Translation response is not JSON:', cleanText.substring(0, 200));
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        translation = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: return at least English
        return {
          english: englishText
        };
      }
    }
    
    // Dynamically extract all languages from translation response
    const languageResponse: MultiLanguageResponse = {};
    
    // Extract all language fields
    for (const [key, value] of Object.entries(translation)) {
      if (typeof value === 'string' && key !== 'recommendations' && key !== 'languages') {
        languageResponse[key.toLowerCase()] = value;
      }
    }
    
    // Ensure at least english exists
    if (!languageResponse.english) {
      languageResponse.english = englishText;
    }
    
    return languageResponse;

  } catch (error) {
    console.error('Multi-language generation failed:', error);
    // Return at least english as fallback
    return {
      english: englishText
    };
  }
}

/**
 * Generate AI-powered notes with multi-language support
 */
export async function generateAINotes(
  symptoms: string[],
  illnesses: string[],
  medicines: AIRecommendedMedicine[],
  originalText: string,
  language: string = 'english'
): Promise<MultiLanguageNotesResponse> {
  // Build context data for AI_DOCTOR (which is trained to return multi-language JSON)
  const data = {
    symptoms,
    illnesses,
    medicines: medicines.map(m => ({
      name: m.name,
      genericName: m.genericName,
      dosage: m.dosage,
      confidence: m.confidence,
      matchReason: m.matchReason,
      aiExplanation: m.aiExplanation
    })),
    originalText,
    requestedLanguage: language
  };

  // Use AI_DOCTOR which is trained to return multi-language JSON response
  // Increase maxTokens for notes generation to avoid token limit errors (8192 for longer responses)
  const aiResponse = await analyzeWithAI('AI_DOCTOR', data, {
    category: 'TEXT_TO_TEXT',
    maxTokens: 8192, // Increase token limit for notes generation to prevent truncation
    disableTools: true, // notes generation should not call search_medicines
    // No customPrompt - let the AI_DOCTOR system prompt handle it
  });

  if (!aiResponse.content) {
    throw new Error('No response from AI_DOCTOR');
  }

  // Clean the response text (remove markdown code blocks if present)
  let cleanText = aiResponse.content.trim();
  
  // Remove ```json or ``` code blocks (handle multiline)
  cleanText = cleanText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  
  // Extract JSON from response (AI might return text before JSON)
  // Look for the first { and last } to extract the JSON object
  const firstBrace = cleanText.indexOf('{');
  const lastBrace = cleanText.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanText = cleanText.substring(firstBrace, lastBrace + 1);
  }

    // Parse the JSON response from AI_DOCTOR
    try {
      const notes = JSON.parse(cleanText);
      
      // Validate that we have the expected structure
      if (typeof notes === 'object' && notes !== null) {
        // Dynamically extract all languages from the response
        const languageResponse: MultiLanguageNotesResponse = {};
        
        // Extract all language fields (english, hausa, yoruba, pashto, or any other)
        for (const [key, value] of Object.entries(notes)) {
          // Pass-through known metadata fields if present
          if (key === 'languages' && Array.isArray(value)) {
            languageResponse.languages = value as any;
            continue;
          }
          if (key === 'suggestedQuestions' && Array.isArray(value)) {
            languageResponse.suggestedQuestions = value as any;
            continue;
          }
          if (key === 'recommendations') continue;
          if (Array.isArray(value)) continue;

          // If it's a string value, it's likely a language field
          if (typeof value === 'string') {
            const normalizedKey = key.toLowerCase();
            languageResponse[normalizedKey] = value;
          }
        }
        
        // Ensure at least english exists
        if (!languageResponse.english && notes.english) {
          languageResponse.english = notes.english;
        } else if (!languageResponse.english && notes.en) {
          languageResponse.english = notes.en;
        }
        
        // If no languages found, throw error
        if (Object.keys(languageResponse).length === 0) {
          throw new Error('AI response does not contain any language fields');
        }
        
        console.log(`✅ Extracted ${Object.keys(languageResponse).length} languages from notes:`, Object.keys(languageResponse));
        return languageResponse;
      } else {
        throw new Error('Invalid JSON structure from AI_DOCTOR');
      }
    } catch (parseError) {
      console.error('Failed to parse AI_DOCTOR response as JSON:', parseError);
      console.error('Raw response:', cleanText);
      
      // If parsing fails, throw error - no fallback, let the caller handle it
      throw new Error(`AI_DOCTOR returned invalid JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
    }
}

/**
 * Extract medical data (symptoms, illnesses, medicines) from text using AI config system
 */
export async function extractMedicalDataWithAI(text: string): Promise<{
  symptoms: string[];
  illnesses: string[];
  medicines: string[];
  confidence: number;
  source: string;
  usedRealAPI: boolean;
}> {
  try {
    console.log('🧠 Extracting medical data using AI config system...');
    console.log('📋 Using system prompt from database configuration');
    
    // Use AI_DOCTOR - system prompt handles extraction format
    const aiResponse = await analyzeWithAI('AI_DOCTOR', {
      text,
      task: 'extract_medical_data'
    }, {
      category: 'TEXT_TO_TEXT',
      maxTokens: 1024, // keep extraction fast and reduce truncation risk
      disableTools: true, // extraction should not call search_medicines
      // No customPrompt - use system prompt from database
    });

    if (!aiResponse.content) {
      throw new Error('No response from AI_DOCTOR');
    }

    // Clean the response text
    let cleanText = aiResponse.content.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to parse JSON with error handling
    let parsed: any;
    try {
      parsed = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Medical data extraction response is not JSON:', cleanText.substring(0, 200));
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
  } else {
        throw new Error('AI response is not in valid JSON format. Please update your system prompt to instruct the AI to return JSON for medical data extraction.');
      }
    }
    
    return {
      symptoms: Array.isArray(parsed.symptoms) ? parsed.symptoms : [],
      illnesses: Array.isArray(parsed.illnesses) ? parsed.illnesses : [],
      medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
      confidence: 0.90,
      source: `AI Config System (${aiResponse.modelName})`,
      usedRealAPI: true
    };
  } catch (error) {
    console.error('AI medical data extraction failed:', error);
    throw error;
  }
}

/**
 * Analyze medical image using AI config system
 */
export async function analyzeMedicalImageWithAI(
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
  processingTime: number;
}> {
  const startTime = Date.now();
  
  try {
    console.log(`🏥 Analyzing medical image type: ${imageType} using AI config system...`);
    
    // Convert image buffer to base64 data URL
    let mimeType = 'image/jpeg';
    if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
      mimeType = 'image/png';
    } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46) {
      mimeType = 'image/gif';
    } else if (imageBuffer[0] === 0x52 && imageBuffer[1] === 0x49 && imageBuffer[2] === 0x46 && imageBuffer[3] === 0x46) {
      mimeType = 'image/webp';
  }
  
    const imageBase64 = imageBuffer.toString('base64');
    const imageDataUrl = `data:${mimeType};base64,${imageBase64}`;
    
    // Use AI config system with IMAGE_TO_TEXT category
    // System prompt from database handles image analysis format
    console.log('🤖 Calling AI config system with IMAGE_TO_TEXT category...');
    console.log('📋 Using system prompt and custom functions from database configuration');
    
    const aiResponse = await analyzeWithAI('AI_DOCTOR', {
      imageType,
      task: 'analyze_medical_image'
    }, {
      category: 'IMAGE_TO_TEXT',
      disableTools: true, // image analysis should not call search_medicines
      imageUrl: imageDataUrl
      // No customPrompt - use system prompt from database
      // Custom functions (like search_medicines) are automatically included from config
    });
    
    if (!aiResponse.content) {
      throw new Error('No response from AI');
    }

    // Clean the response text
    let cleanText = aiResponse.content.trim();
    if (cleanText.startsWith('```json')) {
      cleanText = cleanText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanText.startsWith('```')) {
      cleanText = cleanText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    // Try to parse as JSON, if it fails, use the text as-is
    let extractedData: any = {
      medicines: [],
      dosages: [],
      symptoms: [],
      conditions: [],
      instructions: []
    };
    
    try {
      const parsed = JSON.parse(cleanText);
      extractedData = {
        medicines: parsed.medicines || [],
        dosages: parsed.dosages || [],
        symptoms: parsed.symptoms || [],
        conditions: parsed.conditions || [],
        instructions: parsed.instructions || []
      };
    } catch (parseError) {
      // If not JSON, extract basic medical terms from text
      console.log('Response is not JSON, extracting medical terms from text...');
      const lowerText = cleanText.toLowerCase();
      
      // Basic extraction (can be improved)
      const medicineKeywords = ['paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'amoxicillin'];
      const symptomKeywords = ['headache', 'fever', 'pain', 'cough', 'nausea', 'rash'];
      
      extractedData.medicines = medicineKeywords.filter(kw => lowerText.includes(kw));
      extractedData.symptoms = symptomKeywords.filter(kw => lowerText.includes(kw));
    }
    
    const processingTime = Date.now() - startTime;
    
    return {
      text: cleanText,
      confidence: 0.90,
      source: `AI Config System (${aiResponse.modelName} - ${imageType})`,
      extractedData,
      processingTime
    };
    
  } catch (error) {
    console.error('❌ Medical image analysis failed:', error);
    throw error;
  }
}
