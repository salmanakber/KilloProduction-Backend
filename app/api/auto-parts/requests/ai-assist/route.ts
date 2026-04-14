import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { analyzeWithAI } from "@/lib/ai/queue"
import type { AIUseCase } from "@prisma/client"

/**
 * POST /api/auto-parts/requests/ai-assist
 * Helps customers draft part-request text using the same AI stack as admin (AIConfiguration + active models).
 * Tries use cases in order: AI_MECHANIC → GENERAL_ANALYSIS → CUSTOM (first with an active config).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      vehicleMake,
      vehicleModel,
      vehicleYear,
      category,
      partName,
      description,
      userNotes,
    } = body as {
      vehicleMake?: string
      vehicleModel?: string
      vehicleYear?: string
      category?: string
      partName?: string
      description?: string
      userNotes?: string
    }

    if (!vehicleMake?.trim() || !vehicleModel?.trim()) {
      return NextResponse.json(
        { error: "vehicleMake and vehicleModel are required" },
        { status: 400 }
      )
    }

    const dataPayload = {
      vehicleMake: vehicleMake.trim(),
      vehicleModel: vehicleModel.trim(),
      vehicleYear: (vehicleYear || "").trim(),
      category: (category || "").trim(),
      partName: (partName || "").trim(),
      description: (description || "").trim(),
      userNotes: (userNotes || "").trim(),
    }

    const customPrompt = `You help customers write clear auto parts requests for a marketplace.

Vehicle: ${dataPayload.vehicleMake} ${dataPayload.vehicleModel} ${dataPayload.vehicleYear}
Part name (if any): ${dataPayload.partName}
Category (if any): ${dataPayload.category}
Current description/notes: ${dataPayload.description}
Extra context: ${dataPayload.userNotes}

Return ONLY a JSON object with this exact shape (no markdown fences, no commentary):
{"description":"string (2-6 sentences: symptoms, fitment, OEM/part number if known, what sellers should know)","partName":"string or empty","partTypeHint":"string or empty (e.g. brake pads, alternator)"}

Be concise.`

    const useCaseOrder: AIUseCase[] = ["AI_MECHANIC", "GENERAL_ANALYSIS", "CUSTOM"]
    let lastError: string | null = null

    for (const useCase of useCaseOrder) {
      const cfg = await prisma.aIConfiguration.findFirst({
        where: { useCase, isActive: true },
      })
      if (!cfg) continue

      try {
        const result = await analyzeWithAI(useCase, dataPayload, {
          customPrompt,
          maxTokens: 800,
          disableTools: true,
        })
        const parsed = parseJsonFromAiContent(result.content)
        return NextResponse.json({
          success: true,
          description: typeof parsed.description === "string" ? parsed.description : "",
          partName: typeof parsed.partName === "string" ? parsed.partName : "",
          partTypeHint: typeof parsed.partTypeHint === "string" ? parsed.partTypeHint : "",
          modelName: result.modelName,
        })
      } catch (e: any) {
        lastError = e?.message || String(e)
      }
    }

    return NextResponse.json(
      {
        error:
          lastError ||
          "AI assistance is not available. In Admin → AI Config, enable an active configuration for AI_MECHANIC, GENERAL_ANALYSIS, or CUSTOM, with at least one active TEXT_TO_TEXT model.",
      },
      { status: 503 }
    )
  } catch (error: any) {
    console.error("auto-parts requests ai-assist:", error)
    return NextResponse.json(
      { error: error?.message || "Failed to generate draft" },
      { status: 500 }
    )
  }
}

function parseJsonFromAiContent(content: string): Record<string, unknown> {
  const t = content.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = (fence ? fence[1] : t).trim()
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI did not return valid JSON")
  }
  return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>
}
