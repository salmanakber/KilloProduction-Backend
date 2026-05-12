import { type NextRequest, NextResponse } from "next/server"
import { OAuth2Client } from "google-auth-library"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/auth"
import { getUserModules } from "@/lib/auth-user-modules"

/**
 * Customer-only Google sign-in. Verifies `idToken` from the mobile Google SDK / expo-auth-session.
 */
export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    if (!idToken || typeof idToken !== "string") {
      return NextResponse.json({ error: "idToken is required" }, { status: 400 })
    }

    const settings = await prisma.systemSettings.findFirst()
    const oauth = (settings?.customerOAuth as Record<string, unknown>) || {}
    const g = (oauth.google as Record<string, string | undefined>) || {}
    const audience = [g.webClientId, g.iosClientId, g.androidClientId].filter(
      (x): x is string => typeof x === "string" && x.length > 0
    )
    if (audience.length === 0) {
      return NextResponse.json(
        { error: "Google sign-in is not configured in admin settings" },
        { status: 503 }
      )
    }

    const client = new OAuth2Client()
    const ticket = await client.verifyIdToken({ idToken, audience })
    const payload = ticket.getPayload()
    const email = payload?.email?.toLowerCase()?.trim()
    const sub = payload?.sub
    const name = payload?.name || payload?.given_name || "Customer"
    const picture = payload?.picture

    if (!email) {
      return NextResponse.json({ error: "Google did not return an email address" }, { status: 400 })
    }

    let user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      include: {
        userProfile: true,
        userSettings: true,
        wallet: true,
        autoPartsStore: true,
        pharmacy: true,
        restaurant: true,
        mechanicProfile: true,
        groceryStore: true,
        riderProfile: true,
        wholesaler: true,
      },
    })

    if (user && user.role !== "CUSTOMER") {
      return NextResponse.json(
        { error: "This email is registered as a non-customer account. Sign in with password." },
        { status: 403 }
      )
    }

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        {
          error: "Account temporarily locked after too many failed attempts. Try again later.",
          lockedUntil: user.lockedUntil.toISOString(),
        },
        { status: 423 }
      )
    }

    if (user && !user.isActive) {
      const tempToken = await generateToken(
        {
          userId: user.id,
          role: user.role,
          modules: getUserModules(user),
          isTemporary: true,
        },
        "1h"
      )
      return NextResponse.json(
        {
          error: "Your account is deactivated. Please contact customer support to reactivate your account.",
          tempToken,
          redirectToVerification: true,
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            name: user.name,
            role: user.role,
            isVerified: user.isVerified,
            isActive: user.isActive,
            status: user.status,
          },
        },
        { status: 403 }
      )
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar: picture || undefined,
          role: "CUSTOMER",
          isVerified: true,
          userProfile: {
            create: {
              firstName: payload?.given_name || name.split(" ")[0],
              lastName: payload?.family_name || name.split(" ").slice(1).join(" "),
            },
          },
          userSettings: { create: {} },
          wallet: { create: { balance: 0 } },
        },
        include: {
          userProfile: true,
          userSettings: true,
          wallet: true,
          autoPartsStore: true,
          pharmacy: true,
          restaurant: true,
          mechanicProfile: true,
          groceryStore: true,
          riderProfile: true,
          wholesaler: true,
        },
      })
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          loginFailedAttempts: 0,
          lockedUntil: null,
          ...(picture && !user.avatar ? { avatar: picture } : {}),
        },
      })
    }

    const token = await generateToken({
      userId: user.id,
      role: user.role,
      modules: getUserModules(user),
    })

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        role: user.role,
        isVerified: user.isVerified,
        isActive: user.isActive,
        status: user.status,
        avatar: user.avatar,
        profile: user.userProfile,
        settings: user.userSettings,
        wallet: user.wallet,
        modules: getUserModules(user),
        oauthProvider: "google",
        oauthSub: sub,
      },
    })
  } catch (e: unknown) {
    console.error("oauth/google:", e)
    const msg = e instanceof Error ? e.message : "Google sign-in failed"
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}
