import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"

export async function POST(request: NextRequest) {
  try {
    const { phone, email } = await request.json()

    // Find user by phone or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ phone }, { email: email || undefined }],
      },
      include: {
        userProfile: true,
        userSettings: true,
        wallet: true,
        autoPartsStore: true,
        pharmacy: true,
        restaurant: true,
        groceryStore: true,
        riderProfile: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "Account is deactivated" }, { status: 403 })
    }

    // Generate and send OTP
    const otp = generateOTP()
    await sendOTP(user.phone!, otp)

    // Store OTP temporarily
    // In production, use Redis or a separate OTP table

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
