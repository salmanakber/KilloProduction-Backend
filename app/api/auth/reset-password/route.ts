import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { sendOTP, generateOTP } from "@/lib/twilio"
import { sendEmailFromTemplate } from "@/lib/email"
import { EMAIL_TEMPLATE_KEYS } from "@/lib/template-keys"

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10)
const MIN_PASSWORD_LENGTH = 6

export async function POST(request: NextRequest) {
  try {
    const { token, userId, otp, password } = await request.json()

    if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
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

    // Mobile OTP flow
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
