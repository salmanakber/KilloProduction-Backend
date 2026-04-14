import { NextRequest, NextResponse } from 'next/server';
import { findMatchingMedicines, generateNotes, VirtualDoctorResponse } from '@/lib/virtual-doctor/database-mapping';
import { aiMatchMedicines, generateAINotes, analyzeMedicalImageWithAI, extractMedicalDataWithAI, MultiLanguageResponse } from '@/lib/virtual-doctor/ai-medicine-matcher';
import { speechmaticsSpeechToText } from '@/lib/virtual-doctor/speechmatics-stt';
import { findMedicinesFromNearbyPharmacies } from '@/lib/virtual-doctor/pharmacy-matcher';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function safeJsonResponse(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  // NextResponse.json() will throw on BigInt; this keeps responses always serializable.
  // Also ensures CORS headers are present on POST responses (not just OPTIONS).
  let body: string;
  try {
    body = JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value));
  } catch (e: any) {
    console.error('❌ Failed to serialize JSON response:', e);
    body = JSON.stringify({
      error: 'Response serialization failed',
      details: e?.message || String(e),
    });
  }

  return new NextResponse(body, {
    status: init?.status ?? 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Extract basic medical terms from text when NLP fails
 */
function extractBasicMedicalTerms(text: string): {
  symptoms: string[];
  illnesses: string[];
  medicines: string[];
} {
  const lowerText = text.toLowerCase();
  
  // Common medical terms
  const symptomKeywords = [
    'headache', 'fever', 'pain', 'cough', 'nausea', 'vomiting', 'diarrhea', 
    'rash', 'swelling', 'inflammation', 'sore throat', 'runny nose', 'congestion',
    'fatigue', 'weakness', 'dizziness', 'chills', 'sweating', 'muscle pain',
    'joint pain', 'back pain', 'chest pain', 'stomach pain', 'abdominal pain'
  ];
  
  const illnessKeywords = [
    'flu', 'cold', 'fever', 'infection', 'inflammation', 'allergy', 'asthma',
    'diabetes', 'hypertension', 'arthritis', 'depression', 'anxiety', 'pneumonia',
    'bronchitis', 'gastritis', 'dermatitis', 'migraine', 'sinusitis'
  ];
  
  const medicineKeywords = [
    'paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'amoxicillin',
    'metformin', 'lisinopril', 'atorvastatin', 'omeprazole', 'levothyroxine',
    'vitamin', 'supplement', 'medicine', 'medication', 'drug', 'pill', 'tablet'
  ];
  
  const symptoms = symptomKeywords.filter(keyword => lowerText.includes(keyword));
  const illnesses = illnessKeywords.filter(keyword => lowerText.includes(keyword));
  const medicines = medicineKeywords.filter(keyword => lowerText.includes(keyword));
  
  return { symptoms, illnesses, medicines };
}

/**
 * Generate static notes in requested language
 */
function generateStaticNotes(medicalData: any, medicines: any[], extractedText: string, language: string) {
  if (medicines.length === 0) {
    const noMedicinesMessages = {
      english: `Based on your input, I couldn't find specific medicines in our database. General recommendations: Stay hydrated, get adequate rest, maintain a balanced diet, and consult a pharmacist for personalized advice. If symptoms persist or worsen, seek immediate medical attention.`,
      hausa: 'Bisa shigarwar ku, ban sami takamaiman magunguna a cikin bayananmu ba. Shawarar gabaɗaya: Sha ruwa sosai, sami isasshen hutu, ci abinci mai kyau, kuma tuntuɓi mai sayar da magunguna don shawara ta musamman. Idan alamun suka ci gaba ko su karu, nemi kulawar likita nan take.',
      yoruba: 'Bẹsẹ lori ifiranṣẹ rẹ, mi ko ri awọn oogun pataki ni data wa. Imọran gbogbogbo: Mu omi to pọ, gba irẹlẹ to tọ, jẹ ounjẹ to dara, ki o sọrọ pẹlu onimọ egbogi fun imọran ti o jẹmọ. Ti awọn ami ba tẹsiwaju tabi buru si, wa itọju iwosan lẹsẹkẹsẹ.'
    };
    return noMedicinesMessages[language] || noMedicinesMessages.english;
  }
  
  const symptomsText = medicalData.symptoms.length > 0 ? medicalData.symptoms.join(', ') : 'your symptoms';
  const illnessesText = medicalData.illnesses.length > 0 ? medicalData.illnesses.join(', ') : 'your condition';
  
  const notesTemplates = {
    english: `Based on ${symptomsText}, I've identified potential ${illnessesText}. I recommend the following ${medicines.length} medicine(s) from our database that may help. Please consult with a pharmacist before taking any medication.`,
    hausa: `Bisa ${symptomsText}, na gano yiwuwar ${illnessesText}. Ina ba da shawarar waɗannan magunguna ${medicines.length} daga bayananmu waɗanda za su iya taimakawa. Da fatan za a tuntuɓi mai sayar da magunguna kafin shan kowane magani.`,
    yoruba: `Bẹsẹ lori ${symptomsText}, Mo ti ṣe idanimọ ${illnessesText} ti o ṣeeṣe. Mo ṣe imọran awọn oogun ${medicines.length} wọnyi lati inu data wa ti o le ṣe iranlọwọ. Jọwọ ba onimọ egbogi kan sọrọ ṣaaju ki o mu eyikeyi oogun.`
  };
  
  return notesTemplates[language] || notesTemplates.english;
}

/**
 * Get disclaimer in requested language
 */
function getDisclaimer(language: string) {
  const disclaimers = {
    english: 'This is AI-powered guidance, not medical advice. Always consult a licensed healthcare professional.',
    hausa: 'Wannan jagorar AI ce, ba shawarar likita ba ce. Kullum tuntuɓi ƙwararren kiwon lafiya mai lasisi.',
    yoruba: 'Eyi jẹ itọsọna ti AI, kii ṣe imọran iwosan. Nigbagbogbo ba onimọ iwosan ti o ni iwe-aṣẹ kan sọrọ.'
  };
  
  return disclaimers[language] || disclaimers.english;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {

    
    let audioFile: File | null = null;
    let imageFile: File | null = null;
    let textInput: string | null = null;
    let language: string = 'english'; // Default language
    let imageType: string = 'general';
    let userLat: number | null = null;
    let userLon: number | null = null;
    
    const contentType = request.headers.get('content-type');
    
    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle FormData
      const formData = await request.formData();
      console.log('FormData entries:', Array.from(formData.entries()));
      
      audioFile = formData.get('audioFile') as File | null;
      imageFile = formData.get('imageFile') as File | null;
      textInput = formData.get('textInput') as string | null;
      language = (formData.get('language') as string) || 'english';
      imageType = (formData.get('imageType') as string) || 'general';
      userLat = formData.get('latitude') ? parseFloat(formData.get('latitude') as string) : null;
      userLon = formData.get('longitude') ? parseFloat(formData.get('longitude') as string) : null;
    } else {
      // Handle JSON
      const body = await request.json();
      console.log('JSON body:', body);
      
      textInput = body.textInput || null;
      language = body.language || 'english';
      imageType = body.imageType || 'general';
      userLat = body.latitude ? parseFloat(body.latitude) : null;
      userLon = body.longitude ? parseFloat(body.longitude) : null;
      // Note: audioFile and imageFile would need to be handled differently for JSON
    }

    // Validate input
    if (!audioFile && !imageFile && !textInput) {
      return safeJsonResponse(
        { error: 'No input provided. Please provide audio, image, or text input.' },
        { status: 400 }
      );
    }

    let extractedText = '';
    let inputType: 'voice' | 'image' | 'text' = 'text';
    let textExtractionSource = '';
    let medicalData: any = { symptoms: [], illnesses: [], medicines: [], source: '' };

    // Process input based on type with HYBRID approach
    if (audioFile) {
      console.log('🎤 Processing audio input with Speechmatics...');
      inputType = 'voice';
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      
      try {
        // Try Speechmatics first (best quality)
        console.log('🔄 Attempting Speechmatics speech-to-text...');
        const speechmaticsResult = await speechmaticsSpeechToText(audioBuffer);
        extractedText = speechmaticsResult.text;
        textExtractionSource = speechmaticsResult.source;
        console.log(`🎯 Speechmatics processing: ${speechmaticsResult.source} (confidence: ${speechmaticsResult.confidence})`);
      } catch (speechmaticsError) {
        console.log('⚠️ Speechmatics failed, no fallback available...');
        console.error('Speechmatics error:', speechmaticsError);
        throw new Error('Audio processing failed. Please try text or image input instead.');
      }
    } else if (imageFile) {
      console.log('📷 Processing image input with AI config system...');
      inputType = 'image';
      const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
      
      try {
        // Try enhanced medical image analysis using AI config system
        const validImageTypes: ('prescription' | 'medicine_label' | 'medical_report' | 'symptom_photo' | 'general')[] = ['prescription', 'medicine_label', 'medical_report', 'symptom_photo', 'general'];
        const analysisType = validImageTypes.includes(imageType as any) ? imageType as any : 'general';
        const medicalAnalysis = await analyzeMedicalImageWithAI(imageBuffer, analysisType);
        extractedText = medicalAnalysis.text;
        textExtractionSource = medicalAnalysis.source;
        console.log(`🎯 AI config image analysis: ${medicalAnalysis.source} (confidence: ${medicalAnalysis.confidence})`);
        
        // Extract medical data from image analysis
        if (medicalAnalysis.extractedData) {
          console.log('📊 Extracted medical data from image:', {
            medicines: medicalAnalysis.extractedData.medicines?.length || 0,
            symptoms: medicalAnalysis.extractedData.symptoms?.length || 0,
            conditions: medicalAnalysis.extractedData.conditions?.length || 0,
            instructions: medicalAnalysis.extractedData.instructions?.length || 0
          });
          
          // Pre-populate medicalData with extracted information
          medicalData.medicines = medicalAnalysis.extractedData.medicines || [];
          medicalData.symptoms = medicalAnalysis.extractedData.symptoms || [];
          medicalData.illnesses = medicalAnalysis.extractedData.conditions || [];
        }
      } catch (enhancedError) {
        console.log('⚠️ AI config image analysis failed:', enhancedError);
        throw new Error('Image analysis failed. Please try a clearer image or use text input instead.');
      }
    } else if (textInput) {
      console.log('📝 Processing text input...');
      extractedText = textInput;
      textExtractionSource = 'Direct text input';
      console.log(`🎯 Text processing: Direct text input`);
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return safeJsonResponse(
        { error: 'Could not extract text from the provided input. Please try again with clearer audio or image.' },
        { status: 400 }
      );
    }

    console.log('Extracted text:', extractedText.substring(0, 200) + '...');

    // Parse medical data using AI config system (skip if already extracted from image)
    if (medicalData.symptoms.length === 0 && medicalData.illnesses.length === 0 && medicalData.medicines.length === 0) {
      console.log('🧠 Parsing medical data with AI config system...');
      try {
        medicalData = await extractMedicalDataWithAI(extractedText);
        console.log(`🎯 NLP processing: ${medicalData.source}`);
      } catch (aiError) {
        console.log('⚠️ AI config NLP failed, using basic extraction...');
        // Fallback to basic extraction
        const basicMedicalTerms = extractBasicMedicalTerms(extractedText);
        medicalData = {
          symptoms: basicMedicalTerms.symptoms,
          illnesses: basicMedicalTerms.illnesses,
          medicines: basicMedicalTerms.medicines,
          confidence: 0.5,
          source: 'Basic keyword extraction',
          usedRealAPI: false
        };
        console.log(`🎯 NLP processing: Basic keyword extraction`);
      }
    }
    
    console.log('Medical data parsed:', {
      symptoms: medicalData.symptoms,
      illnesses: medicalData.illnesses,
      medicines: medicalData.medicines,
      symptomsCount: medicalData.symptoms.length,
      illnessesCount: medicalData.illnesses.length,
      medicinesCount: medicalData.medicines.length
    });

    // If no medical data was extracted, try to extract from the original text
    if (medicalData.symptoms.length === 0 && medicalData.illnesses.length === 0 && medicalData.medicines.length === 0) {
      console.log('⚠️ No medical data extracted, trying to extract from original text...');
      
      // Try to extract basic medical terms from the original text
      const basicMedicalTerms = extractBasicMedicalTerms(extractedText);
      if (basicMedicalTerms.symptoms.length > 0 || basicMedicalTerms.illnesses.length > 0) {
        medicalData.symptoms = [...medicalData.symptoms, ...basicMedicalTerms.symptoms];
        medicalData.illnesses = [...medicalData.illnesses, ...basicMedicalTerms.illnesses];
        medicalData.medicines = [...medicalData.medicines, ...basicMedicalTerms.medicines];
        console.log('✅ Extracted basic medical terms:', basicMedicalTerms);
      }
    }

    // Try AI medicine matching using AI config system
    let recommendedMedicines: any[] = [];
    let isAIPowered = false;
    let aiSource = 'none';
    
    try {
      console.log('🧠 Attempting AI medicine matching with AI config system...');
      const aiRecommendedMedicines = await aiMatchMedicines(
        extractedText,
        medicalData.symptoms,
        medicalData.illnesses,
        medicalData.medicines
      );
      
      if (aiRecommendedMedicines && aiRecommendedMedicines.length > 0) {
        recommendedMedicines = aiRecommendedMedicines;
        isAIPowered = true;
        aiSource = 'ai_config';
        console.log(`🤖 AI config system found ${aiRecommendedMedicines.length} intelligent medicine recommendations`);
      } else {
        throw new Error('AI config system returned no results');
      }
    } catch (aiError) {
      console.log('⚠️ AI config medicine matching failed, falling back to keyword matching:', aiError);
          
          // Fallback to keyword matching
          recommendedMedicines = await findMatchingMedicines(
            medicalData.illnesses,
            medicalData.medicines,
            medicalData.symptoms
          );
          isAIPowered = false;
          aiSource = 'keyword';
          console.log(`📚 Keyword matching found ${recommendedMedicines.length} medicines`);
    }

    // Generate AI-formatted notes based on language
    let notes;
    const useAIFormatting = isAIPowered && recommendedMedicines.length > 0;
    
    if (useAIFormatting) {
      // Use AI to generate natural, formatted notes in the requested language
      try {
        const aiNotes = await generateAINotes(
          medicalData.symptoms,
          medicalData.illnesses,
          recommendedMedicines,
          extractedText,
          language
        );
        notes = aiNotes;
        console.log(`🤖 AI-generated notes in ${language}`);
      } catch (aiNotesError) {
        console.log('⚠️ AI notes generation failed, using template-based notes');
        notes = generateStaticNotes(medicalData, recommendedMedicines, extractedText, language);
      }
    } else {
      notes = generateStaticNotes(medicalData, recommendedMedicines, extractedText, language);
    }
    
    const disclaimer = getDisclaimer(language);

    // Check if notes is a multi-language object. Notes may also contain metadata arrays like
    // `languages` and `suggestedQuestions`, so we only require that it has at least one
    // string language field.
    const isMultiLanguage =
      typeof notes === 'object' &&
      notes !== null &&
      !Array.isArray(notes) &&
      Object.keys(notes as any).some((k) => {
        const lower = k.toLowerCase();
        if (['recommendations', 'languages', 'suggestedquestions'].includes(lower)) return false;
        return typeof (notes as any)[k] === 'string';
      });
    
    // Extract available languages from notes (dynamic - supports any languages AI returns)
    // Filter out non-language keys like 'recommendations', 'languages', 'suggestedQuestions'
    let availableLanguages: string[] = [];
    if (isMultiLanguage) {
      const excludedKeys = ['recommendations', 'languages', 'suggestedQuestions'];
      availableLanguages = Object.keys(notes as any).filter(key => 
        !excludedKeys.includes(key.toLowerCase()) && typeof (notes as any)[key] === 'string'
      );
    }
    
    // Also check if AI returned a languages array with codes/flags
    let languageDropdown: any[] = [];
    if (isMultiLanguage && typeof notes === 'object' && 'languages' in notes && Array.isArray((notes as any).languages)) {
      languageDropdown = (notes as any).languages;
      // Extract language codes from dropdown if available
      const codes = languageDropdown.map((lang: any) => {
        if (typeof lang === 'object' && lang.code) {
          // Map codes to language keys
          const codeMap: { [key: string]: string } = {
            'en': 'english',
            'ha': 'hausa',
            'yo': 'yoruba',
            'ps': 'pashto'
          };
          return codeMap[lang.code] || lang.code;
        }
        return null;
      }).filter(Boolean);
      
      if (codes.length > 0) {
        const uniqueLanguages = new Set([...availableLanguages, ...codes]);
        availableLanguages = Array.from(uniqueLanguages);
      }
    }
    
    // Fallback to default language if no languages found
    if (availableLanguages.length === 0) {
      availableLanguages = [language];
    }
    
    console.log(`🌐 Available languages detected:`, availableLanguages);
    if (languageDropdown.length > 0) {
      console.log(`🌐 Language dropdown data:`, languageDropdown);
    }
    
    // Extract suggested questions from AI response if present
    let suggestedQuestions: any[] = [];
    if (isMultiLanguage && typeof notes === 'object') {
      // Check if AI included suggestedQuestions in the response
      if ('suggestedQuestions' in notes && Array.isArray((notes as any).suggestedQuestions)) {
        suggestedQuestions = (notes as any).suggestedQuestions;
      }
    }
    
    // Prepare response with dynamic language support
    const disclaimerByLanguage = availableLanguages.reduce((acc: any, lang: string) => {
      acc[lang] = getDisclaimer(lang);
      return acc;
    }, {});

    const response: any = {
      diagnosis: medicalData.illnesses,
      recommended_medicines: recommendedMedicines,
      notes: isMultiLanguage ? notes : (typeof notes === 'string' ? { [language]: notes } : notes),
      disclaimer: isMultiLanguage ? disclaimerByLanguage : { [language]: disclaimer },
      processing_info: {
        input_type: inputType,
        image_type: inputType === 'image' ? imageType : null,
        text_extracted: extractedText.substring(0, 500),
        nlp_source: medicalData.source,
        medicines_found: recommendedMedicines.length,
        processing_time_ms: Date.now() - startTime,
        ai_powered: isAIPowered,
        ai_source: aiSource,
        language,
        extracted_symptoms: medicalData.symptoms,
        text_extraction_source: textExtractionSource,
        available_languages: availableLanguages // Dynamic list of languages from AI response
      }
    };
    
    // Add suggested questions if AI provided them
    if (suggestedQuestions.length > 0) {
      response.suggested_questions = suggestedQuestions;
    }
    
    // Add language dropdown info if AI provided it
    if (languageDropdown.length > 0) {
      response.available_languages_dropdown = languageDropdown;
    } else if (isMultiLanguage && typeof notes === 'object' && 'languages' in notes) {
      response.available_languages_dropdown = (notes as any).languages;
    }

    console.log('Virtual Doctor processing completed successfully');
    console.log(`📊 Final response: ${recommendedMedicines.length} medicines, language: ${language}`);
    return safeJsonResponse(response);

  } catch (error: any) {
    console.error('Virtual Doctor processing failed:', error);
    
    // Get language from error context or use default
    const errorLanguage = (error as any)?.language || 'english';
    const errorMessages = {
      english: 'Unable to process your input at this time. Please try again or consult a healthcare professional directly.',
      hausa: 'Ba za a iya sarrafa shigarwar ku a wannan lokacin ba. Da fatan za a sake gwadawa ko tuntuɓi ƙwararren kiwon lafiya kai tsaye.',
      yoruba: 'A ko le ṣe iṣẹ pẹlu ifiranṣẹ rẹ ni akoko yii. Jọwọ gbiyanju lẹẹkansi tabi ba onimọ iwosan kan sọrọ taara.'
    };
    
    // Return a fallback response if all processing fails (old format for compatibility)
    const fallbackResponse = {
      diagnosis: [],
      recommended_medicines: [],
      notes: {
        [errorLanguage]: errorMessages[errorLanguage] || errorMessages.english
      },
      disclaimer: {
        [errorLanguage]: getDisclaimer(errorLanguage)
      },
      processing_info: {
        input_type: 'text',
        image_type: null,
        text_extracted: '',
        nlp_source: 'Error',
        medicines_found: 0,
        processing_time_ms: Date.now() - startTime,
        ai_powered: false,
        ai_source: 'error',
        language: errorLanguage,
        error: error.message
      }
    };

    return safeJsonResponse(fallbackResponse, { status: 500 });
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}
