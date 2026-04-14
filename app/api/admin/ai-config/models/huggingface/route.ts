import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { fetchHuggingFaceModels, searchHuggingFaceModels } from "@/lib/ai/huggingface"

// GET - Fetch models from Hugging Face
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const apiKey = searchParams.get("apiKey")
    const search = searchParams.get("search")

    if (!apiKey) {
      return NextResponse.json({ error: "API key is required" }, { status: 400 })
    }

    let models

    if (search && search.trim()) {
      // Search for models
      models = await searchHuggingFaceModels(search, 2000)
    } else {
      // Get popular models
      models = await searchHuggingFaceModels("", 250)
      
    }

    return NextResponse.json({ models })
  } catch (error: any) {
    console.error("Error fetching Hugging Face models:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
