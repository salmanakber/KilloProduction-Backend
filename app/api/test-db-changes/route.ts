import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { action, model } = await request.json()

    let result: any = null

    switch (action) {
      case 'create_courier_booking':
        // Create a test courier booking
        result = await prisma.courierBooking.create({
          data: {
            bookingNumber: `TEST-CB-${Date.now()}`,
            customerId: user.id,
            rideTypeId: 'test-ride-type',
            pickupAddress: 'Test Pickup Address',
            pickupLatitude: 24.8567,
            pickupLongitude: 67.0011,
            dropAddress: 'Test Drop Address',
            dropLatitude: 24.8667,
            dropLongitude: 67.0111,
            distance: 5.5,
            fare: 15.50,
            estimatedTime: 20,
            packageType: 'Test Package',
            packageWeight: 2.5,
            isFragile: false,
            recipientName: 'Test Recipient',
            recipientPhone: '+1234567890',
            notes: 'This is a test courier booking',
            status: 'REQUESTED',
          },
          include: {
            customer: {
              select: {
                name: true,
                phone: true,
                email: true
              }
            }
          }
        })
        break

      case 'create_ride_booking':
        // Create a test ride booking
        result = await prisma.rideBooking.create({
          data: {
            bookingNumber: `TEST-RB-${Date.now()}`,
            customerId: user.id,
            rideTypeId: 'test-ride-type',
            pickupAddress: 'Test Pickup Address',
            pickupLatitude: 24.8567,
            pickupLongitude: 67.0011,
            dropAddress: 'Test Drop Address',
            dropLatitude: 24.8667,
            dropLongitude: 67.0111,
            distance: 8.2,
            estimatedFare: 25.75,
            estimatedTime: 30,
            passengerCount: 2,
            specialRequests: 'Test ride request',
            status: 'REQUESTED',
            rideType: 'EXTERNAL',
          },
          include: {
            customer: {
              select: {
                name: true,
                phone: true,
                email: true
              }
            }
          }
        })
        break

      case 'update_booking_status':
        // Update a booking status
        const bookingId = await request.json().then(data => data.bookingId)
        if (!bookingId) {
          return NextResponse.json({ error: "Booking ID required" }, { status: 400 })
        }

        result = await prisma.courierBooking.update({
          where: { id: bookingId },
          data: { status: 'BIDDING' },
          include: {
            customer: {
              select: {
                name: true,
                phone: true,
                email: true
              }
            }
          }
        })
        break

      case 'delete_booking':
        // Delete a booking
        const deleteBookingId = await request.json().then(data => data.bookingId)
        if (!deleteBookingId) {
          return NextResponse.json({ error: "Booking ID required" }, { status: 400 })
        }

        result = await prisma.courierBooking.delete({
          where: { id: deleteBookingId }
        })
        break

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      action,
      result,
      message: `Test ${action} completed successfully`
    })

  } catch (error) {
    console.error('Error in test database changes:', error)
    return NextResponse.json({ 
      error: 'Failed to execute test database change',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Get some test data
    const courierBookings = await prisma.courierBooking.findMany({
      where: {
        bookingNumber: {
          startsWith: 'TEST-'
        }
      },
      take: 5,
      orderBy: {
        createdAt: 'desc'
      }
    })

    const rideBookings = await prisma.rideBooking.findMany({
      where: {
        bookingNumber: {
          startsWith: 'TEST-'
        }
      },
      take: 5,
      orderBy: {
        createdAt: 'desc'
      }
    })

    return NextResponse.json({
      success: true,
      testData: {
        courierBookings,
        rideBookings
      },
      message: 'Test data retrieved successfully'
    })

  } catch (error) {
    console.error('Error getting test data:', error)
    return NextResponse.json({ 
      error: 'Failed to get test data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
