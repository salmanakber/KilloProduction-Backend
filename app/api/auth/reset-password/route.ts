import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { jwtVerify } from "jose"
import { sendOTP, generateOTP } from "@/lib/twilio"
import { sendEmailFromTemplate } from "@/lib/email"
import { EMAIL_TEMPLATE_KEYS } from "@/lib/template-keys"
import {
  getPasswordPolicyFromSettings,
  validatePasswordAgainstPolicy,
} from "@/lib/password-policy"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET)

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10)

export async function POST(request: NextRequest) {
  try {
    const { token, userId, otp, password, verificationToken } = await request.json()

    if (!password || typeof password !== "string") {
      return NextResponse.json({ message: "Password is required" }, { status: 400 })
    }

    const sys = await prisma.systemSettings.findFirst()
    const rules = getPasswordPolicyFromSettings(sys)
    const policyCheck = validatePasswordAgainstPolicy(password, rules)
    if (!policyCheck.ok) {
      return NextResponse.json(
        { message: policyCheck.message, error: policyCheck.message },
        { status: 400 }
      )
    }

    const hashedPassword = await bcrypt.hash(String(password), 12)

    // Email link flow (legacy / web)
    if (token) {
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: { gt: new Date() },
        },
      })

      if (!user) {
        return NextResponse.json({ message: "Invalid or expired reset link" }, { status: 400 })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
          loginFailedAttempts: 0,
          lockedUntil: null,
        },
      })

      await prisma.auditLog
        .create({
          data: {
            performedBy: user.id,
            action: "PASSWORD_RESET_COMPLETED",
            entityType: "AUTH",
            entityId: user.id,
            details: { via: "RESET_TOKEN" },
          },
        })
        .catch(() => {})

      return NextResponse.json({ message: "Password reset successful" })
    }

    // Mobile two-step flow: verificationToken from POST /auth/verify-reset-otp
    if (verificationToken) {
      let payload: { purpose?: string; userId?: string; otpId?: string }
      try {
        const { payload: verified } = await jwtVerify(verificationToken, getSecretKey())
        payload = verified as { purpose?: string; userId?: string; otpId?: string }
      } catch {
        return NextResponse.json(
          { message: "Verification expired. Please verify your code again." },
          { status: 401 }
        )
      }

      if (payload.purpose !== "password_reset" || !payload.userId || !payload.otpId) {
        return NextResponse.json({ message: "Invalid verification session" }, { status: 401 })
      }

      const storedOtp = await prisma.otp.findFirst({
        where: {
          id: payload.otpId,
          userId: payload.userId,
          expiresAt: { gt: new Date() },
          verified: false,
        },
      })

      if (!storedOtp) {
        return NextResponse.json(
          { message: "Verification expired. Please request a new code." },
          { status: 400 }
        )
      }

      await prisma.$transaction([
        prisma.user.update({
          where: { id: payload.userId },
          data: {
            password: hashedPassword,
            resetToken: null,
            resetTokenExpiry: null,
            loginFailedAttempts: 0,
            lockedUntil: null,
          },
        }),
        prisma.otp.update({
          where: { id: storedOtp.id },
          data: { verified: true },
        }),
      ])

      await prisma.auditLog
        .create({
          data: {
            performedBy: payload.userId,
            action: "PASSWORD_RESET_COMPLETED",
            entityType: "AUTH",
            entityId: payload.userId,
            details: { via: "OTP_VERIFICATION_TOKEN" },
          },
        })
        .catch(() => {})

      return NextResponse.json({ message: "Password reset successful" })
    }

    // Mobile single-step fallback: userId + otp together
    if (!userId || !otp) {
      return NextResponse.json(
        { message: "Verification code and user id are required" },
        { status: 400 }
      )
    }

    const storedOtp = await prisma.otp.findFirst({
      where: {
        userId,
        code: String(otp),
        expiresAt: { gt: new Date() },
        verified: false,
      },
      orderBy: { createdAt: "desc" },
    })

    if (!storedOtp) {
      return NextResponse.json({ message: "Invalid or expired verification code" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiry: null,
          loginFailedAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.otp.update({
        where: { id: storedOtp.id },
        data: { verified: true },
      }),
    ])

    await prisma.auditLog
      .create({
        data: {
          performedBy: userId,
          action: "PASSWORD_RESET_COMPLETED",
          entityType: "AUTH",
          entityId: userId,
          details: { via: "OTP" },
        },
      })
      .catch(() => {})

    return NextResponse.json({ message: "Password reset successful" })
  } catch (error) {
    console.error("Reset password error:", error)
    return NextResponse.json({ message: "Password reset failed" }, { status: 500 })
  }
}

/** Resend OTP during reset flow — same body as forgot-password */
export async function PUT(request: NextRequest) {
  try {
    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ message: "userId is required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 })
    }

    const otpCode = generateOTP()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    await prisma.otp.create({
      data: {
        userId: user.id,
        phone: user.phone,
        email: user.email,
        code: otpCode,
        expiresAt,
        verified: false,
      },
    })

    if (user.phone) {
      try {
        await sendOTP(user.phone, otpCode)
      } catch (e) {
        console.error("Resend reset OTP SMS error:", e)
      }
    }

    if (user.email) {
      try {
        await sendEmailFromTemplate(user.email, EMAIL_TEMPLATE_KEYS.GLOBAL.RESET_PASSWORD, {
          otp: otpCode,
          otpCode,
          customerName: user.name || user.email,
          appName: process.env.APP_NAME || "Kilo",
          expiryMinutes: String(OTP_EXPIRY_MINUTES),
          year: new Date().getFullYear().toString(),
        })
      } catch (e) {
        console.error("Resend reset OTP email error:", e)
      }
    }

    return NextResponse.json({ message: "Verification code resent" })
  } catch (error) {
    console.error("Resend reset OTP error:", error)
    return NextResponse.json({ message: "Failed to resend code" }, { status: 500 })
  }
}
