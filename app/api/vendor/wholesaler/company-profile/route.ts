import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    const body = await request.json()
    const { address, latitude, longitude } = body

    // Validate required fields
    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      )
    }

    // Update wholesaler address and coordinates
    const updateData: any = {
      address: address.trim(),
    }

    // Add coordinates if provided
    if (latitude !== undefined && longitude !== undefined) {
      updateData.latitude = parseFloat(latitude.toString())
      updateData.longitude = parseFloat(longitude.toString())
    }

    const updatedWholesaler = await prisma.wholesaler.update({
      where: { id: wholesaler.id },
      data: updateData,
      select: {
        id: true,
        address: true,
        latitude: true,
        longitude: true,
        companyName: true,
      }
    })

    return NextResponse.json({
      success: true,
      message: "Company address updated successfully",
      wholesaler: updatedWholesaler,
    })
  } catch (error: any) {
    console.error("Wholesaler company profile update error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update company address" },
      { status: 500 }
    )
  }
}
