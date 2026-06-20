import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  getWellnessModulesState,
} from "@/lib/wellness-module-service"

// GET /api/health/wellness-modules — daily AI recommendations & challenges for all modules
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const refresh = searchParams.get("refresh") === "1"
    let activityContext: Record<string, unknown> | undefined
    const ctxParam = searchParams.get("activityContext")
    if (ctxParam) {
      try {
        activityContext = JSON.parse(ctxParam)
      } catch {
        activityContext = undefined
      }
    }

    const state = await getWellnessModulesState(user.id, activityContext, refresh)
    return NextResponse.json(state)
  } catch (error) {
    console.error("[wellness-modules GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/health/wellness-modules — refresh AI content (optional module filter)
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const activityContext = body.activityContext || undefined
    const state = await getWellnessModulesState(user.id, activityContext, true)
    return NextResponse.json(state)
  } catch (error) {
    console.error("[wellness-modules POST]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
