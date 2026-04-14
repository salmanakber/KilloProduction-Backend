import OpenAI from 'openai';
import { SpeechClient } from '@google-cloud/speech';
import { SpeechConfig, AudioConfig, SpeechRecognizer } from 'microsoft-cognitiveservices-speech-sdk';

// Initialize OpenAI only if API key is available
const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Initialize Google Speech-to-Text only if credentials are available
const speechClient = process.env.GOOGLE_APPLICATION_CREDENTIALS ? new SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_PROJECT_ID,
}) : null;

// Azure Speech Service configuration only if API key is available
const speechConfig = process.env.AZURE_SPEECH_API_KEY ? SpeechConfig.fromSubscription(
  process.env.AZURE_SPEECH_API_KEY,
  process.env.AZURE_SPEECH_REGION!
) : null;

export interface SpeechToTextResult {
  text: string;
  confidence?: number;
  source: string;
}

/**
 * Convert speech to text using OpenAI Whisper
 */
export async function openAIWhisper(audioBuffer: Buffer): Promise<SpeechToTextResult> {
  if (!openai) {
    throw new Error('OpenAI API key not configured');
  }
  
  try {
    // Create a Blob from the Buffer for OpenAI API
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
      confidence: transcription.duration ? 0.9 : 0.8, // Whisper doesn't provide confidence scores
      source: 'OpenAI Whisper'
    };
  } catch (error) {
    console.error('OpenAI Whisper failed:', error);
    throw new Error('OpenAI Whisper transcription failed');
  }
}

/**
 * Convert speech to text using Google Speech-to-Text
 */
export async function googleSpeechToText(audioBuffer: Buffer): Promise<SpeechToTextResult> {
  try {
    const audio = {
      content: audioBuffer.toString('base64'),
    };

    const config = {
      encoding: 'WEBM_OPUS' as const,
      sampleRateHertz: 48000,
      languageCode: 'en-US',
      enableAutomaticPunctuation: true,
      model: 'latest_long',
    };

    const request = {
      audio: audio,
      config: config,
    };

    const [response] = await speechClient.recognize(request);
    const result = response.results?.[0];

    if (!result || !result.alternatives?.[0]) {
      throw new Error('No transcription result from Google Speech-to-Text');
    }

    return {
      text: result.alternatives[0].transcript,
      confidence: result.alternatives[0].confidence || 0.8,
      source: 'Google Speech-to-Text'
    };
  } catch (error) {
    console.error('Google Speech-to-Text failed:', error);
    throw new Error('Google Speech-to-Text transcription failed');
  }
}

/**
 * Convert speech to text using Azure Speech Service
 */
export async function azureSpeechService(audioBuffer: Buffer): Promise<SpeechToTextResult> {
  return new Promise((resolve, reject) => {
    try {
      // Convert Buffer to ArrayBuffer for Azure Speech SDK
      const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength);
      const audioConfig = AudioConfig.fromWavFileInput(arrayBuffer);
      const recognizer = new SpeechRecognizer(speechConfig, audioConfig);

      recognizer.recognizeOnceAsync(
        (result) => {
          if (result.reason === 1) { // ResultReason.RecognizedSpeech
            resolve({
              text: result.text,
              confidence: 0.85, // Azure doesn't provide confidence in this API
              source: 'Azure Speech Service'
            });
          } else {
            reject(new Error(`Azure Speech recognition failed: ${result.reason}`));
          }
          recognizer.close();
        },
        (error) => {
          console.error('Azure Speech Service failed:', error);
          recognizer.close();
          reject(new Error('Azure Speech Service transcription failed'));
        }
      );
    } catch (error) {
      console.error('Azure Speech Service setup failed:', error);
      reject(new Error('Azure Speech Service setup failed'));
    }
  });
}

/**
 * Main function with failover strategy for speech-to-text
 */
export async function convertSpeechToText(audioBuffer: Buffer): Promise<SpeechToTextResult> {
  const apis = [
    { name: 'OpenAI Whisper', func: openAIWhisper },
    { name: 'Google Speech-to-Text', func: googleSpeechToText },
    { name: 'Azure Speech Service', func: azureSpeechService }
  ];

  for (const api of apis) {
    try {
      console.log(`Attempting ${api.name}...`);
      const result = await api.func(audioBuffer);
      if (result && result.text && result.text.trim().length > 0) {
        console.log(`${api.name} succeeded:`, result.text.substring(0, 100) + '...');
        return result;
      }
    } catch (error) {
      console.error(`${api.name} failed:`, error);
    }
  }

  throw new Error('All speech-to-text services failed. Please try again or check your audio input.');
}
