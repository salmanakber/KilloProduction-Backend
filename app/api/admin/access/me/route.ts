import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { parseAdminAccess } from "@/lib/admin-access"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    const user = await authenticateRequest()
    if (!user?.id || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const adminProfile = await prisma.adminProfile.findUnique({
      where: { userId: user.id },
      select: { permissions: true },
    })
    const access = parseAdminAccess(adminProfile?.permissions, user.role)
    return NextResponse.json({
      accessRole: access.accessRole,
      grants: access.grants,
      modules: access.modules,
    })
  } catch (error) {
    console.error("access/me:", error)
    return NextResponse.json({ error: "Failed to load access" }, { status: 500 })
  }
}

