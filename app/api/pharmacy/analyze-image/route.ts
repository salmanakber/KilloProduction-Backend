import { NextRequest, NextResponse } from 'next/server';
import { analyzeMedicalImageWithAI } from '@/lib/virtual-doctor/ai-medicine-matcher';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const formData = await request.formData();
    const imageFile = formData.get('imageFile') as File | null;
    const imageType = formData.get('imageType') as string || 'general';
    
    if (!imageFile) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Validate image type
    const validImageTypes = ['prescription', 'medicine_label', 'medical_report', 'symptom_photo', 'general'];
    const analysisType = validImageTypes.includes(imageType) ? imageType as any : 'general';

    console.log(`🖼️ Analyzing medical image with type: ${analysisType} using AI config system...`);
    
    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    
    // Perform enhanced medical image analysis using AI config system
    const result = await analyzeMedicalImageWithAI(imageBuffer, analysisType);
    
    const response = {
      success: true,
      analysis: {
        text: result.text,
        confidence: result.confidence,
        source: result.source,
        extractedData: result.extractedData,
        processingTime: result.processingTime || (Date.now() - startTime),
        imageType: analysisType
      }
    };

    console.log(`✅ Image analysis completed in ${response.analysis.processingTime}ms`);
    console.log(`📊 Extracted data:`, {
      medicines: result.extractedData.medicines?.length || 0,
      symptoms: result.extractedData.symptoms?.length || 0,
      conditions: result.extractedData.conditions?.length || 0,
      instructions: result.extractedData.instructions?.length || 0
    });

    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Image analysis failed:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to analyze image. Please try again with a clearer image.',
        details: error instanceof Error ? error.message : 'Unknown error',
        processingTime: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

