// Real API implementations for Virtual Doctor
// This version uses actual external APIs with proper error handling

import OpenAI from 'openai';

// Initialize OpenAI only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

export interface RealMedicalData {
  symptoms: string[];
  illnesses: string[];
  medicines: string[];
  confidence: number;
  source: string;
}

export interface RealOCRResult {
  text: string;
  confidence: number;
  source: string;
}

export interface RealSpeechResult {
  text: string;
  confidence: number;
  source: string;
}

/**
 * Real speech-to-text using OpenAI Whisper
 */
export async function realSpeechToText(audioBuffer: Buffer): Promise<RealSpeechResult> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    console.log('Using OpenAI Whisper for speech-to-text...');
    
    // Convert Buffer to File for OpenAI API
    const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
    const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' });
    const audioFile = new File([audioBlob], 'audio.wav', { type: 'audio/wav' });
    
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'en',
      response_format: 'verbose_json',
    });

    return {
      text: transcription.text,
      confidence: 0.9,
      source: 'OpenAI Whisper (Real API)'
    };
  } catch (error) {
    console.error('OpenAI Whisper failed:', error);
    throw new Error('Speech-to-text processing failed');
  }
}

/**
 * Real OCR using OpenAI Vision (GPT-4V)
 */
export async function realOCR(imageBuffer: Buffer): Promise<RealOCRResult> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    console.log('Using OpenAI Vision for OCR...');
    
    // Convert Buffer to base64 for OpenAI Vision
    const base64Image = imageBuffer.toString('base64');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Extract all text from this prescription or medical document. Include medicine names, dosages, doctor notes, and any other relevant medical information. Return only the extracted text without any additional commentary.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: 'high'
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
    });

    const extractedText = response.choices[0]?.message?.content || '';
    
    if (!extractedText.trim()) {
      throw new Error('No text could be extracted from the image');
    }

    return {
      text: extractedText,
      confidence: 0.85,
      source: 'OpenAI Vision (Real API)'
    };
  } catch (error) {
    console.error('OpenAI Vision OCR failed:', error);
    throw new Error('OCR processing failed');
  }
}

/**
 * Real NLP processing using OpenAI GPT-4
 */
export async function realNLP(text: string): Promise<RealMedicalData> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    console.log('Using OpenAI GPT-4 for NLP processing...');
    
    const prompt = `
Analyze the following medical text and extract structured information:

Text: "${text}"

Please extract and return a JSON response with this exact structure:
{
  "symptoms": ["symptom1", "symptom2"],
  "illnesses": ["illness1", "illness2"],
  "medicines": ["medicine1", "medicine2"]
}

Instructions:
- Extract all mentioned symptoms (headache, fever, pain, etc.)
- Identify possible illnesses or conditions
- Extract any mentioned medicines or medications
- Use medical terminology when appropriate
- Be conservative and only include clearly mentioned items
- Return ONLY the JSON, no other text

Example:
Input: "I have a headache and fever, might be the flu. Doctor prescribed paracetamol."
Output: {"symptoms": ["headache", "fever"], "illnesses": ["flu"], "medicines": ["paracetamol"]}
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
      throw new Error('No response from OpenAI GPT-4');
    }

    // Parse JSON response
    const parsed = JSON.parse(responseText);
    
    return {
      symptoms: parsed.symptoms || [],
      illnesses: parsed.illnesses || [],
      medicines: parsed.medicines || [],
      confidence: 0.9,
      source: 'OpenAI GPT-4 (Real API)'
    };
  } catch (error) {
    console.error('OpenAI GPT-4 NLP failed:', error);
    throw new Error('NLP processing failed');
  }
}

/**
 * Main processing function with real APIs
 */
export async function processInputReal(inputType: 'text' | 'audio' | 'image', data: any): Promise<{ text: string; source: string }> {
  switch (inputType) {
    case 'text':
      return { text: data, source: 'Direct text input' };
    case 'audio':
      return await realSpeechToText(data);
    case 'image':
      return await realOCR(data);
    default:
      throw new Error('Invalid input type');
  }
}
