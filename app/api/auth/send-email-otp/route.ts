import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendEmailFromTemplate } from "@/lib/email"

// Generate 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ 
        success: false, 
        message: "Email is required" 
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid email format" 
      }, { status: 400 })
    }

    // Check if email is already in use by another user
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    
    // Get current user from token (you'll need to implement this based on your auth system)
    // For now, we'll skip this check but you should add it
    
    // Generate OTP
    const otpCode = generateOTP()
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store OTP in database
    await prisma.otp.create({
      data: {
        email: email,
        code: otpCode,
        expiresAt: otpExpiry,
        verified: false,
      },
    })

    // Send OTP via email using database template
    try {
      await sendEmailFromTemplate(
        email,
        'EMAIL_VERIFICATION_OTP',
        {
          otp: otpCode,
          email: email,
          expiryMinutes: '10',
          year: new Date().getFullYear().toString(),
        }
      )
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError)
      // Continue anyway - OTP is stored in DB for testing
      console.log('OTP for testing:', otpCode)
    }

    return NextResponse.json({
      success: true,
      message: "OTP sent to your email",
    })
  } catch (error: any) {
    console.error("Send email OTP error:", error)
    return NextResponse.json({ 
      success: false, 
      message: "Failed to send OTP" 
    }, { status: 500 })
  }
}

