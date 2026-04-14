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

// GET - Get categories for customer based on location and menu items
export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const userLat = parseFloat(searchParams.get('latitude') || '0')
    const userLon = parseFloat(searchParams.get('longitude') || '0')
    const maxDistance = parseFloat(searchParams.get('maxDistance') || '50') // km
    const search = searchParams.get('search') || '' // Search by category name
    const minItemCount = parseInt(searchParams.get('minItemCount') || '0') // Filter by minimum item count
    const minRestaurantCount = parseInt(searchParams.get('minRestaurantCount') || '0') // Filter by minimum restaurant count
    const sortBy = searchParams.get('sortBy') || 'itemCount' // Sort by: 'itemCount', 'restaurantCount', 'name'
    const sortOrder = searchParams.get('sortOrder') || 'desc' // 'asc' or 'desc'
    const limit = parseInt(searchParams.get('limit') || '50') // Limit results

    if (!userLat || !userLon) {
      return NextResponse.json({ 
        error: 'Location required',
        message: 'Please provide latitude and longitude'
      }, { status: 400 })
    }

    // Step 1: Get all restaurants within distance
    const allRestaurants = await prisma.restaurant.findMany({
      where: {
        isVerified: true,
      },
      include: {
        menuCategories: {
          select: {
            id: true,
            name: true,
            // @ts-ignore - templateId will exist after migration
            templateId: true,
          },
        },
        user: {
          include: {
            vendorProfile: {
              select: {
                latitude: true,
                longitude: true,
              }
            }
          }
        },
      },
    })

    // Filter restaurants by location
    const nearbyRestaurantIds = new Set<string>()
    const restaurantMenuCategories = new Map<string, Set<string>>() // restaurantId -> Set of MenuCategory names

    allRestaurants.forEach((restaurant: any) => {
      const lat = restaurant.latitude || restaurant.user?.vendorProfile?.latitude
      const lon = restaurant.longitude || restaurant.user?.vendorProfile?.longitude
      
      if (!lat || !lon) return

      const distance = calculateDistance(userLat, userLon, Number(lat), Number(lon))
      if (distance > maxDistance) return

      nearbyRestaurantIds.add(restaurant.id)
      
      // Store MenuCategory names for this restaurant
      const menuCatNames = new Set<string>()
      if (restaurant.menuCategories) {
        restaurant.menuCategories.forEach((menuCat: any) => {
          menuCatNames.add(menuCat.name)
        })
      }
      restaurantMenuCategories.set(restaurant.id, menuCatNames)
    })

    if (nearbyRestaurantIds.size === 0) {
      return NextResponse.json({ categories: [] })
    }

    // Step 2: Get all MenuCategories from nearby restaurants
    const menuCategories = await prisma.menuCategory.findMany({
      where: {
        restaurantId: { in: Array.from(nearbyRestaurantIds) },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        restaurantId: true,
        // @ts-ignore - templateId will exist after migration
        templateId: true,
      },
    })

    // Step 3: Get all parent Categories from Category model where module is FOOD
    // Apply search filter if provided
    const categoryWhere: any = {
      module: "FOOD",
      parentId: null, // Only parent categories
      isActive: true,
    }

    if (search) {
      categoryWhere.name = { contains: search, mode: 'insensitive' }
    }

    const parentCategories = await prisma.category.findMany({
      where: categoryWhere,
      include: {
        children: {
          where: {
            isActive: true,
          },
          select: {
            id: true,
            name: true,
            image: true,
            icon: true,
            description: true,
            // @ts-ignore - templateId will exist after migration
          },
        },
      },
      orderBy: [
        { sortOrder: "asc" },
        { name: "asc" }
      ],
    })

    // Step 4: Match Category names with MenuCategory names
    // For each parent Category, check if its name matches any MenuCategory name
    const categoryMap = new Map<string, {
      id: string
      name: string
      icon?: string
      image?: string
      description?: string
      restaurantCount: number
      itemCount: number
      childCategoryIds: string[]
    }>()

    for (const parentCategory of parentCategories) {
        // Check if this parent Category matches any MenuCategory by templateId or name
        const matchingMenuCategories = menuCategories.filter(
          // @ts-ignore - templateId will exist after migration
          menuCat => (menuCat.templateId && menuCat.templateId === parentCategory.id) || menuCat.name === parentCategory.name
        )
      
        if (matchingMenuCategories.length === 0) continue
      
        const restaurantIdsWithCategory = new Set(
          matchingMenuCategories.map(menuCat => menuCat.restaurantId)
        )
      
        const childCategoryIds = parentCategory.children.map(child => child.id)
      
        // Find child MenuCategories by templateId (more reliable than name matching)
        const matchingChildMenuCategories =
          await prisma.menuCategory.findMany({
            where: {
              restaurantId: { in: Array.from(restaurantIdsWithCategory) },
              // @ts-ignore - templateId will exist after migration
              templateId: { in: childCategoryIds }, // Match by templateId
              isActive: true,
            },
            include: {
              menuItems: {
                where: { isAvailable: true },
                select: { id: true },
              },
            },
          })
      
        const totalItemCount = matchingChildMenuCategories.reduce(
          (sum, menuCat: any) => sum + (menuCat.menuItems?.length || 0),
          0
        )
      
        // Apply filters
        if (totalItemCount >= minItemCount && restaurantIdsWithCategory.size >= minRestaurantCount) {
          categoryMap.set(parentCategory.id, {
            id: parentCategory.id,
            name: parentCategory.name,
            icon: parentCategory.icon || undefined,
            image: parentCategory.image || undefined,
            description: parentCategory.description || undefined,
            restaurantCount: restaurantIdsWithCategory.size,
            itemCount: totalItemCount,
            childCategoryIds,
          })
        }
      }
      

    // Step 5: Format and sort
    let categoriesWithDetails = Array.from(categoryMap.values())
    
    // Apply sorting
    categoriesWithDetails.sort((a, b) => {
      let comparison = 0
      
      switch (sortBy) {
        case 'itemCount':
          comparison = a.itemCount - b.itemCount
          break
        case 'restaurantCount':
          comparison = a.restaurantCount - b.restaurantCount
          break
        case 'name':
          comparison = a.name.localeCompare(b.name)
          break
        default:
          comparison = a.itemCount - b.itemCount
      }
      
      // Apply sort order
      return sortOrder === 'asc' ? comparison : -comparison
    })

    // Apply limit
    if (limit > 0) {
      categoriesWithDetails = categoriesWithDetails.slice(0, limit)
    }

    return NextResponse.json({
      categories: categoriesWithDetails,
      total: categoriesWithDetails.length,
      filters: {
        search,
        minItemCount,
        minRestaurantCount,
        sortBy,
        sortOrder,
      },
    })
  } catch (error) {
    console.error("Error fetching categories:", error)
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 })
  }
}
