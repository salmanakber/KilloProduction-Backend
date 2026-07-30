import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getAjoJoinPreview, joinAjoGroupByInvite } from "@/lib/ajo-service"

export async function GET(
  _request: NextRequest,
  { params }: { params: { inviteCode: string } },
) {
  try {
    const preview = await getAjoJoinPreview(params.inviteCode)
    if (!preview) {
      return NextResponse.json({ error: "Invalid invite code" }, { status: 404 })
    }
    return NextResponse.json({ success: true, group: preview })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { inviteCode: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await joinAjoGroupByInvite(user.id, params.inviteCode)
    return NextResponse.json({
      success: true,
      groupId: result.group.id,
      alreadyMember: result.alreadyMember ?? false,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("ajo/join POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
