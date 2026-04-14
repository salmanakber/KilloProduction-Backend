import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

// Haversine formula to calculate distance between two points
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = R * c
  return distance
}

// GET - Get all items in a category, filtered by location
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50') // km
    const search = searchParams.get('search') || '' // Search items by name
    const minPrice = parseFloat(searchParams.get('minPrice') || '0')
    const maxPrice = parseFloat(searchParams.get('maxPrice') || '999999')
    const sortBy = searchParams.get('sortBy') || 'distance' // 'distance', 'price', 'rating', 'name'
    const sortOrder = searchParams.get('sortOrder') || 'asc' // 'asc' or 'desc'
    const limit = parseInt(searchParams.get('limit') || '50')
    const page = parseInt(searchParams.get('page') || '1')

    if (!userLat || !userLon) {
      return NextResponse.json({ 
        error: 'Location required',
        message: 'Please provide latitude and longitude'
      }, { status: 400 })
    }

    // Find the category template - check if it's a parent or child category
    const categoryTemplate = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        children: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
          },
        },
        parent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (!categoryTemplate) {
      return NextResponse.json({ 
        error: 'Category not found',
        message: 'The specified category does not exist'
      }, { status: 404 })
    }

    // Determine if this is a parent or child category
    const isParentCategory = !categoryTemplate.parentId
    const categoryIdsToMatch = isParentCategory 
      ? [params.id, ...categoryTemplate.children.map(child => child.id)] // Parent + all children
      : [params.id] // Just the child category

    // Get all menu categories that match this template (by templateId or fallback to name)
    const whereClause: any = {
      isActive: true,
    }

    // Try to match by templateId first (new logic)
    // @ts-ignore - templateId will exist after migration
    whereClause.OR = [
      { templateId: { in: categoryIdsToMatch } }, // Match by templateId
      ...(isParentCategory 
        ? [] 
        : [{ name: categoryTemplate.name }] // Fallback to name matching for backward compatibility
      )
    ]

    const menuCategories = await prisma.menuCategory.findMany({
      where: whereClause,
      include: {
        restaurant: {
          include: {
            user: {
              include: {
                vendorProfile: {
                  select: {
                    latitude: true,
                    longitude: true,
                  }
                }
              }
            }
          },
        },
        menuItems: {
          where: {
            isAvailable: true,
            ...(search ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            } : {}),
            price: {
              gte: minPrice,
              lte: maxPrice,
            },
          },
          include: {
            restaurant: {
              include: {
                user: {
                  include: {
                    vendorProfile: {
                      select: {
                        latitude: true,
                        longitude: true,
                      }
                    }
                  }
                }
              },
            },
          },
        },
      },
    })

    // Filter by location and flatten items
    const itemsWithLocation: any[] = []

    menuCategories.forEach((menuCat: any) => {
      const restaurant = menuCat.restaurant
      const lat = restaurant.latitude || restaurant.user?.vendorProfile?.latitude
      const lon = restaurant.longitude || restaurant.user?.vendorProfile?.longitude
      
      if (!lat || !lon) return

      const distance = calculateDistance(userLat, userLon, Number(lat), Number(lon))
      if (distance > maxDistance) return

      menuCat.menuItems.forEach((item: any) => {
        itemsWithLocation.push({
          ...item,
          restaurant: {
            ...restaurant,
            distance: parseFloat(distance.toFixed(2)),
          },
        })
      })
    })

    // Apply sorting
    itemsWithLocation.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'distance':
          comparison = a.restaurant.distance - b.restaurant.distance
          break
        case 'price':
          comparison = a.price - b.price
          break
        case 'rating':
          comparison = (b.restaurant.rating || 0) - (a.restaurant.rating || 0)
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        default:
          // Default: distance first, then rating
          if (Math.abs(a.restaurant.distance - b.restaurant.distance) > 1) {
            comparison = a.restaurant.distance - b.restaurant.distance
          } else {
            comparison = (b.restaurant.rating || 0) - (a.restaurant.rating || 0)
          }
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })

    // Pagination
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedItems = limit > 0 
      ? itemsWithLocation.slice(startIndex, endIndex)
      : itemsWithLocation

    return NextResponse.json({
      category: {
        id: categoryTemplate.id,
        name: categoryTemplate.name,
        description: categoryTemplate.description || undefined,
        icon: categoryTemplate.icon || undefined,
        image: categoryTemplate.image || undefined,
        isParent: isParentCategory,
        parentId: categoryTemplate.parentId || undefined,
      },
      items: paginatedItems,
      total: itemsWithLocation.length,
      page,
      limit: limit > 0 ? limit : itemsWithLocation.length,
      totalPages: limit > 0 ? Math.ceil(itemsWithLocation.length / limit) : 1,
      filters: {
        search,
        minPrice,
        maxPrice,
        sortBy,
        sortOrder,
      },
    })
  } catch (error) {
    console.error("Error fetching category items:", error)
    return NextResponse.json({ error: "Failed to fetch category items" }, { status: 500 })
  }
}
