import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { SignJWT } from "jose"
import { firstGrantedAdminPath, parseAdminAccess } from "@/lib/admin-access"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // Validate input
    if (!email || !password) {
      return NextResponse.json({ message: "Email and password are required" }, { status: 400 })
    }

    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      console.error("Admin login error: JWT_SECRET is not set")
      return NextResponse.json({ message: "Server configuration error" }, { status: 500 })
    }

    // Find admin user
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: "insensitive" },
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
      },
      include: {
        adminProfile: true,
      },
    })

    if (!user) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json({ message: "Account is deactivated" }, { status: 401 })
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password || "")
    if (!isValidPassword) {
      return NextResponse.json({ message: "Invalid credentials" }, { status: 401 })
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    // Create JWT using `jose`
    const secret = new TextEncoder().encode(jwtSecret)
    const adminAccess = parseAdminAccess(user.adminProfile?.permissions, user.role)
    const redirectPath = firstGrantedAdminPath(adminAccess.grants || [], adminAccess.modules || [])
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
      adminAccess,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(secret)

    // Log audit trail
    await prisma.auditLog.create({
      data: {
        action: "ADMIN_LOGIN",
        entityType: "USER",
        entityId: user.id,
        details: {
          email: user.email,
          loginTime: new Date(),
          userAgent: request.headers.get("user-agent"),
        },
        performedBy: user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      },
    })

    const response = NextResponse.json({
      message: "Login successful",
      redirectPath,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        adminProfile: user.adminProfile,
      },
    })

    // Cookie must survive reverse-proxy setups on VPS.
    const forwardedProto = request.headers.get("x-forwarded-proto")
    const isHttps = forwardedProto === "https"
    response.cookies.set("admin-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" ? isHttps : false,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 1 day
    })

    return response
  } catch (error) {
    console.error("Admin login error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
