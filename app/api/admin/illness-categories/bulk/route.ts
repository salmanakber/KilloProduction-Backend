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

    const { action, categoryIds } = await request.json()

    if (!action || !categoryIds || !Array.isArray(categoryIds)) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 })
    }

    switch (action) {
      case "ACTIVATE":
        await prisma.illnessCategory.updateMany({
          where: { id: { in: categoryIds } },
          data: { isActive: true },
        })
        break

      case "DEACTIVATE":
        await prisma.illnessCategory.updateMany({
          where: { id: { in: categoryIds } },
          data: { isActive: false },
        })
        break

      case "DELETE":
        await prisma.illnessCategory.deleteMany({
          where: { id: { in: categoryIds } },
        })
        break

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ message: `Successfully ${action.toLowerCase()}ed illness categories` })
  } catch (error) {
    console.error("Error performing bulk action:", error)
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 })
  }
} 