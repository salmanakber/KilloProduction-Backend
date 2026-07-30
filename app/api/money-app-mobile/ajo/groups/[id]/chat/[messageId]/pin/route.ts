import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { pinAjoChatMessage, unpinAjoChatMessage } from "@/lib/ajo-chat-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; messageId: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const pinned = await pinAjoChatMessage({
      groupId: params.id,
      userId: user.id,
      messageId: params.messageId,
    })
    return NextResponse.json({ success: true, pinnedMessage: pinned })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; messageId: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    await unpinAjoChatMessage({ groupId: params.id, userId: user.id })
    return NextResponse.json({ success: true, pinnedMessage: null })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
