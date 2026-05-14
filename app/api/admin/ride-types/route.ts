import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { VehicleType, RideTypeCategory } from "@prisma/client"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get all ride types
    const rideTypes = await prisma.rideType.findMany({
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' }
      ]
    })

    return NextResponse.json({ rideTypes })
  } catch (error) {
    console.error("Error fetching ride types:", error)
    return NextResponse.json({ error: "Failed to fetch ride types" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.name || !data.basePrice || !data.pricePerKm) {
      return NextResponse.json({ 
        error: "Name, base price, and price per km are required" 
      }, { status: 400 })
    }

    // Validate vehicle type if provided
    if (data.vehicleType && !Object.values(VehicleType).includes(data.vehicleType)) {
      return NextResponse.json({ 
        error: `Invalid vehicle type: ${data.vehicleType}` 
      }, { status: 400 })
    }

    // Validate category if provided
    if (data.category && !Object.values(RideTypeCategory).includes(data.category)) {
      return NextResponse.json({ 
        error: `Invalid category: ${data.category}` 
      }, { status: 400 })
    }

    // Prepare weight ranges for courier category
    const weightRanges = data.category === RideTypeCategory.COURIER && data.weightRanges 
      ? data.weightRanges 
      : null

    const mediaType = String(data.mediaType || "ICON").toUpperCase()
    const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : ""
    if (!["ICON", "IMAGE"].includes(mediaType)) {
      return NextResponse.json({
        error: "Invalid media type. Use ICON or IMAGE",
      }, { status: 400 })
    }

    // Prepare create data
    const createData: any = {
      name: data.name,
      description: data.description || null,
      icon: data.icon || "🚗",
      mediaType,
      imageUrl: mediaType === "IMAGE" ? imageUrl || null : null,
      basePrice: parseFloat(data.basePrice),
      pricePerKm: parseFloat(data.pricePerKm),
      pricePerMinute: parseFloat(data.pricePerMinute) || 0,
      waitingGraceMinutes: Math.max(0, Math.floor(Number(data.waitingGraceMinutes) || 0)),
      waitingPricePerMinute: Math.max(0, parseFloat(data.waitingPricePerMinute) || 0),
      capacity: data.capacity || "1-4 passengers",
      features: data.features || [],
      weightRanges: weightRanges || null,
      vehicleType: data.vehicleType || null,
      category: data.category || RideTypeCategory.RIDE,
      isActive: data.isActive !== undefined ? data.isActive : true,
    }

    // Only set pricePerKg if no weight ranges are provided
    if (data.category === RideTypeCategory.COURIER && !weightRanges) {
      createData.pricePerKg = parseFloat(data.pricePerKg || '0')
    } else {
      createData.pricePerKg = 0
    }

    // Create new ride type
    const rideType = await prisma.rideType.create({
      data: createData
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "CREATE_RIDE_TYPE",
        entityType: "RIDE_TYPE",
        entityId: rideType.id,
        details: {
          rideType: data,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Ride type created successfully",
      rideType,
    })
  } catch (error) {
    console.error("Error creating ride type:", error)
    return NextResponse.json({ error: "Failed to create ride type" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    if (!data.id || !data.name || !data.basePrice || !data.pricePerKm) {
      return NextResponse.json({ 
        error: "ID, name, base price, and price per km are required" 
      }, { status: 400 })
    }

    // Validate vehicle type if provided
    if (data.vehicleType && !Object.values(VehicleType).includes(data.vehicleType)) {
      return NextResponse.json({ 
        error: `Invalid vehicle type: ${data.vehicleType}` 
      }, { status: 400 })
    }

    // Validate category if provided
    if (data.category && !Object.values(RideTypeCategory).includes(data.category)) {
      return NextResponse.json({ 
        error: `Invalid category: ${data.category}` 
      }, { status: 400 })
    }

    // Prepare weight ranges for courier category
    const weightRanges = data.category === RideTypeCategory.COURIER && data.weightRanges 
      ? data.weightRanges 
      : null

    const mediaType = String(data.mediaType || "ICON").toUpperCase()
    const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : ""
    if (!["ICON", "IMAGE"].includes(mediaType)) {
      return NextResponse.json({
        error: "Invalid media type. Use ICON or IMAGE",
      }, { status: 400 })
    }

    // Prepare update data
    const updateData: any = {
      name: data.name,
      description: data.description || null,
      icon: data.icon || "🚗",
      mediaType,
      imageUrl: mediaType === "IMAGE" ? imageUrl || null : null,
      basePrice: parseFloat(data.basePrice),
      pricePerKm: parseFloat(data.pricePerKm),
      pricePerMinute: parseFloat(data.pricePerMinute) || 0,
      waitingGraceMinutes: Math.max(0, Math.floor(Number(data.waitingGraceMinutes) || 0)),
      waitingPricePerMinute: Math.max(0, parseFloat(data.waitingPricePerMinute) || 0),
      capacity: data.capacity || "1-4 passengers",
      features: data.features || [],
      weightRanges: weightRanges || null,
      vehicleType: data.vehicleType || null,
      category: data.category || RideTypeCategory.RIDE,
      isActive: data.isActive !== undefined ? data.isActive : true,
    }

    // Only set pricePerKg if no weight ranges are provided
    if (data.category === RideTypeCategory.COURIER && !weightRanges) {
      updateData.pricePerKg = parseFloat(data.pricePerKg || '0')
    } else {
      updateData.pricePerKg = 0
    }

    // Update ride type
    const updatedRideType = await prisma.rideType.update({
      where: { id: data.id },
      data: updateData
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "UPDATE_RIDE_TYPE",
        entityType: "RIDE_TYPE",
        entityId: data.id,
        details: {
          changes: data,
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Ride type updated successfully",
      rideType: updatedRideType,
    })
  } catch (error) {
    console.error("Error updating ride type:", error)
    return NextResponse.json({ error: "Failed to update ride type" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: "Ride type ID is required" }, { status: 400 })
    }

    // Check if ride type is being used in any bookings
    const existingBookings = await prisma.rideBooking.findFirst({
      where: { rideTypeId: id }
    })

    if (existingBookings) {
      return NextResponse.json({ 
        error: "Cannot delete ride type. It is being used in existing bookings." 
      }, { status: 400 })
    }

    // Delete ride type
    await prisma.rideType.delete({
      where: { id }
    })

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "DELETE_RIDE_TYPE",
        entityType: "RIDE_TYPE",
        entityId: id,
        details: {
          deletedAt: new Date(),
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "Ride type deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting ride type:", error)
    return NextResponse.json({ error: "Failed to delete ride type" }, { status: 500 })
  }
}

