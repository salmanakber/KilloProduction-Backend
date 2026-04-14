import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { validateFoodMenuItemPublish } from "@/lib/menuItemPublish"

export async function GET(
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

    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!menuItem) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 })
    }

    return NextResponse.json(menuItem)
  } catch (error) {
    console.error("Error fetching menu item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    // Verify menu item belongs to this restaurant
    const existingMenuItem = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!existingMenuItem) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 })
    }

    const body = await request.json()
    const {
      name,
      description,
      price,
      compareAtPrice,
      categoryId,
      preparationTime,
      calories,
      ingredients,
      allergens,
      spiceLevel,
      images,
      variants,
      addOns,
      isVegetarian,
      isVegan,
      isGlutenFree,
      isAvailable,
      isFeatured,
      isPopular,
      tags,
    } = body

    const nextAvailable = isAvailable !== undefined ? isAvailable : existingMenuItem.isAvailable
    const nextCategoryId =
      categoryId !== undefined ? categoryId || null : existingMenuItem.categoryId
    const publishErr = await validateFoodMenuItemPublish(restaurant.id, nextCategoryId, nextAvailable)
    if (publishErr) {
      return NextResponse.json({ error: publishErr }, { status: 400 })
    }

    const updatedMenuItem = await prisma.menuItem.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(price !== undefined && { price }),
        ...(compareAtPrice !== undefined && { compareAtPrice }),
        ...(categoryId !== undefined && { categoryId: categoryId || null }),
        ...(preparationTime !== undefined && { preparationTime }),
        ...(calories !== undefined && { calories }),
        ...(ingredients !== undefined && { ingredients }),
        ...(allergens !== undefined && { allergens }),
        ...(spiceLevel !== undefined && { spiceLevel }),
        ...(images !== undefined && { images }),
        ...(variants !== undefined && { variants }),
        ...(addOns !== undefined && { addOns }),
        ...(isVegetarian !== undefined && { isVegetarian }),
        ...(isVegan !== undefined && { isVegan }),
        ...(isGlutenFree !== undefined && { isGlutenFree }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(isFeatured !== undefined && { isFeatured }),
        ...(isPopular !== undefined && { isPopular }),
        ...(tags !== undefined && { tags }),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json(updatedMenuItem)
  } catch (error) {
    console.error("Error updating menu item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

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

    // Verify menu item belongs to this restaurant
    const menuItem = await prisma.menuItem.findFirst({
      where: {
        id: params.id,
        restaurantId: restaurant.id,
      },
    })

    if (!menuItem) {
      return NextResponse.json({ error: "Menu item not found" }, { status: 404 })
    }

    await prisma.menuItem.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Menu item deleted successfully" })
  } catch (error) {
    console.error("Error deleting menu item:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
