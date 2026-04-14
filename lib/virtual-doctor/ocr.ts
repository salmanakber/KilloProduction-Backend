import { ImageAnnotatorClient } from '@google-cloud/vision';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import Tesseract from 'tesseract.js';

// Initialize Google Vision API only if credentials are available
const visionClient = process.env.GOOGLE_APPLICATION_CREDENTIALS ? new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_PROJECT_ID,
}) : null;

// Initialize AWS Textract only if credentials are available
const textractClient = process.env.AWS_ACCESS_KEY_ID ? new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
}) : null;

export interface OCRResult {
  text: string;
  confidence?: number;
  source: string;
  words?: Array<{
    text: string;
    confidence: number;
    boundingBox?: any;
  }>;
}

/**
 * Extract text from image using Google Vision API
 */
export async function googleVisionOCR(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    const [result] = await visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const detections = result.textAnnotations;
    if (!detections || detections.length === 0) {
      throw new Error('No text detected in image');
    }

    // Get the full text (first detection is usually the entire text)
    const fullText = detections[0].description || '';
    
    // Calculate average confidence from individual word detections
    const wordDetections = detections.slice(1);
    const avgConfidence = wordDetections.length > 0 
      ? wordDetections.reduce((sum, detection) => sum + (detection.confidence || 0), 0) / wordDetections.length
      : 0.9;

    return {
      text: fullText,
      confidence: avgConfidence,
      source: 'Google Vision API',
      words: wordDetections.map(detection => ({
        text: detection.description || '',
        confidence: detection.confidence || 0,
        boundingBox: detection.boundingPoly
      }))
    };
  } catch (error) {
    console.error('Google Vision OCR failed:', error);
    throw new Error('Google Vision OCR failed');
  }
}

/**
 * Extract text from image using AWS Textract
 */
export async function awsTextractOCR(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    const command = new DetectDocumentTextCommand({
      Document: {
        Bytes: imageBuffer,
      },
    });

    const response = await textractClient.send(command);
    
    if (!response.Blocks) {
      throw new Error('No text blocks detected by AWS Textract');
    }

    // Extract text from blocks
    const textBlocks = response.Blocks
      .filter(block => block.BlockType === 'LINE')
      .map(block => block.Text)
      .filter(text => text && text.trim().length > 0);

    const fullText = textBlocks.join('\n');
    
    if (!fullText.trim()) {
      throw new Error('No text content extracted by AWS Textract');
    }

    // Calculate average confidence
    const confidenceBlocks = response.Blocks
      .filter(block => block.BlockType === 'LINE' && block.Confidence)
      .map(block => block.Confidence || 0);
    
    const avgConfidence = confidenceBlocks.length > 0
      ? confidenceBlocks.reduce((sum, conf) => sum + conf, 0) / confidenceBlocks.length / 100
      : 0.8;

    return {
      text: fullText,
      confidence: avgConfidence,
      source: 'AWS Textract',
      words: response.Blocks
        .filter(block => block.BlockType === 'WORD')
        .map(block => ({
          text: block.Text || '',
          confidence: (block.Confidence || 0) / 100,
          boundingBox: block.Geometry?.BoundingBox
        }))
    };
  } catch (error) {
    console.error('AWS Textract OCR failed:', error);
    throw new Error('AWS Textract OCR failed');
  }
}

/**
 * Extract text from image using Tesseract OCR
 */
export async function tesseractOCR(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    const { data: { text, confidence } } = await Tesseract.recognize(
      imageBuffer,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`Tesseract progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );

    if (!text || text.trim().length === 0) {
      throw new Error('No text detected by Tesseract OCR');
    }

    return {
      text: text.trim(),
      confidence: confidence / 100, // Convert to 0-1 scale
      source: 'Tesseract OCR'
    };
  } catch (error) {
    console.error('Tesseract OCR failed:', error);
    throw new Error('Tesseract OCR failed');
  }
}

/**
 * Main function with failover strategy for OCR
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  const apis = [
    { name: 'Google Vision API', func: googleVisionOCR },
    { name: 'AWS Textract', func: awsTextractOCR },
    { name: 'Tesseract OCR', func: tesseractOCR }
  ];

  for (const api of apis) {
    try {
      console.log(`Attempting ${api.name}...`);
      const result = await api.func(imageBuffer);
      if (result && result.text && result.text.trim().length > 0) {
        console.log(`${api.name} succeeded:`, result.text.substring(0, 100) + '...');
        return result;
      }
    } catch (error) {
      console.error(`${api.name} failed:`, error);
    }
  }

  throw new Error('All OCR services failed. Please try again with a clearer image.');
}
