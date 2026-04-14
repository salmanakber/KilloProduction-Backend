import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// PUT - Update restaurant-specific category
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Verify category belongs to this restaurant
    const existingCategory = await prisma.menuCategory.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, description, sortOrder, isActive } = body

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    if (isActive !== undefined) updateData.isActive = isActive

    const category = await prisma.menuCategory.update({
      where: { id: params.id },
      data: updateData,
    })

    return NextResponse.json(category)
  } catch (error) {
    console.error("Error updating category:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete restaurant-specific category
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get vendor's restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { userId: user.id },
    })

    if (!restaurant) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
    }

    // Verify category belongs to this restaurant
    const category = await prisma.menuCategory.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    // Check if category has menu items
    const itemCount = await prisma.menuItem.count({
      where: { categoryId: params.id },
    })

    if (itemCount > 0) {
      return NextResponse.json(
        { error: `Cannot deactivate ${category.name} category with ${itemCount} menu item(s). Please move or deactivate items first.` },
        { status: 400 }
      )
    }

    await prisma.menuCategory.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Category deleted successfully" })
  } catch (error) {
    console.error("Error deleting category:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
