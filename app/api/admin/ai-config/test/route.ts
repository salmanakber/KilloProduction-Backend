import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { analyzeWithAI } from "@/lib/ai/queue"

/**
 * Test endpoint for AI configuration
 * Allows admins to test their AI setup with sample data
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      useCase,
      testPrompt,
      category,
      imageUrl,
      provider, // "auto" | "openrouter" | "huggingface" | "github"
    } = body

    if (!useCase || !testPrompt) {
      return NextResponse.json(
        { error: "useCase and testPrompt are required" },
        { status: 400 }
      )
    }

    // Create test data based on use case
    let testData: any = { prompt: testPrompt }

    switch (useCase) {
      case "ORDER_HISTORY":
        testData = {
          orders: [
            { id: "1", total: 150, date: "2024-01-15", status: "completed" },
            { id: "2", total: 200, date: "2024-01-20", status: "completed" },
          ],
          analysis: testPrompt,
        }
        break
      case "REPORTING":
        testData = {
          period: "Last 30 days",
          metrics: { revenue: 50000, orders: 250, users: 1200 },
          analysis: testPrompt,
        }
        break
      case "AI_DOCTOR":
        testData = {
          symptoms: testPrompt,
          patientInfo: { age: 30, gender: "male" },
        }
        break
      case "AI_MECHANIC":
        testData = {
          issue: testPrompt,
          vehicleInfo: { make: "Toyota", model: "Camry", year: 2020 },
        }
        break
      default:
        testData = { query: testPrompt }
    }

    // Call AI analysis with provider preference
    // The queue will handle provider selection based on the preference
    const options: {
      category?: "TEXT_TO_TEXT" | "IMAGE_TO_TEXT"
      imageUrl?: string
      providerPreference?: "auto" | "openrouter" | "huggingface" | "github"
    } = {
      category: category || "TEXT_TO_TEXT",
      imageUrl,
      providerPreference: (provider as "auto" | "openrouter" | "huggingface" | "github") || "auto",
    }
    const result = await analyzeWithAI(useCase, testData, options)

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
    console.error("AI test error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "AI test failed",
      },
      { status: 500 }
    )
  }
}
