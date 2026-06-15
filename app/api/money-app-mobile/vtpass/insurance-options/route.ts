import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { fetchVtpassInsuranceOptions } from "@/lib/vtpass"

const ALLOWED_KINDS = ["color", "engine-capacity", "state", "brand", "lga", "model"] as const

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const kind = request.nextUrl.searchParams.get("kind") as
      | "color"
      | "engine-capacity"
      | "state"
      | "brand"
      | "lga"
      | "model"
      | null
    const code = request.nextUrl.searchParams.get("code") || undefined

    if (!kind || !ALLOWED_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Valid kind required" }, { status: 400 })
    }
    if ((kind === "lga" || kind === "model") && !code) {
      return NextResponse.json({ error: "code required for this kind" }, { status: 400 })
    }

    const options = await fetchVtpassInsuranceOptions(kind, code)
    return NextResponse.json({ success: true, options })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
