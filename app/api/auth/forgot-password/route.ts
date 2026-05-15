import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"
import { sendEmailFromTemplate } from "@/lib/email"
import { EMAIL_TEMPLATE_KEYS } from "@/lib/template-keys"

const OTP_EXPIRY_MINUTES = Number(process.env.OTP_EXPIRY_MINUTES || 10)

export async function POST(request: NextRequest) {
  try {
    const { email, phone, role } = await request.json()

    if (!email && !phone) {
      return NextResponse.json({ message: "Email or phone is required" }, { status: 400 })
    }

    const roleFilter =
      role && typeof role === "string"
        ? { role: role.toUpperCase() as "VENDOR" | "CUSTOMER" | "RIDER" | "MECHANIC" | "WHOLESALER" }
        : {}

    const user = await prisma.user.findFirst({
      where: {
        ...roleFilter,
        OR: [
          phone ? { phone } : undefined,
          email
            ? {
                email: {
                  equals: email,
                  mode: "insensitive",
                },
              }
            : undefined,
        ].filter(Boolean) as { phone?: string; email?: { equals: string; mode: "insensitive" } }[],
      },
    })

    // Generic success to reduce account enumeration
    if (!user) {
      return NextResponse.json({
        message: "If an account exists, a verification code has been sent",
        requiresVerification: true,
      })
    }

    if (!user.phone && !user.email) {
      return NextResponse.json(
        { message: "No contact method on file for this account" },
        { status: 400 }
      )
    }

    const otpCode = generateOTP()
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)

    await prisma.otp.create({
      data: {
        userId: user.id,
        phone: user.phone || phone || null,
        email: user.email || email || null,
        code: otpCode,
        expiresAt,
        verified: false,
      },
    })

    if (user.phone) {
      try {
        await sendOTP(user.phone, otpCode)
      } catch (smsError) {
        console.error("Forgot password SMS error:", smsError)
        if (process.env.NODE_ENV !== "production") {
          console.log("[forgot-password] OTP for testing:", otpCode)
        }
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
      } catch (emailError) {
        console.error("Forgot password email error:", emailError)
        try {
          await sendEmailFromTemplate(user.email, "OTP_VERIFICATION", {
            otpCode,
            appName: process.env.APP_NAME || "Kilo",
            appUrl: process.env.APP_URL || "https://kilo1app.com",
            customerName: user.name || user.email,
          })
        } catch (fallbackError) {
          console.error("Forgot password email fallback error:", fallbackError)
          if (process.env.NODE_ENV !== "production") {
            console.log("[forgot-password] OTP for testing:", otpCode)
          }
        }
      }
    }

    await prisma.auditLog
      .create({
        data: {
          performedBy: user.id,
          action: "PASSWORD_RESET_REQUESTED",
          entityType: "AUTH",
          entityId: user.id,
          details: {
            via: user.phone ? "PHONE" : "EMAIL",
            hasPhone: Boolean(user.phone),
            hasEmail: Boolean(user.email),
          },
        },
      })
      .catch(() => {})

    return NextResponse.json({
      message: "Verification code sent",
      userId: user.id,
      requiresVerification: true,
      maskedPhone: user.phone ? maskPhone(user.phone) : undefined,
      maskedEmail: user.email ? maskEmail(user.email) : undefined,
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    return NextResponse.json({ message: "Failed to send reset code" }, { status: 500 })
  }
}

function maskPhone(phone: string) {
  if (phone.length <= 4) return "****"
  return `${phone.slice(0, 3)}****${phone.slice(-2)}`
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@")
  if (!domain) return "***"
  const visible = local.slice(0, 2)
  return `${visible}***@${domain}`
}
