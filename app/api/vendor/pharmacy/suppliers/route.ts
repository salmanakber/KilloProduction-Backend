import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    // Check if pharmacy is verified
    if (!pharmacy.isVerified) {
      return NextResponse.json({ 
        error: "Pharmacy account must be verified before accessing suppliers",
        code: "VERIFICATION_REQUIRED"
      }, { status: 403 })
    }

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url)
    const city = searchParams.get('city')
    const sortBy = searchParams.get('sortBy') || 'rating' // rating, price, recent
    const pharmacyId = pharmacy.id

    // Build where clause
    const where: any = {
      isVerified: true,
    }

    // Filter by city if provided
    if (city) {
      where.address = {
        contains: city,
        mode: 'insensitive',
      }
    }

    // Get available wholesalers with reviews and order history
    const wholesalers = await prisma.wholesaler.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        wholesalerProducts: {
          take: 5, // Sample products
          select: {
            name: true,
            category: true,
            unitPrice: true,
            countryOfOrigin: true,
          },
        },
        supplierOrders: {
          where: {
            pharmacyId: pharmacyId,
            status: {
              in: ['DELIVERED'],
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          take: 1,
          select: {
            createdAt: true,
          },
        },
        _count: {
          select: {
            wholesalerProducts: true,
            supplierOrders: {
              where: {
                pharmacyId: pharmacyId,
              },
            },
          },
        },
      },
    })

    // Get reviews for each wholesaler
    const wholesalersWithReviews = await Promise.all(
      wholesalers.map(async (wholesaler) => {
        // Get reviews for this wholesaler (targetId is the wholesaler's userId)
        const reviews = await prisma.review.aggregate({
          where: {
            targetId: wholesaler.userId,
            targetType: 'WHOLESALER',
          },
          _avg: {
            rating: true,
          },
          _count: {
            id: true,
          },
        })

        // Calculate average product price
        const avgPrice = await prisma.wholesalerProduct.aggregate({
          where: {
            wholesalerId: wholesaler.id,
            isActive: true,
          },
          _avg: {
            unitPrice: true,
          },
        })

        return {
          ...wholesaler,
          reviewRating: reviews._avg.rating || wholesaler.rating || 0,
          reviewCount: reviews._count.id || 0,
          averagePrice: avgPrice._avg.unitPrice || 0,
          lastOrderDate: wholesaler.supplierOrders[0]?.createdAt || null,
          totalOrdersWithPharmacy: wholesaler._count.supplierOrders,
        }
      })
    )

    // Sort wholesalers based on sortBy parameter
    let sortedWholesalers = [...wholesalersWithReviews]
    if (sortBy === 'rating') {
      sortedWholesalers.sort((a, b) => b.reviewRating - a.reviewRating)
    } else if (sortBy === 'price') {
      sortedWholesalers.sort((a, b) => a.averagePrice - b.averagePrice)
    } else if (sortBy === 'recent') {
      sortedWholesalers.sort((a, b) => {
        const dateA = a.lastOrderDate ? new Date(a.lastOrderDate).getTime() : 0
        const dateB = b.lastOrderDate ? new Date(b.lastOrderDate).getTime() : 0
        return dateB - dateA
      })
    }

    // Extract unique cities for filter dropdown
    const allWholesalers = await prisma.wholesaler.findMany({
      where: {
        isVerified: true,
      },
      select: {
        address: true,
      },
    })

    const cities = Array.from(
      new Set(
        allWholesalers
          .map((w) => {
            // Extract city from address (assuming format: "Street, City, State")
            const parts = w.address?.split(',').map((p) => p.trim())
            return parts && parts.length > 1 ? parts[parts.length - 2] : null
          })
          .filter((city): city is string => city !== null)
      )
    ).sort()

    return NextResponse.json({
      wholesalers: sortedWholesalers,
      cities,
    })
  } catch (error) {
    console.error("Suppliers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch suppliers" }, { status: 500 })
  }
}
