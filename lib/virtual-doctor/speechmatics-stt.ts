// Speechmatics Real-time Speech-to-Text Integration
// Provides high-quality speech recognition for medical voice inputs

import https from "node:https";
import { createSpeechmaticsJWT } from "@speechmatics/auth";
import { RealtimeClient } from "@speechmatics/real-time-client";

const SPEECHMATICS_API_KEY = "mVChmcze4uQ60BFSgwu9EvDesuLmlplv";

export interface SpeechmaticsResult {
  text: string;
  confidence: number;
  source: string;
  isComplete: boolean;
  words?: Array<{
    content: string;
    confidence: number;
    start_time?: number;
    end_time?: number;
  }>;
}

/**
 * Convert audio buffer to Speechmatics-compatible format
 */
function audioBufferToStream(audioBuffer: Buffer): Buffer {
  // For now, we'll return the buffer as-is
  // In a real implementation, you might need to convert formats
  return audioBuffer;
}

/**
 * Speechmatics Real-time Speech-to-Text
 */
export async function speechmaticsSpeechToText(audioBuffer: Buffer): Promise<SpeechmaticsResult> {
  return new Promise((resolve, reject) => {
    try {
      console.log('🎤 Starting Speechmatics real-time transcription...');
      
      const client = new RealtimeClient();
      let fullTranscript = '';
      let wordCount = 0;
      let totalConfidence = 0;
      let isComplete = false;
      const words: Array<{ content: string; confidence: number }> = [];

      // Set up event listeners
      client.addEventListener("receiveMessage", ({ data }) => {
        if (data.message === "AddTranscript") {
          for (const result of data.results) {
            if (result.type === "word") {
              const word = result.alternatives?.[0];
              if (word) {
                words.push({
                  content: word.content,
                  confidence: word.confidence || 0.8
                });
                totalConfidence += word.confidence || 0.8;
                wordCount++;
                fullTranscript += word.content + ' ';
              }
            }
            
            if (result.is_eos) {
              fullTranscript += '\n';
            }
          }
        } else if (data.message === "EndOfTranscript") {
          console.log('✅ Speechmatics transcription completed');
          isComplete = true;
          
          const avgConfidence = wordCount > 0 ? totalConfidence / wordCount : 0.8;
          
          resolve({
            text: fullTranscript.trim(),
            confidence: avgConfidence,
            source: 'Speechmatics Real-time STT',
            isComplete: true,
            words: words
          });
        } else if (data.message === "Error") {
          console.error('❌ Speechmatics error:', data);
          reject(new Error(`Speechmatics error: ${JSON.stringify(data)}`));
        }
      });

      // Start transcription
      startTranscription(client, audioBuffer, resolve, reject);

    } catch (error) {
      console.error('❌ Speechmatics STT failed:', error);
      reject(error);
    }
  });
}

/**
 * Start the transcription process
 */
async function startTranscription(
  client: RealtimeClient, 
  audioBuffer: Buffer, 
  resolve: (value: SpeechmaticsResult) => void,
  reject: (reason?: any) => void
) {
  try {
    // Create JWT token
    const jwt = await createSpeechmaticsJWT({
      type: "rt",
      apiKey: SPEECHMATICS_API_KEY,
      ttl: 60, // 1 minute
    });

    // Start the client with medical-optimized configuration
    await client.start(jwt, {
      transcription_config: {
        language: "en",
        operating_point: "enhanced", // Better accuracy for medical terms
        max_delay: 1.0,
        transcript_filtering_config: {
          remove_disfluencies: true, // Remove "um", "uh", etc.
        },
        // Medical-specific enhancements
        punctuation_overrides: {
          permitted_marks: [".", ",", "?", "!"],
        },
        diarization: "none", // Single speaker for medical consultations
      },
    });

    console.log('🎯 Speechmatics client started, sending audio...');

    // Send audio data
    client.sendAudio(audioBuffer);

    // Stop recognition after sending all audio
    setTimeout(() => {
      client.stopRecognition({ noTimeout: true });
    }, 1000); // Give it time to process

  } catch (error) {
    console.error('❌ Failed to start Speechmatics transcription:', error);
    reject(error);
  }
}

/**
 * Batch Speech-to-Text for audio files
 */
