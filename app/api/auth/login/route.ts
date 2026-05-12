import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"
import { sendEmailFromTemplate } from "@/lib/email"
import { generateToken } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { getUserModules } from "@/lib/auth-user-modules"

export async function POST(request: NextRequest) {
  try {
    const { phone, email, password, otp = true } = await request.json()
    

    // Find user by phone or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone },
          {
            email: email
              ? {
                  equals: email,
                  mode: "insensitive",
                }
              : undefined,
          },
        ],
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
    
    if (!user) {
      await prisma.auditLog.create({
        data: {
          action: "LOGIN_FAILED",
          entityType: "AUTH",
          entityId: email || phone || "UNKNOWN",
          details: { reason: "USER_NOT_FOUND", email: email || null, phone: phone || null },
        },
      }).catch(() => {})
      return NextResponse.json(
        { error: "Invalid phone number or email" },
        { status: 404 }
      )
    }
    

    // Hard guard: rider accounts must have RiderProfile before any login session is issued.
    if (user.role === "RIDER" && !user.riderProfile) {
      return NextResponse.json(
        {
          error: "Rider profile is missing. Please contact support to complete rider setup.",
          code: "RIDER_PROFILE_MISSING",
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

    // Check if account is deactivated - generate temporary token for verification center
    const sys = await prisma.systemSettings.findFirst()
    const maxAttempts = Math.max(1, Number(sys?.maxLoginAttempts ?? 5))
    const lockMinutes = Math.max(1, Number(sys?.lockoutDuration ?? 30))

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await prisma.auditLog.create({
        data: {
          performedBy: user.id,
          action: "LOGIN_FAILED",
          entityType: "AUTH",
          entityId: user.id,
          details: { reason: "ACCOUNT_LOCKED", lockedUntil: user.lockedUntil.toISOString() },
        },
      }).catch(() => {})
      return NextResponse.json(
        {
          error: "Account temporarily locked after too many failed attempts. Try again later.",
          lockedUntil: user.lockedUntil.toISOString(),
        },
        { status: 423 }
      )
    }

    if (!user.isActive ) {
      // Generate temporary token (valid for 1 hour) to access verification center
      const tempToken = await generateToken({
        userId: user.id,
        role: user.role,
        modules: getUserModules(user),
        isTemporary: true,
      }, "1h")
      
      return NextResponse.json({ 
        error: "Your account is deactivated. Please contact customer support to reactivate your account.",
        tempToken,
        requiresVerification: false,
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
        }
      }, { status: 403 })
    }
    if (!user.password) {
      return NextResponse.json(
        {
          error:
            "This account uses social sign-in. Please use Google or Facebook, or reset your password if available.",
        },
        { status: 400 }
      )
    }

    if (!bcrypt.compareSync(password, user.password)) {
      const fails = (user.loginFailedAttempts ?? 0) + 1
      const lockedUntil =
        fails >= maxAttempts ? new Date(Date.now() + lockMinutes * 60 * 1000) : null
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginFailedAttempts: fails,
          lockedUntil,
        },
      })
      await prisma.auditLog.create({
        data: {
          performedBy: user.id,
          action: "LOGIN_FAILED",
          entityType: "AUTH",
          entityId: user.id,
          details: { reason: "INVALID_PASSWORD", failedAttempts: fails, locked: Boolean(lockedUntil) },
        },
      }).catch(() => {})
      return NextResponse.json(
        {
          error: "Invalid password",
          attemptsRemaining: Math.max(0, maxAttempts - fails),
          locked: Boolean(lockedUntil),
        },
        { status: 401 }
      )
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginFailedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    })
    // Check if OTP verification should be skipped
    // If otp parameter is false, skip OTP. Otherwise check environment variable
    const skipOTP = otp === false || process.env.SKIP_OTP_VERIFICATION === "true"
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "LOGIN_SUCCESS",
        entityType: "AUTH",
        entityId: user.id,
        details: { via: email ? "EMAIL" : "PHONE", otpRequired: !skipOTP },
      },
    }).catch(() => {})

    if (skipOTP) {
      // Generate JWT token directly without OTP
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
        },
        requiresVerification: false,
      })
    }

    // Generate OTP
    const otpCode = generateOTP()

    // Send OTP to user's phone
    await sendOTP(user.phone!, otpCode)

    if (user.email) {
      // Send email to user
      await sendEmailFromTemplate(user.email, "OTP_VERIFICATION", {
        otpCode: otpCode,
        appName: process.env.APP_NAME || 'Killo',
        appUrl: process.env.APP_URL || 'https://killo.com',
        customerName: user.name || user.email,
      })
    }

    // Store OTP in DB (valid for 5 minutes)
    await prisma.otp.create({
      data: {
        userId: user.id,
        phone: user.phone!,
        code: otpCode,
        expiresAt: new Date(Date.now() + Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000), // 5 min expiry
        verified: false,
      },
    })

    return NextResponse.json({
      message: "OTP sent to your phone",
      userId: user.id,
      requiresVerification: true,
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
