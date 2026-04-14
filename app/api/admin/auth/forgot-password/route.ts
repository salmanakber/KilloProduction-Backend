import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    // Validate input
    if (!email) {
      return NextResponse.json({ message: "Email is required" }, { status: 400 })
    }

    // Find admin user
    const user = await prisma.user.findUnique({
      where: {
        email,
        role: { in: ["ADMIN", "SUPER_ADMIN"] },
      },
    })

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({
        message: "If an account exists, a reset link has been sent",
      })
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex")
    const resetTokenExpiry = new Date(Date.now() + 3600000) // 1 hour

    // Save reset token to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        // You'll need to add these fields to your User model
        resetToken,
        resetTokenExpiry,
      },
    })

    // Send reset email
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/admin/reset-password?token=${resetToken}`

    await sendEmail({
      to: user.email!,
      subject: "Admin Password Reset - Kilo Super App",
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb;">Kilo Super App</h1>
            <h2 style="color: #374151;">Password Reset Request</h2>
          </div>
          
          <p>Hello ${user.name || "Admin"},</p>
          
          <p>You requested a password reset for your admin account. Click the button below to reset your password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p>Or copy and paste this link in your browser:</p>
          <p style="word-break: break-all; color: #6b7280;">${resetUrl}</p>
          
          <p><strong>This link will expire in 1 hour.</strong></p>
          
          <p>If you didn't request this password reset, please ignore this email.</p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #6b7280; font-size: 14px;">
            This is an automated message from Kilo Super App Admin Panel.
          </p>
        </div>
      `,
    })

    // Log audit trail
    await prisma.auditLog.create({
      data: {
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "USER",
        entityId: user.id,
        details: {
          email: user.email,
          requestTime: new Date(),
        },
        performedBy: user.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
      },
    })

    return NextResponse.json({
      message: "If an account exists, a reset link has been sent",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    return NextResponse.json({ message: "Internal server error" }, { status: 500 })
  }
}
