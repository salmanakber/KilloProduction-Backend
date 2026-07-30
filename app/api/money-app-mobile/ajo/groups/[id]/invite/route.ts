import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { inviteAjoMember } from "@/lib/ajo-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const result = await inviteAjoMember({
      groupId: params.id,
      inviterId: user.id,
      userId: typeof body.userId === "string" ? body.userId : undefined,
      phone: typeof body.phone === "string" ? body.phone : undefined,
      query: typeof body.query === "string" ? body.query : undefined,
    })

    return NextResponse.json({ success: true, ...result })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
