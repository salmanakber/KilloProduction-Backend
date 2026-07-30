import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { serializeAjoGroup, updateAjoGroupRules } from "@/lib/ajo-service"

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const group = await updateAjoGroupRules(params.id, user.id, {
      gracePeriodHours:
        typeof body.gracePeriodHours === "number" ? body.gracePeriodHours : undefined,
      collectionOrderStrategy: body.collectionOrderStrategy,
      lateFeePercent: typeof body.lateFeePercent === "number" ? body.lateFeePercent : undefined,
      requirePinForContribute:
        typeof body.requirePinForContribute === "boolean"
          ? body.requirePinForContribute
          : undefined,
    })

    return NextResponse.json({
      success: true,
      group: serializeAjoGroup(group, user.id),
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
