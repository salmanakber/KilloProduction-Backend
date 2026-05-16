import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/** Coerce DB / JSON values to a strict boolean for maintenance flag. */
function readMaintenanceEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (value === false || value === 0 || value == null) return false
  if (typeof value === "string") {
    const s = value.trim().toLowerCase()
    if (s === "true" || s === "1" || s === "yes" || s === "on") return true
    if (s === "false" || s === "0" || s === "no" || s === "off" || s === "") return false
  }
  return Boolean(value)
}

/**
 * Public config for mobile auth (no secrets). OAuth app secrets stay server-side only.
 */
export async function GET(request: NextRequest) {
  try {
    const row = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    const oauth = (row?.customerOAuth as Record<string, unknown>) || {}
    const g = (oauth.google as Record<string, unknown>) || {}
    const f = (oauth.facebook as Record<string, unknown>) || {}

    const googleOn = g.enabled !== false
    const facebookOn = f.enabled !== false
    const maintenanceEnabled = readMaintenanceEnabled(row?.maintenanceMode)

    const payload = {
      maintenance: {
        enabled: maintenanceEnabled,
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
          enabled:
            googleOn &&
            Boolean(
              (typeof g.webClientId === "string" && g.webClientId) ||
                (typeof g.iosClientId === "string" && g.iosClientId) ||
                (typeof g.androidClientId === "string" && g.androidClientId)
            ),
          webClientId: typeof g.webClientId === "string" ? g.webClientId : "",
          iosClientId: typeof g.iosClientId === "string" ? g.iosClientId : "",
          androidClientId: typeof g.androidClientId === "string" ? g.androidClientId : "",
        },
        facebook: {
          enabled: facebookOn && typeof f.appId === "string" && Boolean(f.appId),
          appId: typeof f.appId === "string" ? f.appId : "",
        },
      },
    }

    const debug = request.nextUrl.searchParams.get("debug") === "1"
    const response = NextResponse.json(
      debug
        ? {
            ...payload,
            _debug: {
              rowId: row?.id ?? null,
              maintenanceModeRaw: row?.maintenanceMode ?? null,
              maintenanceModeType: row?.maintenanceMode == null ? "null" : typeof row?.maintenanceMode,
            },
          }
        : payload
    )
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate")
    return response
  } catch (e) {
    console.error("auth-config:", e)
    return NextResponse.json({ error: "Failed to load auth config" }, { status: 500 })
  }
}
