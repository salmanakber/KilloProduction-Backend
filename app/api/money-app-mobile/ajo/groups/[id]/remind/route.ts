import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { remindAjoMembers } from "@/lib/ajo-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const targetUserId = typeof body.userId === "string" ? body.userId : undefined

    const result = await remindAjoMembers(params.id, user.id, { userId: targetUserId })
    return NextResponse.json({ ...result, success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to send reminders"
    console.error("ajo/groups/[id]/remind POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
