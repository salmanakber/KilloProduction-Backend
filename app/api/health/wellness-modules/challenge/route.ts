import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  completeWellnessChallenge,
  type WellnessModuleKey,
} from "@/lib/wellness-module-service"

const VALID = new Set(["WALK", "WATER", "SLEEP"])

// PATCH /api/health/wellness-modules/challenge — mark challenge complete
export async function PATCH(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const module = String(body.module || "").toUpperCase() as WellnessModuleKey
    const challengeId = String(body.challengeId || "")

    if (!VALID.has(module)) {
      return NextResponse.json({ error: "Invalid module. Use WALK, WATER, or SLEEP." }, { status: 400 })
    }
    if (!challengeId) {
      return NextResponse.json({ error: "challengeId is required" }, { status: 400 })
    }

    const updated = await completeWellnessChallenge(user.id, module, challengeId)
    return NextResponse.json({ module: updated })
  } catch (error: any) {
    console.error("[wellness-modules/challenge PATCH]", error)
    const msg = error?.message === "Challenge not found" ? error.message : "Internal server error"
    const status = error?.message === "Challenge not found" ? 404 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
