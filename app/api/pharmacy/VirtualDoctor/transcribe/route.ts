import { NextRequest, NextResponse } from "next/server";
import { speechmaticsSpeechToText } from "@/lib/virtual-doctor/speechmatics-stt";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400, headers: corsHeaders });
    }

    const formData = await request.formData();
    const audioFile = formData.get("audioFile") as File | null;
    if (!audioFile) {
      return NextResponse.json({ error: "Missing audioFile" }, { status: 400, headers: corsHeaders });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const result = await speechmaticsSpeechToText(audioBuffer);

    return NextResponse.json(
      { text: result.text, confidence: result.confidence, source: result.source },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("VirtualDoctor transcribe failed:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio", details: error?.message || String(error) },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

