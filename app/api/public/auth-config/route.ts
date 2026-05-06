import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Public config for mobile auth (no secrets). OAuth app secrets stay server-side only.
 */
export async function GET(_request: NextRequest) {
  try {
    const row = await prisma.systemSettings.findFirst()
    const oauth = (row?.customerOAuth as Record<string, unknown>) || {}
    const g = (oauth.google as Record<string, string | undefined>) || {}
    const f = (oauth.facebook as Record<string, string | undefined>) || {}

    const googleOn = g.enabled !== false
    const facebookOn = f.enabled !== false

    return NextResponse.json({
      maintenance: {
        enabled: row?.maintenanceMode === true,
        message:
          row?.maintenanceMessage?.trim() ||
          "We are performing maintenance. Please try again shortly.",
      },
      passwordPolicy: {
        minLength: row?.passwordMinLength ?? 8,
        requireUppercase: row?.passwordRequireUppercase ?? true,
        requireLowercase: row?.passwordRequireLowercase ?? true,
        requireNumbers: row?.passwordRequireNumbers ?? true,
        requireSpecialChars: row?.passwordRequireSpecialChars ?? true,
        maxAgeDays: row?.passwordMaxAge ?? 90,
      },
      sessionTimeoutMinutes: row?.sessionTimeout ?? 480,
      maxLoginAttempts: row?.maxLoginAttempts ?? 5,
      lockoutDurationMinutes: row?.lockoutDuration ?? 30,
      biometric: {
        enabled: row?.twoFactorRequired === true,
      },
      oauth: {
        google: {
          enabled: googleOn && Boolean(g.webClientId || g.iosClientId || g.androidClientId),
          webClientId: g.webClientId || "",
          iosClientId: g.iosClientId || "",
          androidClientId: g.androidClientId || "",
        },
        facebook: {
          enabled: facebookOn && Boolean(f.appId),
          appId: f.appId || "",
        },
      },
    })
  } catch (e) {
    console.error("auth-config:", e)
    return NextResponse.json({ error: "Failed to load auth config" }, { status: 500 })
  }
}
