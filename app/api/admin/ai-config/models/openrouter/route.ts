import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { fetchOpenRouterModels } from "@/lib/ai/openrouter"

// GET - Fetch models from OpenRouter
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const apiKey = searchParams.get("apiKey")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    const response = await fetchOpenRouterModels(apiKey)
    
    // Transform OpenRouter response to our format
    const models = response.data?.map((model: any) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      context_length: model.context_length,
      architecture: model.architecture,
      pricing: model.pricing,
    })) || []

    return NextResponse.json({ models })
  } catch (error: any) {
    console.error("Error fetching OpenRouter models:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
