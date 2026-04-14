import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

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

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch full user data with all related profiles
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
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

    if (!fullUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      user: {
        id: fullUser.id,
        phone: fullUser.phone,
        email: fullUser.email,
        name: fullUser.name,
        role: fullUser.role,
        isVerified: fullUser.isVerified,
        isActive: fullUser.isActive,
        status: fullUser.status,
        avatar: fullUser.avatar,
        profile: fullUser.userProfile,
        settings: fullUser.userSettings,
        wallet: fullUser.wallet,
        modules: getUserModules(fullUser),
      },
    })
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}