export async function speechmaticsBatchSTT(audioBuffer: Buffer): Promise<SpeechmaticsResult> {
  try {
    console.log('🎤 Starting Speechmatics batch transcription...');
    
    // For batch processing, we would use the Speechmatics batch API
    // This is a simplified implementation
    const result = await speechmaticsSpeechToText(audioBuffer);
    
    return {
      ...result,
      source: 'Speechmatics Batch STT'
    };
    
  } catch (error) {
    console.error('❌ Speechmatics batch STT failed:', error);
    throw error;
  }
}

/**
 * Test Speechmatics connection
 */
export async function testSpeechmaticsConnection(): Promise<boolean> {
  try {
    console.log('🧪 Testing Speechmatics connection...');
    
    // Create a small test audio buffer (silence)
    const testBuffer = Buffer.alloc(1024); // 1KB of silence
    
    const result = await speechmaticsSpeechToText(testBuffer);
    
    console.log('✅ Speechmatics connection test successful');
    return true;
    
  } catch (error) {
    console.error('❌ Speechmatics connection test failed:', error);
    return false;
  }
}

/**
 * Enhanced medical speech processing with Speechmatics
 */
export async function processMedicalSpeech(audioBuffer: Buffer): Promise<{
  text: string;
  confidence: number;
  source: string;
  medicalTerms: {
    symptoms: string[];
    medicines: string[];
    conditions: string[];
  };
}> {
  try {
    console.log('🏥 Processing medical speech with Speechmatics...');
    
    // Get transcription from Speechmatics
    const transcription = await speechmaticsSpeechToText(audioBuffer);
    
    // Extract medical terms from the transcription
    const medicalTerms = extractMedicalTermsFromText(transcription.text);
    
    console.log('✅ Medical speech processing completed:', {
      textLength: transcription.text.length,
      confidence: transcription.confidence,
      symptomsFound: medicalTerms.symptoms.length,
      medicinesFound: medicalTerms.medicines.length,
      conditionsFound: medicalTerms.conditions.length
    });
    
    return {
      text: transcription.text,
      confidence: transcription.confidence,
      source: transcription.source,
      medicalTerms
    };
    
  } catch (error) {
    console.error('❌ Medical speech processing failed:', error);
    throw error;
  }
}

/**
 * Extract medical terms from transcribed text
 */
function extractMedicalTermsFromText(text: string): {
  symptoms: string[];
  medicines: string[];
  conditions: string[];
} {
  const lowerText = text.toLowerCase();
  
  // Medical term patterns
  const symptomPatterns = [
    'headache', 'fever', 'pain', 'cough', 'nausea', 'vomiting', 'diarrhea',
    'rash', 'swelling', 'inflammation', 'sore throat', 'runny nose', 'congestion',
    'fatigue', 'weakness', 'dizziness', 'chills', 'sweating', 'muscle pain',
    'joint pain', 'back pain', 'chest pain', 'stomach pain', 'abdominal pain',
    'shortness of breath', 'difficulty breathing', 'chest tightness'
  ];
  
  const medicinePatterns = [
    'paracetamol', 'acetaminophen', 'ibuprofen', 'aspirin', 'amoxicillin',
    'metformin', 'lisinopril', 'atorvastatin', 'omeprazole', 'levothyroxine',
    'vitamin', 'supplement', 'medicine', 'medication', 'drug', 'pill', 'tablet',
    'capsule', 'syrup', 'injection', 'cream', 'ointment'
  ];
  
  const conditionPatterns = [
    'flu', 'cold', 'fever', 'infection', 'inflammation', 'allergy', 'asthma',
    'diabetes', 'hypertension', 'arthritis', 'depression', 'anxiety', 'pneumonia',
    'bronchitis', 'gastritis', 'dermatitis', 'migraine', 'sinusitis', 'covid',
    'coronavirus', 'strep throat', 'ear infection', 'urinary tract infection'
  ];
  
  const symptoms = symptomPatterns.filter(pattern => lowerText.includes(pattern));
  const medicines = medicinePatterns.filter(pattern => lowerText.includes(pattern));
  const conditions = conditionPatterns.filter(pattern => lowerText.includes(pattern));
  
  return { symptoms, medicines, conditions };
}
