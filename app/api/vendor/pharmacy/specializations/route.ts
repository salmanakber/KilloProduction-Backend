import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Return all available IllnessCategory values from database
    const illnessCategories = await prisma.illnessCategory.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true
      },
      orderBy: { displayName: 'asc' }
    })

    return NextResponse.json({
      success: true,
      illnesses: illnessCategories
    })
  } catch (error) {
    console.error("Get specializations error:", error)
    return NextResponse.json({ 
      error: "Failed to get specializations" 
    }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    if (!pharmacy.isApprovedByAdmin) {
      return NextResponse.json({ error: "Pharmacy must be approved before setting specializations" }, { status: 403 })
    }

    const { illnessTypes } = await request.json()

    if (!Array.isArray(illnessTypes) || illnessTypes.length === 0) {
      return NextResponse.json({ error: "At least one illness type must be selected" }, { status: 400 })
    }

    // Get pharmacy's specializations
    const existingSpecializations = await prisma.pharmacySpecialization.findMany({
      where: { pharmacyId: pharmacy.id },
    })

    // Update illness types for existing specializations
    const specializations = await Promise.all(
      existingSpecializations.map((spec) =>
        prisma.pharmacySpecialization.update({
          where: { id: spec.id },
          data: {
            illnessTypes,
          },
        }),
      ),
    )

    return NextResponse.json({
      message: "Specializations updated successfully",
      specializations,
    })
  } catch (error) {
    console.error("Pharmacy specializations update error:", error)
    return NextResponse.json({ error: "Failed to update specializations" }, { status: 500 })
  }
}
