import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"
import { sendEmailFromTemplate } from "@/lib/email"
import { generateToken } from "@/lib/auth"
import bcrypt from "bcryptjs"

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
      },
    })
    
    if (!user) {
      return NextResponse.json(
        { error: "Invalid phone number or email" },
        { status: 404 }
      )
    }
    

    // Check if account is deactivated - generate temporary token for verification center
    if (!user.isActive ) {
      // Generate temporary token (valid for 1 hour) to access verification center
      const tempToken = await generateToken({
        userId: user.id,
        role: user.role,
        modules: getUserModules(user),
        isTemporary: true,
        expiresIn: "1h",
      })
      
      return NextResponse.json({ 
        error: "Account is deactivated",
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
    if (user.password && !bcrypt.compareSync(password, user.password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 })
    }

    // Check if OTP verification should be skipped
    // If otp parameter is false, skip OTP. Otherwise check environment variable
    const skipOTP = otp === false || process.env.SKIP_OTP_VERIFICATION === "true"

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

function getUserModules(user: any): string[] {
  const modules: string[] = []
  if (user.autoPartsStore) modules.push("AUTO_PARTS")
  if (user.pharmacy) modules.push("PHARMACY")
  if (user.restaurant) modules.push("FOOD")
  if (user.groceryStore) modules.push("GROCERY")
  if (user.riderProfile) modules.push("RIDING")
  if (user.mechanicProfile) modules.push("MECHANIC")
  return modules
}
