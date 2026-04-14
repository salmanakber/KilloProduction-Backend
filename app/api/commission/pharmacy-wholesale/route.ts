import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { CommissionType, Module } from "@prisma/client"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { orderAmount, deliveryFee = 0, orderId, pharmacyId, wholesalerId, module, commissionType } = data


    // Validate required fields
    if (!orderAmount || orderAmount <= 0) {
      return NextResponse.json({ 
        error: "Invalid order amount" 
      }, { status: 400 })
    }

    if (!pharmacyId) {
      return NextResponse.json({ 
        error: "Pharmacy ID is required" 
      }, { status: 400 })
    }

    // Validate pharmacy exists
    const pharmacyExists = await prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { id: true, userId: true }
    })
    
    if (!pharmacyExists) {
      return NextResponse.json({ 
        error: "Pharmacy not found" 
      }, { status: 404 })
    }

    // Validate that the user is a vendor
    const userExists = await prisma.user.findUnique({
      where: { id: pharmacyExists.userId },
      select: { id: true, role: true }
    })

    if (!userExists || userExists.role !== "VENDOR") {
      return NextResponse.json({ 
        error: "Invalid pharmacy ID - user is not a vendor" 
      }, { status: 400 })
    }

    // Validate wholesaler if provided
    if (wholesalerId) {
      const wholesalerExists = await prisma.wholesaler.findUnique({
        where: { id: wholesalerId },
        select: { id: true, userId: true }
      })

      if (!wholesalerExists) {
        return NextResponse.json({ 
          error: "Wholesaler not found" 
        }, { status: 404 })
      }
      
      // Validate that the user is a wholesaler
      const wholesalerUserExists = await prisma.user.findUnique({
        where: { id: wholesalerExists.userId },
        select: { id: true, role: true }
      })

      if (!wholesalerUserExists || wholesalerUserExists.role !== "WHOLESALER") {
        return NextResponse.json({ 
          error: "Invalid wholesaler ID - user is not a wholesaler" 
        }, { status: 400 })
      }
    }

    // Calculate order amount excluding delivery fee
    const orderAmountExcludingDelivery = orderAmount - deliveryFee

    if (orderAmountExcludingDelivery <= 0) {
      return NextResponse.json({ 
        error: "Order amount after excluding delivery fee must be greater than 0" 
      }, { status: 400 })
    }

    // Get commission setting for PHARMACY module and WHOLESALE_ORDER type
    const commissionSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module: module as unknown as Module,
          commissionType: commissionType as CommissionType,
        },
        isActive: true,
      },
    })

    if (!commissionSetting) {
      return NextResponse.json({ 
        error: `Commission setting not found for ${module} ${commissionType}`,
        details: "Please configure commission settings for pharmacy wholesale orders"
      }, { status: 404 })
    }
    

    // Calculate commission amount based on order amount (excluding delivery fee)
    let commissionAmount = (orderAmountExcludingDelivery * commissionSetting.rate) / 100

    // Apply min/max limits
    if (commissionSetting.minAmount && commissionAmount < commissionSetting.minAmount) {
      commissionAmount = commissionSetting.minAmount
    }

    if (commissionSetting.maxAmount && commissionAmount > commissionSetting.maxAmount) {
      commissionAmount = commissionSetting.maxAmount
    }

    // Create commission record
    let commissionRecord: any = null
    if (pharmacyId) {
      try {
        // If orderId is provided, verify that the supplier order exists
        if (orderId) {
          const supplierOrderExists = await prisma.supplierOrder.findUnique({
            where: { id: orderId },
            select: { id: true }
          })

          if (!supplierOrderExists) {
            return NextResponse.json({ 
              error: "Supplier order not found",
              details: `Supplier order with ID ${orderId} does not exist`
            }, { status: 404 })
          }
        }
        
        // console.log("orderId", orderId)
        // console.log("pharmacyId", pharmacyId)

        
        // commissionRecord = await prisma.vendorCommission.create({
        //   data: {
        //     vendorId: pharmacyExists.userId,
        //     module: module as unknown as Module,
        //     commissionType: commissionType as unknown as CommissionType,
        //     orderAmount: orderAmountExcludingDelivery,
        //     commissionRate: commissionSetting.rate,
        //     commissionAmount,
        //     status: "PENDING",
        //   },
        // })
      } catch (error) {
        console.error("Error creating commission record:", error)
        return NextResponse.json({ 
          error: "Failed to create commission record",
          details: error instanceof Error ? error.message : "Unknown error"
        }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        orderAmount: orderAmountExcludingDelivery,
        deliveryFee,
        totalOrderAmount: orderAmount,
        commissionRate: commissionSetting.rate,
        commissionAmount,
        minAmount: commissionSetting.minAmount,
        maxAmount: commissionSetting.maxAmount,
        finalAmount: orderAmountExcludingDelivery + commissionAmount,
        commissionRecord: commissionRecord ? {
          id: commissionRecord.id,
          status: commissionRecord.status,
          createdAt: commissionRecord.createdAt,
        } : null,
        validation: {
          pharmacyId,
          wholesalerId: wholesalerId || null,
          supplierOrderId: orderId || null,
          supplierOrderExists: orderId ? true : null,
        }
      },
      message: "Commission calculated successfully",
    })
  } catch (error) {
    console.error("Pharmacy wholesale commission calculation error:", error)
    return NextResponse.json({ 
      error: "Failed to calculate commission",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const module = request.nextUrl.searchParams.get('module')
    const commissionType = request.nextUrl.searchParams.get('commissionType')

    if (!module || !commissionType) {
      return NextResponse.json({ error: "Module and commission type are required" }, { status: 400 })
    }    console.log('Module:', module)
    console.log('Commission type:', commissionType)
    if (!module || !commissionType) {
      return NextResponse.json({ error: "Module and commission type are required" }, { status: 400 })
    }

    // Get commission setting for PHARMACY module and WHOLESALE_ORDER type
    const commissionSetting = await prisma.commissionSetting.findUnique({
      where: {
        module_commissionType: {
          module: module as Module,
          commissionType: commissionType as CommissionType,
        },
        isActive: true,
      },
    })

    if (!commissionSetting) {
      return NextResponse.json({ 
        error: `Commission setting not found for ${module} ${commissionType}`
      }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        module: module as Module,
        commissionType: commissionType as CommissionType,
        rate: commissionSetting.rate,
        minAmount: commissionSetting.minAmount,
        maxAmount: commissionSetting.maxAmount,
        description: commissionSetting.description,
        isActive: commissionSetting.isActive,
      },
    })
  } catch (error) {
    console.error(`Error fetching ${module} commission setting:`, error)
    return NextResponse.json({ 
      error: "Failed to fetch commission setting",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
