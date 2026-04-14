import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { fetchGitHubModels } from "@/lib/ai/github"

// GET - Fetch models from GitHub
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

    const models = await fetchGitHubModels(apiKey)
    return NextResponse.json({ models })
} catch (error: any) {
    console.error("Error fetching GitHub models:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}