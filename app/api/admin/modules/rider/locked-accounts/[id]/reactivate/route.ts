import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { reactivateRiderCommissionLock } from "@/lib/process-rider-payable-commission"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const admin = await prisma.user.findUnique({ where: { id: session.id } })
    if (admin?.role !== "ADMIN" && admin?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const riderId = params.id
    if (!riderId) {
      return NextResponse.json({ error: "Rider id required" }, { status: 400 })
    }

    await reactivateRiderCommissionLock(riderId, admin?.id)

    return NextResponse.json({
      success: true,
      message: "Rider account reactivated successfully",
    })
  } catch (error) {
    console.error("[admin reactivate rider]", error)
    return NextResponse.json({ error: "Failed to reactivate rider" }, { status: 500 })
  }
}
