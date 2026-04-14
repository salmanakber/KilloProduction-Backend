import { NextRequest, NextResponse } from "next/server";
import { AIUseCase } from "@prisma/client";
import { analyzeWithAI } from "@/lib/ai/queue";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function safeJsonResponse(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  let body: string;
  try {
    body = JSON.stringify(data);
  } catch {
    body = JSON.stringify({ error: "Failed to serialize response" });
  }
  return new NextResponse(body, {
    status: init?.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

function extractFirstJsonObject(text: string): any | null {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

function quickHeuristic(text: string): { category: "medical" | "non_medical" | "unclear"; nextPrompt: string; mode: string } {
  const t = (text || "").toLowerCase();
  const medicalKeywords = [
    "fever",
    "headache",
    "pain",
    "cough",
    "cold",
    "flu",
    "vomit",
    "nausea",
    "diarrhea",
    "rash",
    "itch",
    "burn",
    "pregnan",
    "period",
    "asthma",
    "bp",
    "blood pressure",
    "sugar",
    "diabetes",
    "infection",
    "sore throat",
    "dizziness",
    "weakness",
  ];

  const looksMedical = medicalKeywords.some((k) => t.includes(k));
  if (!looksMedical) {
    return {
      category: "non_medical",
      mode: "reject_non_medical",
      nextPrompt:
        "Sorry — I can only help with health and medical symptoms. Please describe your symptoms (for example: fever, headache, cough, stomach pain).",
    };
  }

  if (text.trim().split(/\s+/).length < 4) {
    return {
      category: "unclear",
      mode: "ask_more_details",
      nextPrompt:
        'Thanks. Please tell me more details — how long it has been, your age, and any other symptoms — then I can guide you properly.',
    };
  }

  return {
    category: "medical",
    mode: "confirm_proceed",
    nextPrompt:
      `Thanks. I understood your symptoms. Do you want me to proceed and analyze this to suggest next steps and possible medicines? Say "yes" or "no".`,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = (body?.text || "").toString().trim();

    if (!text) {
      return safeJsonResponse({ error: "Missing text" }, { status: 400 });
    }

    // Use AI config system (AI_DOCTOR) to triage intent + craft a professional prompt.
    // We avoid customPrompt; we pass data that your saved systemPrompt can interpret.
    let aiText = "";
    try {
      const ai = await analyzeWithAI(
        AIUseCase.AI_DOCTOR,
        {
          task: "voice_intent_triage",
          userText: text,
          outputFormat: {
            category: "medical|non_medical|unclear",
            summary: "string",
            nextPrompt: "string",
            mode: "confirm_proceed|ask_more_details|reject_non_medical",
            suggestedQuestions: [{ text: "string", icon: "string", category: "symptom|medicine|condition|general" }],
          },
          rules: [
            "If the user is not asking about health/medical symptoms, set category=non_medical and mode=reject_non_medical with a polite apology.",
            "If medical but too little info, set category=unclear and mode=ask_more_details.",
            "If medical and enough detail, set category=medical and mode=confirm_proceed. Summarize professionally and ask if you should proceed.",
            "Keep nextPrompt professional, concise, and safe. Do not diagnose with certainty.",
          ],
        },
        { category: "TEXT_TO_TEXT", maxTokens: 1200, disableTools: true }
      );
      aiText = ai.content || "";
    } catch (e) {
      console.error("voice-intent AI config call failed:", e);
    }

    const parsed = extractFirstJsonObject(aiText);
    if (parsed?.category && parsed?.nextPrompt) {
      return safeJsonResponse({
        category: parsed.category,
        mode: parsed.mode || "confirm_proceed",
        summary: parsed.summary || "",
        nextPrompt: parsed.nextPrompt,
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
        source: "ai",
      });
    }

    const fallback = quickHeuristic(text);
    return safeJsonResponse({ ...fallback, summary: "", suggestedQuestions: [], source: "heuristic" });
  } catch (error: any) {
    console.error("VirtualDoctor voice-intent failed:", error);
    return safeJsonResponse({ error: "Failed to process voice intent", details: error?.message || String(error) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

