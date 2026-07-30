import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { serializeAjoGroup, startAjoGroup, checkAjoMembersBalances } from "@/lib/ajo-service"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const balanceCheck = await checkAjoMembersBalances(params.id)
    return NextResponse.json({ success: true, balanceCheck })
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
    const force = Boolean(body.force)

    try {
      const group = await startAjoGroup(params.id, user.id, { force })
      if (!group) {
        return NextResponse.json({ error: "Failed to start group" }, { status: 400 })
      }
      return NextResponse.json({
        success: true,
        group: serializeAjoGroup(group, user.id),
      })
    } catch (e: unknown) {
      const err = e as Error & { code?: string; balanceCheck?: unknown }
      if (err.code === "INSUFFICIENT_MEMBER_BALANCES") {
        return NextResponse.json(
          {
            error: err.message,
            code: err.code,
            balanceCheck: err.balanceCheck,
          },
          { status: 409 },
        )
      }
      throw e
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    console.error("ajo/groups/[id]/start POST:", e)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
