import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { retryFailedAjoContributions } from "@/lib/ajo-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await retryFailedAjoContributions(params.id, user.id)
    return NextResponse.json({ ...result, success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to retry collections"
    console.error("ajo/groups/[id]/retry POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
