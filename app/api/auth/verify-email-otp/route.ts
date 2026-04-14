import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const { email, otp } = await request.json()

    if (!email || !otp) {
      return NextResponse.json({ 
        success: false, 
        message: "Email and OTP are required" 
      }, { status: 400 })
    }

    if (otp.length !== 6) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid OTP format" 
      }, { status: 400 })
    }

    // Find the OTP
    const storedOtp = await prisma.otp.findFirst({
      where: {
        email: email,
        code: otp,
        expiresAt: {
          gt: new Date(),
        },
        verified: false,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    if (!storedOtp) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid or expired OTP" 
      }, { status: 400 })
    }

    // Mark OTP as verified
    await prisma.otp.update({
      where: { id: storedOtp.id },
      data: { verified: true },
    })

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    })
  } catch (error: any) {
    console.error("Verify email OTP error:", error)
    return NextResponse.json({ 
      success: false, 
      message: "OTP verification failed" 
    }, { status: 500 })
  }
}


