import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import {
  getWellnessModulesState,
  updateWellnessConfig,
  type WellnessModuleKey,
} from "@/lib/wellness-module-service"

const VALID = new Set(["WALK", "WATER", "SLEEP"])

// PUT /api/health/wellness-modules/config — update module reminder / frequency settings
export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const module = String(body.module || "").toUpperCase() as WellnessModuleKey
    const config = body.config

    if (!VALID.has(module)) {
      return NextResponse.json({ error: "Invalid module. Use WALK, WATER, or SLEEP." }, { status: 400 })
    }
    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "config object is required" }, { status: 400 })
    }

    await updateWellnessConfig(user.id, module, config)
    const state = await getWellnessModulesState(user.id)
    return NextResponse.json({ ok: true, modules: state.modules })
  } catch (error) {
    console.error("[wellness-modules/config PUT]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET /api/health/wellness-modules/config
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const state = await getWellnessModulesState(user.id)
    return NextResponse.json({
      configs: state.modules.map((m) => ({ module: m.module, config: m.config })),
    })
  } catch (error) {
    console.error("[wellness-modules/config GET]", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
