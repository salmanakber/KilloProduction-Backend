import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/auth"
import { getUserModules } from "@/lib/auth-user-modules"

/**
 * Customer-only Facebook sign-in using a user access token from the mobile SDK.
 */
export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json()
    if (!accessToken || typeof accessToken !== "string") {
      return NextResponse.json({ error: "accessToken is required" }, { status: 400 })
    }

    const settings = await prisma.systemSettings.findFirst()
    const oauth = (settings?.customerOAuth as Record<string, unknown>) || {}
    const f = (oauth.facebook as Record<string, string | undefined>) || {}
    if (!f.appId) {
      return NextResponse.json(
        { error: "Facebook sign-in is not configured in admin settings" },
        { status: 503 }
      )
    }

    const appSecret = f.appSecret || process.env.FACEBOOK_APP_SECRET
    if (!appSecret) {
      return NextResponse.json(
        { error: "Facebook app secret is missing (admin settings or FACEBOOK_APP_SECRET)" },
        { status: 503 }
      )
    }

    const debugUrl = new URL("https://graph.facebook.com/debug_token")
    debugUrl.searchParams.set("input_token", accessToken)
    debugUrl.searchParams.set("access_token", `${f.appId}|${appSecret}`)
    const dbg = await fetch(debugUrl.toString())
    const dbgJson = await dbg.json()
    const data = dbgJson?.data
    if (!data?.is_valid || String(data?.app_id) !== String(f.appId)) {
      return NextResponse.json({ error: "Invalid Facebook access token" }, { status: 401 })
    }

    const meUrl = new URL("https://graph.facebook.com/me")
    meUrl.searchParams.set("fields", "id,name,email,picture")
    meUrl.searchParams.set("access_token", accessToken)
    const meRes = await fetch(meUrl.toString())
    const me = await meRes.json()
    const email = typeof me.email === "string" ? me.email.toLowerCase().trim() : ""
    const fbId = me.id as string | undefined
    const name = (me.name as string) || "Customer"

    if (!email) {
      return NextResponse.json(
        { error: "Facebook did not return an email. Ensure email permission is granted." },
        { status: 400 }
      )
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

    const pic = me.picture?.data?.url as string | undefined

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          avatar: pic,
          role: "CUSTOMER",
          isVerified: true,
          userProfile: {
            create: {
              firstName: name.split(" ")[0],
              lastName: name.split(" ").slice(1).join(" "),
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
          ...(pic && !user.avatar ? { avatar: pic } : {}),
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
        oauthProvider: "facebook",
        oauthSub: fbId,
      },
    })
  } catch (e: unknown) {
    console.error("oauth/facebook:", e)
    const msg = e instanceof Error ? e.message : "Facebook sign-in failed"
    return NextResponse.json({ error: msg }, { status: 401 })
  }
}
