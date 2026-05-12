import { NextRequest, NextResponse } from "next/server";
import { AIUseCase } from "@prisma/client";
import { analyzeWithAI } from "@/lib/ai/queue";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

type ChatMsg = { role?: string; text?: string };

const EMERGENCY_PATTERNS: RegExp[] = [
  /\b(chest pain|chest pressure)\b/i,
  /\b(shortness of breath|can.?t breathe|cannot breathe|difficulty breathing)\b/i,
  /\b(fainted|fainting|passed out|unconscious)\b/i,
  /\b(seizure|convulsion)\b/i,
  /\b(stroke|face drooping|slurred speech|one side weak)\b/i,
  /\b(suicidal|kill myself|end my life|self harm)\b/i,
  /\b(severe bleeding|bleeding heavily|blood won.?t stop)\b/i,
  /\b(anaphylaxis|throat swelling|swollen tongue)\b/i,
];

function normalize(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function mergedUserText(text: string, history: ChatMsg[] = []): string {
  const joinedHistory = history
    .filter((m) => String(m?.role || "").toLowerCase() === "user")
    .map((m) => String(m?.text || ""))
    .join(" ");
  return `${joinedHistory} ${text}`.trim();
}

function detectEmergency(text: string): boolean {
  return EMERGENCY_PATTERNS.some((p) => p.test(text));
}

function isLikelyMedicalIntent(text: string): boolean {
  const t = normalize(text);
  if (!t) return false;
  return /\b(symptom|health|medical|medicine|medication|drug|tablet|capsule|dose|dosage|side effect|allergy|allergic|diagnosis|condition|illness|sick|doctor|clinic|hospital|blood pressure|sugar|diabetes|asthma|infection|pregnan|period|menstrual|mental health|anxiety|depression|sleep|diet|nutrition|pain|fever|cough|rash|itch|vomit|nausea|dizzy|fatigue)\b/i.test(
    t,
  );
}

type IntakeSlot =
  | "main_symptom"
  | "duration"
  | "severity"
  | "associated_symptoms"
  | "medical_history"
  | "current_medications"
  | "allergies";

function getMissingSlot(fullText: string): IntakeSlot | null {
  const t = normalize(fullText);
  // Keep this broad so any health concern can start intake, not just common symptom words.
  if (t.split(/\s+/).filter(Boolean).length < 2) {
    return "main_symptom";
  }
  if (!/\b(hour|hours|day|days|week|weeks|month|months|since|started|from yesterday|today|last night|\d+\s*(day|week|month|hour))\b/i.test(t)) {
    return "duration";
  }
  if (!/\b(mild|moderate|severe|unbearable|pain scale|out of 10|[1-9]\/10|worse|worst|better)\b/i.test(t)) {
    return "severity";
  }
  if (!/\b(also|with|along with|plus|and i have|other symptoms|symptoms include)\b/i.test(t) && !/\b(cough|sore throat|runny nose|chills|body ache|vomit|nausea|diarrhea|dizziness|weakness)\b/i.test(t)) {
    return "associated_symptoms";
  }
  if (!/\b(history|diabetes|hypertension|asthma|ulcer|kidney|liver|heart disease|pregnan|chronic|no history|none)\b/i.test(t)) {
    return "medical_history";
  }
  if (!/\b(taking|medication|medicine|drug|tablet|capsule|insulin|paracetamol|ibuprofen|none)\b/i.test(t)) {
    return "current_medications";
  }
  if (!/\b(allergy|allergies|allergic|no allergies|none)\b/i.test(t)) {
    return "allergies";
  }
  return null;
}

/** Tailor questions like a clinician would, using what the patient already said. */
function contextualIntakeQuestion(fullText: string, slot: IntakeSlot): string {
  const t = normalize(fullText);

  const mentionsSleep =
    /\b(sleep|insomnia|can'?t sleep|cant sleep|wake up at night|nightmare|snor|restless|tired but wired)\b/i.test(t);
  const mentionsFluCold =
    /\b(flu|influenza|cold|runny nose|stuffy nose|congestion|sore throat|sniffles)\b/i.test(t);
  const mentionsFever =
    /\b(fever|febrile|temperature|chills|feeling hot|burning up|sweats|night sweat)\b/i.test(t);
  const mentionsPain =
    /\b(pain|ache|hurts|cramp|stiff|throb)\b/i.test(t);
  const mentionsGi =
    /\b(stomach|nausea|vomit|diarrhea|constipation|bowel|acid reflux|heartburn)\b/i.test(t);
  const mentionsMental =
    /\b(anxiety|panic|depress|stress|mood|worried)\b/i.test(t);

  switch (slot) {
    case "main_symptom":
      return "I'm with you. In your own words, what's bothering you most today?";
    case "duration":
      if (mentionsSleep) {
        return "How long has sleep been difficult — a few nights, weeks, or longer? Did anything stressful happen around when it started?";
      }
      if (mentionsFluCold) {
        return "When did these symptoms start — today, yesterday, or longer ago? Are they getting better or worse?";
      }
      if (mentionsFever) {
        return "How long have you had the fever — hours or days? Does it come and go or stay steady?";
      }
      if (mentionsGi) {
        return "When did this stomach issue begin, and has it been constant or on-and-off?";
      }
      return "Thanks for telling me. Roughly how long has this been going on?";
    case "severity":
      if (mentionsSleep) {
        return "How much is this affecting your days — are you still functioning at work or school, or is it wiping you out?";
      }
      if (mentionsFever) {
        return "How unwell do you feel right now — mild, pretty rough, or severe enough that standing or walking is hard?";
      }
      if (mentionsPain) {
        return "On a day-to-day level, how intense is it — mild annoyance, moderate, or severe? Anything that makes it clearly worse or better?";
      }
      return "How strong are your symptoms right now — mild, moderate, or severe?";
    case "associated_symptoms":
      if (mentionsFluCold || mentionsFever) {
        return "Besides what you mentioned, do you have cough, shortness of breath, chest pain, severe headache, rash, or trouble keeping fluids down?";
      }
      if (mentionsSleep) {
        return "When you try to sleep, is it trouble falling asleep, waking through the night, or waking too early? Any loud snoring or gasping?";
      }
      if (mentionsMental) {
        return "Along with that, are you having trouble sleeping, appetite changes, racing thoughts, or feeling hopeless?";
      }
      return "Anything else going on at the same time — even small changes in appetite, energy, breathing, or bathroom habits?";
    case "medical_history":
      return "Do you have any ongoing conditions I should know about — like diabetes, high blood pressure, asthma, heart or kidney problems, or pregnancy?";
    case "current_medications":
      return "What medicines or supplements are you taking now (including over-the-counter)?";
    case "allergies":
      return "Any allergies to medicines, foods, or anything else that caused a bad reaction?";
    default:
      return "Could you share one more detail so I can guide you safely?";
  }
}

function humanIntakeQuestion(slot: IntakeSlot, fullText?: string): string {
  if (fullText && fullText.trim()) {
    return contextualIntakeQuestion(fullText, slot);
  }
  return contextualIntakeQuestion("", slot);
}

function quickHeuristic(
  text: string,
  opts?: { history?: Array<{ role?: string; text?: string }>; latestInput?: string },
): { category: "medical" | "non_medical" | "unclear"; nextPrompt: string; mode: string } {
  const full = mergedUserText(text, opts?.history as ChatMsg[] | undefined);
  const t = full.toLowerCase();
  const latest = (opts?.latestInput || text || "").toLowerCase();
  const history = Array.isArray(opts?.history) ? opts?.history : [];
  const userTurns = history.filter((m) => String(m?.role).toLowerCase() === "user").length;

  if (detectEmergency(`${latest} ${full}`)) {
    return {
      category: "medical",
      mode: "emergency_redirect",
      nextPrompt:
        "Your symptoms may need urgent care. Please contact emergency services or go to the nearest emergency center now. I can continue after you are safe.",
    };
  }

  // Only hard-reject on clearly non-health intents.
  const explicitNonMedicalPatterns = [
    /\b(weather|rain|forecast|humidity)\b/i,
    /\b(cricket|football|soccer|nba|match score)\b/i,
    /\b(joke|funny|meme)\b/i,
    /\b(movie|series|netflix)\b/i,
    /\b(write code|debug code|programming)\b/i,
  ];
  const explicitNonMedical = explicitNonMedicalPatterns.some((p) => p.test(t));
  if (explicitNonMedical && !isLikelyMedicalIntent(full)) {
    return {
      category: "non_medical",
      mode: "reject_non_medical",
      nextPrompt: "I can help with health concerns. Please tell me what symptoms you are feeling.",
    };
  }

  const missing = getMissingSlot(full);
  const enoughDetail = !missing || userTurns >= 5;
  if (!enoughDetail && missing) {
    return {
      category: "unclear",
      mode: "ask_more_details",
      nextPrompt: humanIntakeQuestion(missing, full),
    };
  }

  return {
    category: "medical",
    mode: "confirm_proceed",
    nextPrompt: "Thank you. I have enough details now and will move to analysis and safe medicine matching.",
  };
}

function hasMinimumIntakeDetails(text: string, history?: Array<{ role?: string; text?: string }>): boolean {
  const t = normalize(String(text || ""));
  const userTurns = (history || []).filter((m) => String(m?.role || "").toLowerCase() === "user").length;
  const hasDuration = /\b(hour|hours|day|days|week|weeks|month|months|year|years|since|for|started|yesterday|today|last)\b/i.test(t) || /\b\d+\b/.test(t);
  const hasSeverity = /\b(mild|moderate|severe|worse|worst|better|intense|high|low|out of 10|\/10)\b/i.test(t);
  const hasUsefulNarrative = t.split(/\s+/).filter(Boolean).length >= 8;

  // Broad guard: accept detailed narratives and multi-turn context for any medical topic.
  if (userTurns >= 3) return true;
  if (hasUsefulNarrative && userTurns >= 2) return true;
  return hasDuration && (hasSeverity || hasUsefulNarrative);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const text = (body?.text || "").toString().trim();
    const latestInput = (body?.latestInput || "").toString().trim();
    const language = (body?.language || "english").toString();
    const history = Array.isArray(body?.history) ? body.history : [];
    const session = await authenticateRequest(request).catch(() => null);

    let patientContext: {
      name?: string | null;
      age?: number | null;
      gender?: string | null;
      bodyBp?: string | null;
      bodyTemp?: string | null;
      source: "health_vitals" | "user_profile" | "user_name" | "none";
    } = { source: "none" };
    if (session?.id) {
      const [user, profile, vitals] = await Promise.all([
        prisma.user.findUnique({ where: { id: session.id }, select: { name: true } }),
        prisma.userProfile.findUnique({ where: { userId: session.id }, select: { dateOfBirth: true, gender: true, bodyBp: true, bodyTemp: true } }),
        prisma.healthVital.findUnique({ where: { userId: session.id }, select: { age: true, name: true, gender: true } }),
      ]);
      let age: number | null = vitals?.age ?? null;
      if (!age && profile?.dateOfBirth) {
        const diff = Date.now() - profile.dateOfBirth.getTime();
        const ageDate = new Date(diff);
        age = Math.abs(ageDate.getUTCFullYear() - 1970);
      }
      patientContext = {
        name: vitals?.name || user?.name || null,
        age,
        gender: vitals?.gender || profile?.gender || null,
        bodyBp: profile?.bodyBp || null,
        bodyTemp: profile?.bodyTemp || null,
        source: vitals ? "health_vitals" : profile ? "user_profile" : user ? "user_name" : "none",
      };
    }

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
            mode: "confirm_proceed|ask_more_details|reject_non_medical|emergency_redirect",
            suggestedQuestions: [{ text: "string", icon: "string", category: "symptom|medicine|condition|general" }],
          },
          rules: [
            "If the user is not asking about health/medical symptoms, set category=non_medical and mode=reject_non_medical with a polite apology.",
            "If there are emergency red flags (e.g. chest pain, trouble breathing, severe bleeding, stroke signs, suicidal intent), set mode=emergency_redirect first.",
            "If medical but intake is incomplete, set category=unclear and mode=ask_more_details.",
            "During intake, ask only ONE short, natural follow-up question at a time.",
            "Sound like a caring clinician in plain language; mirror the user's concern (e.g. sleep → onset, night waking, snoring, stress; flu/fever → timeline, breathing, fluids, red flags).",
            "Use empathetic, plain, and conversational language; avoid robotic checklist phrasing.",
            "Adapt the next question based on what is still missing (duration, severity, associated symptoms, history, medications, allergies).",
            "If enough detail is available, set category=medical and mode=confirm_proceed with a calm transition to analysis.",
            "Keep nextPrompt concise and safe. Do not diagnose with certainty.",
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
      const emergencyDetected = detectEmergency(mergedUserText(`${latestInput || ""} ${text}`, history));
      if (emergencyDetected) {
        return safeJsonResponse({
          category: "medical",
          mode: "emergency_redirect",
          summary: parsed?.summary || "",
          nextPrompt:
            "Your symptoms could be urgent. If severe, seek emergency care now. I can still prepare a medicine shortlist and nearby pharmacy consult, and a human pharmacist will review before any prescription action.",
          suggestedQuestions: [],
          patientContext,
          source: "emergency-guard",
        });
      }
      if (parsed?.mode === "emergency_redirect") {
        const merged = mergedUserText(text, history);
        const missing = getMissingSlot(merged);
        return safeJsonResponse({
          category: "unclear",
          mode: "ask_more_details",
          summary: parsed?.summary || "",
          nextPrompt: humanIntakeQuestion(missing || "associated_symptoms", merged),
          suggestedQuestions: [],
          patientContext,
          source: "safe-emergency-downgrade",
        });
      }

      // Never reject if the user message is likely medical; recover to intake flow.
      if (parsed?.mode === "reject_non_medical" && isLikelyMedicalIntent(`${text} ${latestInput}`)) {
        const merged = mergedUserText(text, history);
        const missing = getMissingSlot(merged);
        return safeJsonResponse({
          category: "unclear",
          mode: "ask_more_details",
          summary: parsed.summary || "",
          nextPrompt: humanIntakeQuestion(missing || "main_symptom", merged),
          suggestedQuestions: [],
          patientContext,
          source: "medical-intent-recovery",
        });
      }

      // Guardrail: do not proceed too early on first vague symptom message.
      const minimumDetailsReady = hasMinimumIntakeDetails(latestInput || text, history);
      if ((parsed.mode === "confirm_proceed" || parsed.category === "medical") && !minimumDetailsReady) {
        const merged = mergedUserText(text, history);
        const missing = getMissingSlot(merged);
        return safeJsonResponse({
          category: "unclear",
          mode: "ask_more_details",
          summary: parsed.summary || "",
          nextPrompt: humanIntakeQuestion(missing || "duration", merged),
          suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
          patientContext,
          source: "ai-min-intake-guard",
        });
      }

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
          nextPrompt: "Thanks for your answers. I now have enough information and will proceed with analysis.",
          suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
          patientContext,
          source: "ai-loop-guard",
        });
      }
      return safeJsonResponse({
        category: parsed.category,
        mode: parsed.mode || "confirm_proceed",
        summary: parsed.summary || "",
        nextPrompt: parsed.nextPrompt,
        suggestedQuestions: Array.isArray(parsed.suggestedQuestions) ? parsed.suggestedQuestions : [],
        patientContext,
        source: "ai",
      });
    }

    const fallback = quickHeuristic(text, { history, latestInput });
    return safeJsonResponse({ ...fallback, summary: "", suggestedQuestions: [], patientContext, source: "heuristic" });
  } catch (error: any) {
    console.error("VirtualDoctor voice-intent failed:", error);
    return safeJsonResponse({ error: "Failed to process voice intent", details: error?.message || String(error) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

