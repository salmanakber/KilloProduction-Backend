import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { removeAjoMember } from "@/lib/ajo-service"

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; userId: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await removeAjoMember(params.id, user.id, params.userId)
    return NextResponse.json({ ...result, success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to remove member"
    console.error("ajo/groups/[id]/members/[userId] DELETE:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
