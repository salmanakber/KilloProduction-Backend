import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getCreditCentre } from "@/lib/credit-centre-service"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const data = await getCreditCentre(user.id)
    return NextResponse.json({ success: true, ...data })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("credit-centre GET:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
