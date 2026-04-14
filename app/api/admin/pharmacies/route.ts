import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET /api/admin/pharmacies - List all pharmacies for admin
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacies = await prisma.pharmacy.findMany({
      select: {
        id: true,
        pharmacyName: true,
        address: true,
        phone: true,
        email: true,
        isVerified: true,
        isApprovedByAdmin: true,
        status: true,
        createdAt: true
      },
      orderBy: {
        pharmacyName: "asc"
      }
    })

    return NextResponse.json(pharmacies)
  } catch (error: any) {
    console.error("Error fetching pharmacies:", error)
    return NextResponse.json(
      { error: "Failed to fetch pharmacies" },
      { status: 500 }
    )
  }
}

