import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"
import { sendEmail } from "@/lib/email"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
            createdAt: true,
          },
        },
        wholesalerProducts: {
          include: {
            _count: {
              select: {
                supplierOrderItems: true,
              },
            },
          },
        },
        supplierOrders: {
          include: {
            pharmacy: {
              select: {
                companyName: true,
              },
            },
            items: true,
          },
        },
        _count: {
          select: {
            wholesalerProducts: true,
            supplierOrders: true,
          },
        },
      },
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    return NextResponse.json({ wholesaler })
  } catch (error) {
    console.error("Wholesaler fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wholesaler" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      companyName,
      licenseNumber,
      description,
      address,
      phone,
      email,
      website,
      specialties,
      deliveryZones,
      paymentTerms,
    } = body

    // Check if wholesaler exists
    const existingWholesaler = await prisma.wholesaler.findUnique({
      where: { id: params.id },
      include: { user: true },
    })

    if (!existingWholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Check if license number is being changed and if it already exists
    if (licenseNumber && licenseNumber !== existingWholesaler.licenseNumber) {
      const existingLicense = await prisma.wholesaler.findUnique({
        where: { licenseNumber },
      })
      if (existingLicense) {
        return NextResponse.json(
          { error: "License number already exists" },
          { status: 400 }
        )
      }
    }

    // Check if email is being changed and if it already exists
    if (email && email !== existingWholesaler.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      })
      if (existingUser) {
        return NextResponse.json(
          { error: "Email already registered" },
          { status: 400 }
        )
      }
    }

    // Update wholesaler and user in a transaction
    const updatedWholesaler = await prisma.$transaction(async (tx) => {
      // Update user if email changed
      if (email && email !== existingWholesaler.email) {
        await tx.user.update({
          where: { id: existingWholesaler.userId },
          data: { email },
        })
      }

      // Update wholesaler
      return await tx.wholesaler.update({
        where: { id: params.id },
        data: {
          companyName: companyName || existingWholesaler.companyName,
          licenseNumber: licenseNumber || existingWholesaler.licenseNumber,
          description: description !== undefined ? description : existingWholesaler.description,
          address: address || existingWholesaler.address,
          phone: phone || existingWholesaler.phone,
          email: email || existingWholesaler.email,
          website: website !== undefined ? website : existingWholesaler.website,
          specialties: specialties || existingWholesaler.specialties,
          deliveryZones: deliveryZones || existingWholesaler.deliveryZones,
          paymentTerms: paymentTerms || existingWholesaler.paymentTerms,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              wholesalerProducts: true,
              supplierOrders: true,
            },
          },
        },
      })
    })

    return NextResponse.json({
      message: "Wholesaler updated successfully",
      wholesaler: updatedWholesaler,
    })
  } catch (error) {
    console.error("Wholesaler update error:", error)
    return NextResponse.json(
      { error: "Failed to update wholesaler" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if wholesaler exists
    const existingWholesaler = await prisma.wholesaler.findUnique({
      where: { id: params.id },
      include: { user: true },
    })

    if (!existingWholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Check if wholesaler has active orders
    const activeOrders = await prisma.supplierOrder.findMany({
      where: {
        wholesalerId: params.id,
        status: { in: ["PENDING", "CONFIRMED", "SHIPPED"] },
      },
    })

    if (activeOrders.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete wholesaler with active orders" },
        { status: 400 }
      )
    }

    // Delete wholesaler and user in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete wholesaler (this will cascade to related records)
      await tx.wholesaler.delete({
        where: { id: params.id },
      })

      // Delete user
      await tx.user.delete({
        where: { id: existingWholesaler.userId },
      })
    })

    // Send notification email
    try {
      await sendEmail(existingWholesaler.email, "genericNotification", {
        title: "Your Killo Wholesaler Account Has Been Deactivated",
        message: `Dear ${existingWholesaler.companyName},

Your wholesaler account has been deactivated by our administration team. If you believe this was done in error, please contact our support team immediately.

Thank you for your understanding.`,
        email: existingWholesaler.email,
        adminContact: process.env.ADMIN_EMAIL || "admin@killo.com"
      })
    } catch (emailError) {
      console.error("Failed to send deactivation email:", emailError)
    }

    return NextResponse.json({
      message: "Wholesaler deleted successfully",
    })
  } catch (error) {
    console.error("Wholesaler deletion error:", error)
    return NextResponse.json(
      { error: "Failed to delete wholesaler" },
      { status: 500 }
    )
  }
}
