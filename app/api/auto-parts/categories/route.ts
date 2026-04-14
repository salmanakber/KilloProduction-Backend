import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const includeCount = searchParams.get('includeCount') === 'true'

    // Get categories from Category model where module is AUTO_PARTS and isActive is TRUE
    const categories = await prisma.category.findMany({
      where: {
        module: 'AUTO_PARTS',
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    })

    // Define category icons mapping (fallback if category doesn't have icon)
    const iconMap: Record<string, string> = {
      'brakes': 'disc',
      'engine': 'settings',
      'suspension': 'move',
      'electrical': 'zap',
      'body': 'square',
      'transmission': 'repeat',
      'exhaust': 'wind',
      'cooling': 'droplet',
      'fuel': 'fuel',
      'ignition': 'sparkles',
      'tires': 'circle',
      'interior': 'grid',
    }

    // Format categories with icons
    const formattedCategories = categories.map(category => {
      const categoryNameLower = category.name.toLowerCase()

      return {
        id: category.id,
        name: category.name,
        category: category.name,
        icon: category.icon,
        image: category.image,
        description: category.description || `${category.name} parts`,
      }
    })

    // If includeCount is true, add part counts from Product model
    if (includeCount) {
      const categoriesWithCount = await Promise.all(
        formattedCategories.map(async (category) => {
          const count = await prisma.product.count({
            where: {
              type: 'AUTO_PART',
              categoryId: category.id,
              isActive: true,
              stockQuantity: { gt: 0 }
            }
          })

          return {
            ...category,
            partsCount: count,
          }
        })
      )

      // Sort by count (most popular first)
      categoriesWithCount.sort((a, b) => b.partsCount - a.partsCount)

      return NextResponse.json({
        categories: categoriesWithCount,
      })
    }

    return NextResponse.json({
      categories: formattedCategories,
    })
  } catch (error) {
    console.error("Categories fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}

