import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { userId, otp } = await request.json()

    // In production, verify OTP from Redis or OTP table
    // For now, we'll accept any 6-digit OTP for demo purposes
    if (!otp || otp.length !== 6) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    // Mark user as verified
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    })

    // Generate JWT token
    const token = generateToken({
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
        profile: user.userProfile,
        settings: user.userSettings,
        wallet: user.wallet,
        modules: getUserModules(user),
      },
    })
  } catch (error) {
    console.error("OTP verification error:", error)
    return NextResponse.json({ error: "OTP verification failed" }, { status: 500 })
  }
}

function getUserModules(user: any): string[] {
  const modules = []
  if (user.autoPartsStore) modules.push("AUTO_PARTS")
  if (user.pharmacy) modules.push("PHARMACY")
  if (user.restaurant) modules.push("FOOD")
  if (user.groceryStore) modules.push("GROCERY")
  if (user.riderProfile) modules.push("RIDING")
  return modules
}
