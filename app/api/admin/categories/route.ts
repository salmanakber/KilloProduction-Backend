import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    // if (!user) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    // if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    //   return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    // }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const module = searchParams.get("module")
    const parentId = searchParams.get("parentId")
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    const where: any = {}

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ]
    }

    if (module && module !== "ALL") {
      where.module = module
    }

    if (parentId === "null" || parentId === "") {
      where.parentId = null
    } else if (parentId) {
      where.parentId = parentId
    }

    if (status && status !== "ALL") {
      where.isActive = status === "true"
    }

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
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
              module: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              children: true,
              products: true,
            },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.category.count({ where }),
    ])

    return NextResponse.json({
      categories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Categories fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { name, description, icon, image, parentId, module, sortOrder, isActive } = data

    if (!name || !module) {
      return NextResponse.json({ error: "Name and module are required" }, { status: 400 })
    }

    // Validate module enum
    const validModules = ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY", "RIDING", "COURIER", "WHOLESALER", "TEST"]
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
        module,
        sortOrder: sortOrder || 0,
        isActive: isActive !== undefined ? isActive : true,
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
  } catch (error: any) {
    console.error("Category creation error:", error)
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Category with this name already exists" }, { status: 400 })
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 })
  }
}

