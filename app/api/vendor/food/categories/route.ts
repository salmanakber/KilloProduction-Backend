import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// GET - Get categories for vendor's restaurant
// Returns both restaurant-specific categories and admin template categories
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const includeTemplates = searchParams.get("includeTemplates") === "true"
    

    // Get restaurant-specific categories
    const restaurantCategories = await prisma.menuCategory.findMany({
        where: {
          restaurantId: restaurant.id,
          isActive: true,
        },
        orderBy: [
          { sortOrder: "asc" },
          { name: "asc" },
        ],
        select: {
          id: true,
          name: true,
          description: true,
          templateId: true,
          sortOrder: true,
          isActive: true,
          restaurantId: true,
          _count: {
            select: {
              menuItems: true,
            },
          },
        },
      })
      

    // For each menuCategory, find its child categories from Category model
    // Match MenuCategory to parent Category by name, then find children
    const categoriesWithChildren = await Promise.all(
      restaurantCategories.map(async (menuCat) => {
        let children: any[] = []
        
        // Find the parent Category in the Category model that matches this MenuCategory name
        const parentCategory = await prisma.category.findFirst({
          where: {
            name: menuCat.name,
            module: "FOOD",
            parentId: null, // Only root categories
            isActive: true,
          },
        })
        
        // If a matching parent Category is found (by templateId or name), get its children
        if (parentCategory) {
          children = await prisma.category.findMany({
            where: {
              parentId: parentCategory.id,
              module: "FOOD",
              isActive: true,
            },
            orderBy: [
              { sortOrder: "asc" },
              { name: "asc" }
            ],
          })
          
          // Check if any child MenuCategories exist with matching templateId
          // and include them in the children array
          const childMenuCategories = await prisma.menuCategory.findMany({
            where: {
              restaurantId: restaurant.id,
              templateId: { in: children.map(c => c.id) },
              isActive: true,
            },
            select: {
              id: true,
              name: true,
              templateId: true,
            },
          })
          
          // Merge: use MenuCategory if exists, otherwise use Category template
          children = children.map(childCategory => {
            const matchingMenuCategory = childMenuCategories.find(
              mc => mc.templateId === childCategory.id
            )
            return {
              id: matchingMenuCategory?.id || childCategory.id,
              name: matchingMenuCategory?.name || childCategory.name,
              description: childCategory.description,
              parentId: childCategory.parentId,
              templateId: childCategory.id, // Always use Category ID as templateId
              level: 1, // Child level
            }
          })
        }
        
        return {
          ...menuCat,
          children: children.map(child => ({
            id: child.id,
            name: child.name,
            description: child.description,
            parentId: child.parentId,
            templateId: child.id, // Use the Category ID as templateId for reference
            level: 1, // Child level
          })),
        }
      })
    )

    // Optionally include admin template categories (from Category model) with parent/child relationships
    let templateCategories: any[] = []
    if (includeTemplates) {
      // Fetch root categories first (parentId is null) with children
      templateCategories = await prisma.category.findMany({
        where: {
          module: "FOOD",
          isActive: true,
          parentId: null, // Only root categories
        },
        orderBy: [
          { sortOrder: "asc" },
          { name: "asc" }
        ],
        include: {
          children: {
            where: {
              isActive: true,
            },
            orderBy: [
              { sortOrder: "asc" },
              { name: "asc" }
            ],
          },
          _count: {
            select: {
              children: true,
              products: true,
            },
          },
        },
      })
    }

    return NextResponse.json({
      categories: categoriesWithChildren, // Now includes child categories
      templates: templateCategories, // Admin-controlled templates vendors can use
    })
  } catch (error) {
    console.error("Error fetching categories:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create restaurant-specific category (optionally from admin template)
export async function POST(request: NextRequest) {
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

    const body = await request.json()
    const { name, description, sortOrder, templateId } = body

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // If templateId is provided, copy name/description from admin template
    let categoryData: any = {
      restaurantId: restaurant.id,
      name,
      description,
      sortOrder: sortOrder || 0,
      isActive: true,
      templateId: templateId || null, // Save templateId to link to Category template
    }

    if (templateId) {
      const template = await prisma.category.findUnique({
        where: { id: templateId },
      })
      if (template && template.module === "FOOD") {
        // Use template data but allow vendor to override
        categoryData.name = name || template.name
        categoryData.description = description || template.description || null
      }
    }

    const category = await prisma.menuCategory.create({
      data: categoryData,
    })

    return NextResponse.json(category, { status: 201 })
  } catch (error) {
    console.error("Error creating category:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
