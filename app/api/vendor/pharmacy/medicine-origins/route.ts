import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    // const user = await authenticateRequest(request)
    // if (!user || user.role !== "VENDOR") {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    // Get all active medicine origins
    const medicineOrigins = await prisma.medicineOrigin.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true
      },
      orderBy: { displayName: "asc" }
    })

    return NextResponse.json({
      success: true,
      medicineOrigins
    })
  } catch (error) {
    console.error("Get medicine origins error:", error)
    return NextResponse.json({ 
      error: "Failed to get medicine origins" 
    }, { status: 500 })
  }
}
