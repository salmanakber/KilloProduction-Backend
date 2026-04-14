import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json()

    if (!phone) {
      return NextResponse.json({ 
        success: false, 
        message: "Phone number is required" 
      }, { status: 400 })
    }

    // Validate phone format (basic validation)
    if (phone.length < 10) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid phone number format" 
      }, { status: 400 })
    }

    // Generate OTP
    const otpCode = generateOTP()
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in database
    await prisma.otp.create({
      data: {
        phone: phone,
        code: otpCode,
        expiresAt: otpExpiry,
        verified: false,
      },
    })

    // Send OTP via SMS using Twilio
    try {
      await sendOTP(phone, otpCode)
    } catch (smsError) {
      console.error("Failed to send SMS:", smsError)
      // Continue anyway - OTP is stored in DB for testing
      console.log('OTP for testing:', otpCode)
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent to your phone",
    })
  } catch (error: any) {
    console.error("Send phone OTP error:", error)
    return NextResponse.json({ 
      success: false, 
      message: "Failed to send OTP" 
    }, { status: 500 })
  }
}


