import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { SignJWT } from "jose"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET)
const VERIFICATION_TTL_MINUTES = 5

export async function POST(request: NextRequest) {
  try {
    const { userId, otp } = await request.json()

    if (!userId || !otp) {
      return NextResponse.json(
        { message: "User id and verification code are required" },
        { status: 400 }
      )
    }

    if (String(otp).length !== 6) {
      return NextResponse.json({ message: "Invalid verification code" }, { status: 400 })
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

    const verificationToken = await new SignJWT({
      purpose: "password_reset",
      userId,
      otpId: storedOtp.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${VERIFICATION_TTL_MINUTES}m`)
      .sign(getSecretKey())

    return NextResponse.json({
      valid: true,
      verificationToken,
      expiresInMinutes: VERIFICATION_TTL_MINUTES,
    })
  } catch (error) {
    console.error("Verify reset OTP error:", error)
    return NextResponse.json({ message: "Verification failed" }, { status: 500 })
  }
}
