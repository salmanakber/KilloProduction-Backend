import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, hashPassword } from "@/lib/auth"
import { UserRole } from "@prisma/client"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const actor = await authenticateRequest(request)
    if (!actor?.id || (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json()
    const name = String(body?.name || "").trim()
    const email = String(body?.email || "").trim().toLowerCase()
    const phone = String(body?.phone || "").trim()
    const department = String(body?.department || "").trim()
    const accessRole = String(body?.role || "SUPPORT").toUpperCase()
    const grants = Array.isArray(body?.permissions) ? body.permissions.map((x: any) => String(x)) : []
    const modules = Array.isArray(body?.modules) ? body.modules.map((x: any) => String(x).toUpperCase()) : []
    const providedPassword = String(body?.password || "")

    if (!name || !email || !providedPassword) {
      return NextResponse.json({ error: "Name, email and password are required" }, { status: 400 })
    }
    if (providedPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) return NextResponse.json({ error: "Email already exists" }, { status: 409 })

    const password = await hashPassword(providedPassword)

    const created = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || null,
        role: accessRole === "SUPER_ADMIN" ? UserRole.SUPER_ADMIN : UserRole.ADMIN,
        isActive: true,
        isVerified: true,
        password,
        adminProfile: {
          create: {
            department: department || null,
            permissions: {
              accessRole,
              grants,
              modules,
            },
          },
        },
      },
      include: { adminProfile: true },
    })

    const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://killo.com"}/admin/auth/login`
    await sendEmail(created.email || email, "genericNotification", {
      title: "Your Killo admin account has been created",
      message: `Hello ${name}, your admin account is active. Email: ${email}. Temporary password: ${providedPassword}. Please login and change your password immediately.`,
      email,
      actionUrl: dashboardUrl,
      actionText: "Login to Dashboard",
      adminContact: "support@kilo.com",
    })

    return NextResponse.json({
      success: true,
      employee: { id: created.id, name: created.name, email: created.email, role: accessRole },
    })
  } catch (error) {
    console.error("Error creating employee:", error)
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 })
  }
}

