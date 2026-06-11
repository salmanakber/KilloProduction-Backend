import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { sendEmailFromTemplate } from "@/lib/email"
import { getPropertyHostContext } from "@/lib/property-host-resolve"
import type { PropertyHostAccessRole } from "@prisma/client"

function formatMember(row: {
  id: string
  accessRole: PropertyHostAccessRole
  status: string
  createdAt: Date
  member: { id: string; name: string | null; email: string | null; phone: string | null; avatar: string | null }
}) {
  return {
    id: row.id,
    userId: row.member.id,
    name: row.member.name || "Team member",
    email: row.member.email || "",
    phone: row.member.phone || "",
    avatar: row.member.avatar || "",
    accessRole: row.accessRole,
    roleTitle: row.accessRole === "FULL_ACCESS" ? "Full access" : "Bookings only",
    status: row.status === "ACTIVE" ? "Active" : row.status,
    lastActive: row.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    assignedSuites: 0,
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx?.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rows = await prisma.propertyHostMember.findMany({
      where: { hostVendorId: ctx.hostVendorId },
      orderBy: { createdAt: "desc" },
      include: {
        member: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      },
    })

    return NextResponse.json({
      success: true,
      members: rows.map(formatMember),
    })
  } catch (error) {
    console.error("Property host members GET:", error)
    return NextResponse.json({ error: "Failed to load team" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const ctx = await getPropertyHostContext(user.id)
    if (!ctx?.canManageTeam) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const name = String(body.name || "").trim()
    const email = String(body.email || "").trim().toLowerCase()
    const phone = String(body.phone || "").trim()
    const password = String(body.password || "")
    const accessRole: PropertyHostAccessRole =
      body.accessRole === "FULL_ACCESS" ? "FULL_ACCESS" : "BOOKINGS_ONLY"

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Name, email, and password are required" },
        { status: 400 }
      )
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
    })
    if (existing) {
      return NextResponse.json({ error: "A user with this email or phone already exists" }, { status: 400 })
    }

    const host = await prisma.user.findUnique({
      where: { id: ctx.hostVendorId },
      select: { name: true, vendorProfile: { select: { businessName: true } } },
    })

    const memberUser = await prisma.user.create({
      data: {
        name,
        email,
        phone: phone || undefined,
        role: "VENDOR",
        password: await bcrypt.hash(password, 12),
        isVerified: true,
        isActive: true,
        status: "ACTIVE",
        userProfile: { create: { firstName: name.split(" ")[0], lastName: name.split(" ").slice(1).join(" ") } },
        userSettings: { create: {} },
        wallet: { create: { balance: 0 } },
      },
    })

    const membership = await prisma.propertyHostMember.create({
      data: {
        hostVendorId: ctx.hostVendorId,
        userId: memberUser.id,
        accessRole,
        status: "ACTIVE",
      },
      include: {
        member: { select: { id: true, name: true, email: true, phone: true, avatar: true } },
      },
    })

    const hostLabel = host?.vendorProfile?.businessName || host?.name || "your host"
    const appName = process.env.APP_NAME || "Killo"
    const appUrl = process.env.APP_URL || "https://killo.com"

    await sendEmailFromTemplate(
      email,
      "PROPERTY_HOST_TEAM_INVITE",
      {
        memberName: name,
        hostName: hostLabel,
        accessRole: accessRole === "FULL_ACCESS" ? "Full access" : "Bookings only",
        loginEmail: email,
        appName,
        appUrl,
      },
      "PROPERTY"
    ).catch(async () => {
      await sendEmailFromTemplate(email, "OTP_VERIFICATION", {
        customerName: name,
        appName,
        appUrl,
        otpCode: "Use the password set by your host to sign in.",
      }).catch(() => {})
    })

    return NextResponse.json({ success: true, member: formatMember(membership) }, { status: 201 })
  } catch (error: any) {
    console.error("Property host members POST:", error)
    return NextResponse.json({ error: error?.message || "Failed to add member" }, { status: 500 })
  }
}
