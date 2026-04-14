import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Pharmacy access required" }, { status: 403 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
    })

    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const data = await request.json()
    const { medicineRequests, notes } = data

    if (!medicineRequests || medicineRequests.length === 0) {
      return NextResponse.json({ error: "Medicine requests are required" }, { status: 400 })
    }

    // Find best wholesalers for each medicine using intelligent matching
    const matchedOrders = await findBestWholesalers(medicineRequests, pharmacy)

    if (matchedOrders.length === 0) {
      return NextResponse.json({ error: "No wholesalers found for requested medicines" }, { status: 404 })
    }

    // Create supplier orders for each wholesaler
    const createdOrders = []

    for (const orderData of matchedOrders) {
      const orderNumber = `WO${Date.now()}${Math.floor(Math.random() * 1000)}`

      const supplierOrder = await prisma.supplierOrder.create({
        data: {
          pharmacyId: pharmacy.id,
          wholesalerId: orderData.wholesalerId,
          orderNumber,
          totalAmount: orderData.totalAmount,
          notes,
          items: {
            create: orderData.items.map((item) => ({
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
            })),
          },
        },
        include: {
          items: true,
          wholesaler: {
            select: {
              companyName: true,
              phone: true,
              email: true,
            },
          },
        },
      })

      createdOrders.push(supplierOrder)

      // Notify wholesaler
      await prisma.notification.create({
        data: {
          userId: orderData.wholesalerUserId,
          title: "New Supplier Order",
          message: `New order from ${pharmacy.pharmacyName} - Order #${orderNumber}`,
          type: "ORDER_UPDATE",
          module: "PHARMACY",
          data: { orderId: supplierOrder.id },
        },
      })
    }

    return NextResponse.json(
      {
        message: "Orders placed successfully",
        orders: createdOrders,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Wholesaler order error:", error)
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 })
  }
}

// Intelligent wholesaler matching algorithm
async function findBestWholesalers(medicineRequests: any[], pharmacy: any) {
  const matchedOrders = []

  // Group requests by medicine to find best wholesaler for each
  for (const request of medicineRequests) {
    const { centralMedicineId, quantity } = request

    // Find wholesalers who have this medicine
    const availableWholesalers = await prisma.wholesalerMedicine.findMany({
      where: {
        centralMedicineId,
        isAvailable: true,
        stock: { gte: quantity },
      },
      include: {
        wholesaler: {
          include: {
            user: { select: { id: true } },
          },
        },
        centralMedicine: {
          select: { name: true },
        },
      },
    })

    if (availableWholesalers.length === 0) continue

    // Score wholesalers based on multiple factors
    const scoredWholesalers = availableWholesalers.map((wm) => {
      let score = 0

      // Base score for verified wholesaler
      if (wm.wholesaler.isVerified) score += 20

      // Price competitiveness (lower price = higher score)
      const avgPrice = availableWholesalers.reduce((sum, w) => sum + w.unitPrice, 0) / availableWholesalers.length
      if (wm.unitPrice < avgPrice) score += 15
      else if (wm.unitPrice > avgPrice * 1.2) score -= 10

      // Stock availability bonus
      if (wm.stock > quantity * 2) score += 10
      else if (wm.stock < quantity * 1.5) score -= 5

      // Delivery zone bonus
      if (wm.wholesaler.deliveryZones.includes(pharmacy.address)) score += 15

      // Rating bonus
      score += wm.wholesaler.rating * 2

      // Fair rotation - give new/less active wholesalers a chance
      if (wm.wholesaler.totalOrders < 10) score += 5

      return {
        ...wm,
        matchScore: score,
      }
    })

    // Sort by score and select best wholesaler
    scoredWholesalers.sort((a, b) => b.matchScore - a.matchScore)
    const bestWholesaler = scoredWholesalers[0]

    // Check if we already have an order for this wholesaler
    const existingOrder = matchedOrders.find((order) => order.wholesalerId === bestWholesaler.wholesaler.id)

    if (existingOrder) {
      // Add to existing order
      existingOrder.items.push({
        productId: bestWholesaler.centralMedicineId,
        productName: bestWholesaler.centralMedicine.name,
        quantity,
        unitPrice: bestWholesaler.unitPrice,
        totalPrice: quantity * bestWholesaler.unitPrice,
      })
      existingOrder.totalAmount += quantity * bestWholesaler.unitPrice
    } else {
      // Create new order for this wholesaler
      matchedOrders.push({
        wholesalerId: bestWholesaler.wholesaler.id,
        wholesalerUserId: bestWholesaler.wholesaler.user.id,
        items: [
          {
            productId: bestWholesaler.centralMedicineId,
            productName: bestWholesaler.centralMedicine.name,
            quantity,
            unitPrice: bestWholesaler.unitPrice,
            totalPrice: quantity * bestWholesaler.unitPrice,
          },
        ],
        totalAmount: quantity * bestWholesaler.unitPrice,
      })
    }
  }

  return matchedOrders
}
