import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            module: true,
          },
        },
        children: {
          select: {
            id: true,
            name: true,
            description: true,
            icon: true,
            image: true,
            sortOrder: true,
            isActive: true,
            _count: {
              select: {
                children: true,
                products: true,
              },
            },
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        },
        _count: {
          select: {
            children: true,
            products: true,
          },
        },
      },
    })

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    return NextResponse.json(category)
  } catch (error) {
    console.error("Category fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch category" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { name, description, icon, image, parentId, module, sortOrder, isActive } = data

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id: params.id },
    })

    if (!existingCategory) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    // Prevent circular references
    if (parentId === params.id) {
      return NextResponse.json({ error: "Category cannot be its own parent" }, { status: 400 })
    }

    // If parentId is provided, validate it exists and belongs to the same module
    if (parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: parentId },
      })

      if (!parent) {
        return NextResponse.json({ error: "Parent category not found" }, { status: 400 })
      }

      const targetModule = module || existingCategory.module
      if (parent.module !== targetModule) {
        return NextResponse.json({ error: "Parent category must belong to the same module" }, { status: 400 })
      }

      // Check for circular reference in hierarchy
      const checkCircular = async (categoryId: string, targetParentId: string): Promise<boolean> => {
        const category = await prisma.category.findUnique({
          where: { id: categoryId },
          select: { parentId: true },
        })
        if (!category || !category.parentId) return false
        if (category.parentId === targetParentId) return true
        return checkCircular(category.parentId, targetParentId)
      }

      if (await checkCircular(parentId, params.id)) {
        return NextResponse.json({ error: "Circular reference detected in category hierarchy" }, { status: 400 })
      }
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (icon !== undefined) updateData.icon = icon
    if (image !== undefined) updateData.image = image
    if (parentId !== undefined) updateData.parentId = parentId || null
    if (module !== undefined) updateData.module = module
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder
    if (isActive !== undefined) updateData.isActive = isActive

    const category = await prisma.category.update({
      where: { id: params.id },
      data: updateData,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            children: true,
            products: true,
          },
        },
      },
    })

    return NextResponse.json(category)
  } catch (error: any) {
    console.error("Category update error:", error)
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Category with this name already exists" }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        _count: {
          select: {
            children: true,
            products: true,
          },
        },
      },
    })

    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 })
    }

    // Check if category has children or products
    if (category._count.children > 0) {
      return NextResponse.json(
        { error: "Cannot delete category with child categories. Please delete or move children first." },
        { status: 400 }
      )
    }

    if (category._count.products > 0) {
      return NextResponse.json(
        { error: "Cannot delete category with products. Please remove or reassign products first." },
        { status: 400 }
      )
    }

    await prisma.category.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ message: "Category deleted successfully" })
  } catch (error) {
    console.error("Category deletion error:", error)
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 })
  }
}

