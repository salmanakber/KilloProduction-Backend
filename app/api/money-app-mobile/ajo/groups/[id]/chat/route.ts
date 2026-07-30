import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { listAjoChatMessages, sendAjoChatMessage } from "@/lib/ajo-chat-service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const before = request.nextUrl.searchParams.get("before") || undefined
    const result = await listAjoChatMessages(params.id, user.id, { before })
    return NextResponse.json({ success: true, ...result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

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
    const content = typeof body.content === "string" ? body.content : ""
    const replyToMessageId =
      typeof body.replyToMessageId === "string" ? body.replyToMessageId : undefined
    const mentionUserIds = Array.isArray(body.mentionUserIds)
      ? body.mentionUserIds.filter((id: unknown) => typeof id === "string")
      : undefined
    const msg = await sendAjoChatMessage({
      groupId: params.id,
      userId: user.id,
      content,
      replyToMessageId,
      mentionUserIds,
    })
    return NextResponse.json({ success: true, message: msg })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
