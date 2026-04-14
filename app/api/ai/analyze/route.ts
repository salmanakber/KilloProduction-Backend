import { NextRequest, NextResponse } from "next/server"
import { analyzeWithAI, AIUseCase, AIModelCategory } from "@/lib/ai/queue"

/**
 * Public endpoint for mobile app to use AI analysis
 * Supports multiple use cases: order history, reporting, AI doctor, AI mechanic, etc.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      useCase, // ORDER_HISTORY, REPORTING, AI_DOCTOR, AI_MECHANIC, GENERAL_ANALYSIS, CUSTOM
      data, // The data to analyze
      category, // Optional: TEXT_TO_TEXT or IMAGE_TO_TEXT (auto-detected if imageUrl provided)
      imageUrl, // Optional: for image-to-text analysis
      customPrompt, // Optional: custom prompt override
    } = body

    if (!useCase) {
      return NextResponse.json({ error: "useCase is required" }, { status: 400 })
    }

    if (!data && !imageUrl) {
      return NextResponse.json({ error: "Either data or imageUrl is required" }, { status: 400 })
    }

    // Validate useCase
    const validUseCases: AIUseCase[] = [
      "ORDER_HISTORY",
      "REPORTING",
      "AI_DOCTOR",
      "AI_MECHANIC",
      "GENERAL_ANALYSIS",
      "CUSTOM",
    ]
    if (!validUseCases.includes(useCase)) {
      return NextResponse.json(
        { error: `Invalid useCase. Must be one of: ${validUseCases.join(", ")}` },
        { status: 400 }
      )
    }

    // Determine category
    let finalCategory: AIModelCategory | undefined = category
    if (!finalCategory && imageUrl) {
      finalCategory = "IMAGE_TO_TEXT"
    } else if (!finalCategory) {
      finalCategory = "TEXT_TO_TEXT"
    }

    // Call AI analysis
    const result = await analyzeWithAI(useCase, data, {
      category: finalCategory,
      imageUrl,
      customPrompt,
    })

    return NextResponse.json({
      success: true,
      result: {
        content: result.content,
        modelId: result.modelId,
        modelName: result.modelName,
        tokensUsed: result.tokensUsed,
        latency: result.latency,
      },
    })
  } catch (error: any) {
    console.error("AI analysis error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "AI analysis failed",
      },
      { status: 500 }
    )
  }
}
