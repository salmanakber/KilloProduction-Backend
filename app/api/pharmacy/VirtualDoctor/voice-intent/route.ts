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

function quickHeuristic(
  text: string,
  opts?: { history?: Array<{ role?: string; text?: string }>; latestInput?: string },
): { category: "medical" | "non_medical" | "unclear"; nextPrompt: string; mode: string } {
  const t = (text || "").toLowerCase();
  const latest = (opts?.latestInput || text || "").toLowerCase();
  const history = Array.isArray(opts?.history) ? opts?.history : [];
  const userTurns = history.filter((m) => String(m?.role).toLowerCase() === "user").length;

  // Only hard-reject on clearly non-health intents.
  const explicitNonMedicalPatterns = [
    /\b(weather|temperature|rain|forecast)\b/i,
    /\b(cricket|football|soccer|nba|match score)\b/i,
    /\b(joke|funny|meme)\b/i,
    /\b(movie|series|netflix)\b/i,
    /\b(write code|debug code|programming)\b/i,
  ];
  const explicitNonMedical = explicitNonMedicalPatterns.some((p) => p.test(t));
  if (explicitNonMedical) {
    return {
      category: "non_medical",
      mode: "reject_non_medical",
      nextPrompt: "I can help with health concerns. Please describe your symptoms or health issue.",
    };
  }

  const hasDuration = /\b(day|days|week|weeks|month|months|year|years|since|for)\b/i.test(latest) || /\b\d+\b/.test(latest);
  const hasSeverity = /\b(mild|moderate|severe|worse|worst|better|pain scale|intense)\b/i.test(latest);
  const enoughDetail = latest.trim().split(/\s+/).length >= 6 || hasDuration || hasSeverity || userTurns >= 2;

  if (!enoughDetail) {
    return {
      category: "unclear",
      mode: "ask_more_details",
      nextPrompt: "Thanks. Please share more details: how long this has been happening, severity, age, and any other symptoms.",
    };
  }

  return {
    category: "medical",
    mode: "confirm_proceed",
    nextPrompt: "Thanks, I have enough details. Do you want me to proceed with analysis and suggestions?",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = (body?.text || "").toString().trim();
    const latestInput = (body?.latestInput || "").toString().trim();
    const language = (body?.language || "english").toString();
    const history = Array.isArray(body?.history) ? body.history : [];

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
          latestInput,
          language,
          conversationHistory: history,
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
      // Prevent repetitive follow-up loops when user already answered.
      const lastAssistantPrompt = [...history]
        .reverse()
        .find((m: any) => String(m?.role || "").toLowerCase() === "assistant")
        ?.text;
      const normalize = (s: string) =>
        String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const sameAsPrevious = normalize(parsed.nextPrompt) !== "" && normalize(parsed.nextPrompt) === normalize(lastAssistantPrompt || "");
      const userTurns = history.filter((m: any) => String(m?.role || "").toLowerCase() === "user").length;
      if ((parsed.mode === "ask_more_details" || parsed.category === "unclear") && sameAsPrevious && userTurns >= 2) {
        return safeJsonResponse({
          category: "medical",
          mode: "confirm_proceed",
          summary: parsed.summary || "",
          nextPrompt: "Thanks, I have enough details now. If everything is correct, tap Confirm & Proceed.",
          suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
          source: "ai-loop-guard",
        });
      }
      return safeJsonResponse({
        category: parsed.category,
        mode: parsed.mode || "confirm_proceed",
        summary: parsed.summary || "",
        nextPrompt: parsed.nextPrompt,
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
        source: "ai",
      });
    }

    const fallback = quickHeuristic(text, { history, latestInput });
    return safeJsonResponse({ ...fallback, summary: "", suggestedQuestions: [], source: "heuristic" });
  } catch (error: any) {
    console.error("VirtualDoctor voice-intent failed:", error);
    return safeJsonResponse({ error: "Failed to process voice intent", details: error?.message || String(error) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

