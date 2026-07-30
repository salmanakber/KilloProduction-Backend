import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { waiveAjoContribution } from "@/lib/ajo-service"

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
    const contributionId =
      typeof body.contributionId === "string" ? body.contributionId : ""
    if (!contributionId) {
      return NextResponse.json({ error: "contributionId is required" }, { status: 400 })
    }

    try {
      const result = await waiveAjoContribution({
        groupId: params.id,
        actorId: user.id,
        contributionId,
        reason: typeof body.reason === "string" ? body.reason : undefined,
      })
      return NextResponse.json({ ...result, success: true })
    } catch (e: unknown) {
      const err = e as Error & { code?: string; graceEndsAt?: string }
      if (err.code === "GRACE_ACTIVE") {
        return NextResponse.json(
          {
            error: err.message,
            code: "GRACE_ACTIVE",
            graceEndsAt: err.graceEndsAt,
          },
          { status: 409 },
        )
      }
      throw e
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to skip contribution"
    console.error("ajo/groups/[id]/waive POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
