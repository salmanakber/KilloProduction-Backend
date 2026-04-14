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
        await prisma.category.updateMany({
          where: { id: { in: categoryIds } },
          data: { isActive: true },
        })
        break

      case "DEACTIVATE":
        await prisma.category.updateMany({
          where: { id: { in: categoryIds } },
          data: { isActive: false },
        })
        break

      case "DELETE":
        // Check if any categories have children or products
        const categoriesToDelete = await prisma.category.findMany({
          where: { id: { in: categoryIds } },
          include: {
            _count: {
              select: {
                children: true,
                products: true,
              },
            },
          },
        })

        const categoriesWithDependencies = categoriesToDelete.filter(
          (cat) => cat._count.children > 0 || cat._count.products > 0
        )

        if (categoriesWithDependencies.length > 0) {
          return NextResponse.json(
            {
              error: "Some categories cannot be deleted because they have children or products",
              categories: categoriesWithDependencies.map((cat) => ({
                id: cat.id,
                name: cat.name,
                childrenCount: cat._count.children,
                productsCount: cat._count.products,
              })),
            },
            { status: 400 }
          )
        }

        await prisma.category.deleteMany({
          where: { id: { in: categoryIds } },
        })
        break

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({ message: `Successfully ${action.toLowerCase()}ed categories` })
  } catch (error) {
    console.error("Error performing bulk action:", error)
    return NextResponse.json({ error: "Failed to perform bulk action" }, { status: 500 })
  }
}

