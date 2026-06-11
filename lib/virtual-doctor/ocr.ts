import { ImageAnnotatorClient } from '@google-cloud/vision';
import { TextractClient, DetectDocumentTextCommand } from '@aws-sdk/client-textract';
import { runTesseractOcr } from '@/lib/tesseract-node';

// Initialize Google Vision API only if credentials are available
const visionClient = process.env.GOOGLE_APPLICATION_CREDENTIALS ? new ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_PROJECT_ID,
}) : null;

// Only use Textract when explicitly enabled (avoids slow failures with invalid local keys)
const textractClient =
  process.env.AWS_TEXTRACT_ENABLED === 'true' &&
  process.env.AWS_ACCESS_KEY_ID &&
  process.env.AWS_SECRET_ACCESS_KEY
    ? new TextractClient({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      })
    : null;

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
  if (!visionClient) {
    throw new Error("Google Vision not configured")
  }
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
  if (!textractClient) {
    throw new Error("AWS Textract not configured")
  }
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
 * Extract text from image using Tesseract.js (fallback — works without cloud credentials)
 * @see https://github.com/naptha/tesseract.js
 */
export async function tesseractOCR(imageBuffer: Buffer): Promise<OCRResult> {
  try {
    const { text, confidence } = await runTesseractOcr(imageBuffer)
    if (!text) {
      throw new Error("No text detected by Tesseract OCR")
    }
    return {
      text,
      confidence: confidence / 100,
      source: "Tesseract OCR",
    }
  } catch (error) {
    console.error("Tesseract OCR failed:", error)
    throw new Error("Tesseract OCR failed")
  }
}

/**
 * Main function with failover: Google Vision → AWS Textract → Tesseract.js
 */
export async function extractTextFromImage(imageBuffer: Buffer): Promise<OCRResult> {
  const apis: Array<{ name: string; func: (buf: Buffer) => Promise<OCRResult> }> = []
  if (visionClient) apis.push({ name: "Google Vision API", func: googleVisionOCR })
  if (textractClient) apis.push({ name: "AWS Textract", func: awsTextractOCR })
  apis.push({ name: "Tesseract OCR", func: tesseractOCR })

  for (const api of apis) {
    try {
      console.log(`Attempting ${api.name}...`)
      const result = await api.func(imageBuffer)
      if (result?.text?.trim()) {
        console.log(`${api.name} succeeded:`, result.text.substring(0, 120) + "...")
        return result
      }
    } catch (error) {
      console.error(`${api.name} failed:`, error)
    }
  }

  throw new Error("All OCR services failed. Please try again with a clearer image.")
}
