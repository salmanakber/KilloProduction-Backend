import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const module = searchParams.get("module") // FOOD, GROCERY, etc.

    const categories = await prisma.menuCategory.findMany({
      where: module ? { module } : {},
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
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

export async function POST(request: NextRequest) {
  try {
    const { name, description, parentId, module, sortOrder } = await request.json()

    if (!name || !module) {
      return NextResponse.json({ error: "Name and module are required" }, { status: 400 })
    }

    // Calculate level based on parent
    let level = 0
    if (parentId) {
      const parent = await prisma.menuCategory.findUnique({
        where: { id: parentId },
      })
      if (parent) {
        level = parent.level + 1
      }
    }

    const category = await prisma.menuCategory.create({
      data: {
        name,
        description,
        parentId,
        module,
        level,
        sortOrder: sortOrder || 0,
        isActive: true,
      },
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error("Menu category creation error:", error)
    return NextResponse.json({ error: "Failed to create menu category" }, { status: 500 })
  }
}
