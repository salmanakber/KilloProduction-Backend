
import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
      include: {
        specializations: {
          include: {
            medicineOrigin: {
              select: {
                id: true,
                name: true,
                displayName: true
              }
            }
          }
        }
      }
    })

    if (!pharmacy) {
      return NextResponse.json({ 
        error: "Pharmacy not found",
        hasPharmacy: false
      }, { status: 404 })
    }

    return NextResponse.json({
      hasPharmacy: true,
      verificationStatus: pharmacy.status,
      isVerified: pharmacy.isVerified,
      isApprovedByAdmin: pharmacy.isApprovedByAdmin,
      pharmacy: {
        id: pharmacy.id,
        pharmacyName: pharmacy.pharmacyName,
        licenseNumber: pharmacy.licenseNumber,
        address: pharmacy.address,
        phone: pharmacy.phone,
        email: pharmacy.email,
        description: pharmacy.description,
        specializations: pharmacy.specializations,
        createdAt: pharmacy.createdAt,
        updatedAt: pharmacy.updatedAt
      }
    })
  } catch (error) {
    console.error("Pharmacy verification status error:", error)
    return NextResponse.json({ 
      error: "Failed to get verification status" 
    }, { status: 500 })
  }
}
