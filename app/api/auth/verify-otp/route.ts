import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { generateToken } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const { userId, otp } = await request.json()


    if (!otp || otp.length !== 6) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 })
    }

    const storedOtp = await prisma.otp.findFirst({
      where: {
        userId,
        code: otp,
        expiresAt: {
          gt: new Date(),
        },
        verified: false,
      },
    })
    

    if (!storedOtp) {
      return NextResponse.json({ error: "OTP expired or invalid" }, { status: 400 })
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
        mechanicProfile: true,
        groceryStore: true,
        riderProfile: true,
        wholesaler: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }
    
    // Check if account is deactivated - generate temporary token for verification center
    if (!user.isActive || !user.isVerified) {
      // Generate temporary token (valid for 1 hour) to access verification center
      const tempToken = await generateToken({
        userId: user.id,
        role: user.role,
        modules: getUserModules(user),
        isTemporary: true,
      }, "1h")
      
      return NextResponse.json({ 
        error: "Account is deactivated",
        tempToken,
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

    // Mark user as verified
    await prisma.user.update({
      where: { id: userId },
      data: { isVerified: true },
    })

    await prisma.otp.update({
      where: { id: storedOtp.id },
      data: { verified: true },
    })
    // Generate JWT token
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
    })
  } catch (error) {
    console.error("OTP verification error:", error)
    return NextResponse.json({ error: "OTP verification failed" }, { status: 500 })
  }
}

function getUserModules(user: any): string[] {
  const modules: string[] = []

  // Helper to check values: arrays, objects, primitives
  const hasValue = (field: any): boolean => {
    if (!field) return false              // null, undefined, 0, false
    if (Array.isArray(field)) return field.length > 0  // array not empty
    if (typeof field === "object") return Object.keys(field).length > 0 // object not empty
    return true                           // primitive is truthy
  }

  // Map user fields to module names
  const fieldModuleMap: [any, string][] = [
    [user.autoPartsStore, "AUTO_PARTS"],
    [user.pharmacy, "PHARMACY"],
    [user.restaurant, "FOOD"],
    [user.groceryStore, "GROCERY"],
    [user.riderProfile, "RIDING"],
    [user.mechanicProfile, "MECHANIC"],
    [user.userProfile, "CUSTOMER"],
    [user.wholesaler, "SUPPLIER"],
  ]

  fieldModuleMap.forEach(([field, moduleName]) => {
    if (hasValue(field)) {
      modules.push(moduleName)
    }
  })

  return modules
}
