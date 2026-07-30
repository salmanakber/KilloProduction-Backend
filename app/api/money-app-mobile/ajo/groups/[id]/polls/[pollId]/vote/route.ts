import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { voteAjoPoll } from "@/lib/ajo-chat-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; pollId: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const optionId = typeof body.optionId === "string" ? body.optionId : ""
    const poll = await voteAjoPoll({
      groupId: params.id,
      userId: user.id,
      pollId: params.pollId,
      optionId,
    })
    return NextResponse.json({ success: true, poll })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
