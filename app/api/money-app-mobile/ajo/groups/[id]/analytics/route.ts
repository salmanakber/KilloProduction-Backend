import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { getAjoGroupAnalytics } from "@/lib/ajo-service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const analytics = await getAjoGroupAnalytics(params.id, user.id)
    return NextResponse.json({ success: true, analytics })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
