import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { ACCESS_ROLE_DEFAULTS, parseAdminAccess } from "@/lib/admin-access"

const hasFullAccess = (accessRole: string, grants: string[]) => {
  if (accessRole === "SUPER_ADMIN") return true
  const required = ACCESS_ROLE_DEFAULTS.SUPER_ADMIN
  return required.every((feature) => grants.includes(feature))
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const status = typeof body?.status === "string" ? body.status.toUpperCase() : undefined
    const role = typeof body?.role === "string" ? body.role.toUpperCase() : undefined
    const permissions = Array.isArray(body?.permissions) ? body.permissions.map((x: any) => String(x)) : undefined
    const modules = Array.isArray(body?.modules) ? body.modules.map((x: any) => String(x).toUpperCase()) : undefined
    const name = typeof body?.name === "string" ? body.name.trim() : undefined
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined
    const phone = typeof body?.phone === "string" ? body.phone.trim() : undefined
    const department = typeof body?.department === "string" ? body.department.trim() : undefined

    const target = await prisma.user.findUnique({
      where: { id: params.id },
      include: { adminProfile: true },
    })
    if (!target) return NextResponse.json({ error: "Employee not found" }, { status: 404 })

    const current = parseAdminAccess(target.adminProfile?.permissions, target.role)
    const nextPermissionsPayload = {
      accessRole: role || current.accessRole,
      grants: permissions ?? current.grants,
      modules: modules ?? current.modules,
    }

    await prisma.user.update({
      where: { id: params.id },
      data: {
        name: name || undefined,
        email: email || undefined,
        phone: typeof phone === "string" ? phone || null : undefined,
        isActive:
          status === "ACTIVE" ? true : status === "INACTIVE" || status === "SUSPENDED" ? false : undefined,
        role: (role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN") as any,
        isVerified: true,
        adminProfile: {
          upsert: {
            create: {
              department: typeof department === "string" ? department || null : null,
              permissions: nextPermissionsPayload,
            },
            update: {
              department: typeof department === "string" ? department || null : undefined,
              permissions: nextPermissionsPayload,
            },
          },
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating employee:", error)
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (actor.id === params.id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 })
    }

    const actorUser = await prisma.user.findUnique({
      where: { id: actor.id },
      include: { adminProfile: true },
    })
    if (!actorUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const actorAccess = parseAdminAccess(actorUser.adminProfile?.permissions, actorUser.role)
    if (!hasFullAccess(actorAccess.accessRole, actorAccess.grants)) {
      return NextResponse.json({ error: "Only full-access admins can delete employees." }, { status: 403 })
    }

    const target = await prisma.user.findUnique({ where: { id: params.id }, select: { role: true } })
    if (!target || (target.role !== "ADMIN" && target.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 })
    }

    await prisma.user.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting employee:", error)
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 })
  }
}

