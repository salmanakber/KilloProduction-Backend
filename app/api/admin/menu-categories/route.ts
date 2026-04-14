import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - Fetch menu category templates (admin-controlled categories for FOOD module)
// These are templates that vendors can use when creating their restaurant-specific categories
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const module = searchParams.get("module") || "FOOD" // Default to FOOD

    // Use the Category model for admin-controlled category templates
    const categories = await prisma.category.findMany({
      where: {
        module: module as any,
        isActive: true,
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" }
      ],
      include: {
        _count: {
          select: {
            children: true,
          },
        },
      },
    })

    return NextResponse.json(categories)
  } catch (error) {
    console.error("Menu categories fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch menu categories" }, { status: 500 })
  }
}

// POST - Create admin-controlled menu category template
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { name, description, parentId, module, sortOrder, icon, image } = await request.json()

    if (!name || !module) {
      return NextResponse.json({ error: "Name and module are required" }, { status: 400 })
    }

    // Validate module
    const validModules = ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY", "RIDING", "COURIER", "WHOLESALER"]
    if (!validModules.includes(module)) {
      return NextResponse.json({ error: "Invalid module" }, { status: 400 })
    }

    // If parentId is provided, validate it exists and belongs to the same module
    if (parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: parentId },
      })

      if (!parent) {
        return NextResponse.json({ error: "Parent category not found" }, { status: 400 })
      }

      if (parent.module !== module) {
        return NextResponse.json({ error: "Parent category must belong to the same module" }, { status: 400 })
      }
    }

    const category = await prisma.category.create({
      data: {
        name,
        description,
        icon,
        image,
        parentId: parentId || null,
        module: module as any,
        sortOrder: sortOrder || 0,
        isActive: true,
      },
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

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error("Menu category creation error:", error)
    return NextResponse.json({ error: "Failed to create menu category" }, { status: 500 })
  }
}
