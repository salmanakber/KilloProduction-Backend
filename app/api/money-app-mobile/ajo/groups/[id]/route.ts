import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getAjoGroupForUser, serializeAjoGroup } from "@/lib/ajo-service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const group = await getAjoGroupForUser(params.id, user.id)
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      group: serializeAjoGroup(group, user.id),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("ajo/groups/[id] GET:", e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
