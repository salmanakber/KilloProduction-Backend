import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { action, medicineIds } = await request.json()

    if (!action || !medicineIds || !Array.isArray(medicineIds)) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    switch (action) {
      case "ACTIVATE":
        await prisma.centralMedicine.updateMany({
          where: { id: { in: medicineIds } },
          data: { isActive: true },
        })
        break

      case "DEACTIVATE":
        await prisma.centralMedicine.updateMany({
          where: { id: { in: medicineIds } },
          data: { isActive: false },
        })
        break

      case "DELETE":
        await prisma.centralMedicine.deleteMany({
          where: { id: { in: medicineIds } },
        })
        break

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ message: `Successfully ${action.toLowerCase()}ed medicines` })
  } catch (error) {
    console.error("Error performing bulk action:", error)
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 })
  }
} 