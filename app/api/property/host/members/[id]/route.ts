import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { getPropertyHostContext } from "@/lib/property-host-resolve"
import type { PropertyHostAccessRole } from "@prisma/client"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const row = await prisma.propertyHostMember.findFirst({
      where: { id: params.id, hostVendorId: ctx.hostVendorId },
      include: {
        member: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      },
    })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      success: true,
      member: {
        id: row.id,
        userId: row.member.id,
        name: row.member.name,
        email: row.member.email,
        phone: row.member.phone,
        avatar: row.member.avatar,
        accessRole: row.accessRole,
        status: row.status,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: "Failed to load member" }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx?.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const row = await prisma.propertyHostMember.findFirst({
      where: { id: params.id, hostVendorId: ctx.hostVendorId },
      include: { member: true },
    })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const accessRole: PropertyHostAccessRole | undefined =
      body.accessRole === "FULL_ACCESS"
        ? "FULL_ACCESS"
        : body.accessRole === "BOOKINGS_ONLY"
          ? "BOOKINGS_ONLY"
          : undefined

    if (accessRole) {
      await prisma.propertyHostMember.update({
        where: { id: row.id },
        data: { accessRole },
      })
    }

    const memberUpdate: Record<string, unknown> = {}
    if (typeof body.name === "string" && body.name.trim()) memberUpdate.name = body.name.trim()
    if (typeof body.email === "string" && body.email.trim()) memberUpdate.email = body.email.trim()
    if (typeof body.phone === "string") memberUpdate.phone = body.phone.trim() || null
    if (typeof body.password === "string" && body.password.length >= 8) {
      memberUpdate.password = await bcrypt.hash(body.password, 12)
    }
    if (typeof body.status === "string") {
      await prisma.propertyHostMember.update({
        where: { id: row.id },
        data: { status: body.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE" },
      })
    }

    if (Object.keys(memberUpdate).length > 0) {
      await prisma.user.update({ where: { id: row.userId }, data: memberUpdate })
    }

    const updated = await prisma.propertyHostMember.findUnique({
      where: { id: row.id },
      include: { member: { select: { id: true, name: true, email: true, phone: true, avatar: true } } },
    })

    return NextResponse.json({ success: true, member: updated })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx?.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const row = await prisma.propertyHostMember.findFirst({
      where: { id: params.id, hostVendorId: ctx.hostVendorId },
    })
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.propertyHostMember.delete({ where: { id: row.id } })
    await prisma.user.update({
      where: { id: row.userId },
      data: { isActive: false, status: "INACTIVE" },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
  }
}
