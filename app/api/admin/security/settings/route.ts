import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }
    const row = await prisma.systemSettings.findFirst()
    const settings = {
      passwordPolicy: {
        minLength: row?.passwordMinLength ?? 8,
        requireUppercase: row?.passwordRequireUppercase ?? true,
        requireLowercase: row?.passwordRequireLowercase ?? true,
        requireNumbers: row?.passwordRequireNumbers ?? true,
        requireSpecialChars: row?.passwordRequireSpecialChars ?? true,
        maxAge: row?.passwordMaxAge ?? 90,
      },
      sessionSettings: {
        maxDuration: row?.sessionTimeout ?? 480,
        idleTimeout: row?.lockoutDuration ?? 30,
        maxConcurrentSessions: 3,
      },
      twoFactorAuth: {
        enabled: row?.twoFactorRequired ?? false,
        required: row?.twoFactorRequired ?? false,
        methods: ["SMS", "EMAIL", "AUTHENTICATOR_APP"],
      },
      ipWhitelist: (row?.ipWhitelist as string[]) || [],
      suspiciousActivityThresholds: {
        failedLoginAttempts: row?.maxLoginAttempts ?? 5,
        timeWindow: 15,
        blockDuration: row?.lockoutDuration ?? 30,
      },
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error("Error fetching security settings:", error)
    return NextResponse.json({ error: "Failed to fetch security settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const newSettings = await request.json()
    await prisma.systemSettings.upsert({
      where: { id: 1 },
      update: {
        passwordMinLength: Number(newSettings?.passwordPolicy?.minLength || 8),
        passwordRequireUppercase: Boolean(newSettings?.passwordPolicy?.requireUppercase),
        passwordRequireLowercase: Boolean(newSettings?.passwordPolicy?.requireLowercase),
        passwordRequireNumbers: Boolean(newSettings?.passwordPolicy?.requireNumbers),
        passwordRequireSpecialChars: Boolean(newSettings?.passwordPolicy?.requireSpecialChars),
        passwordMaxAge: Number(newSettings?.passwordPolicy?.maxAge || 90),
        sessionTimeout: Number(newSettings?.sessionSettings?.maxDuration || 480),
        lockoutDuration: Number(newSettings?.suspiciousActivityThresholds?.blockDuration || 30),
        maxLoginAttempts: Number(newSettings?.suspiciousActivityThresholds?.failedLoginAttempts || 5),
        twoFactorRequired: Boolean(newSettings?.twoFactorAuth?.required || newSettings?.twoFactorAuth?.enabled),
        ipWhitelist: newSettings?.ipWhitelist || [],
      },
      create: {
        id: 1,
        passwordMinLength: Number(newSettings?.passwordPolicy?.minLength || 8),
      },
    })
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "UPDATE_SECURITY_SETTINGS",
        entityType: "SYSTEM_SETTINGS",
        entityId: "1",
        details: newSettings,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Security settings updated successfully",
      settings: newSettings,
    })
  } catch (error) {
    console.error("Error updating security settings:", error)
    return NextResponse.json({ error: "Failed to update security settings" }, { status: 500 })
  }
}
