import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/service-areas - Get all service areas
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    const serviceAreas = await prisma.serviceArea.findMany({
      include: {
        polygon: true,
        gridCells: true,
      },
      orderBy: {
        priority: 'desc',
      },
    })

    return NextResponse.json({
      success: true,
      data: serviceAreas,
    })
  } catch (error) {
    console.error('Error fetching service areas:', error)
    return NextResponse.json(
      { error: 'Failed to fetch service areas' },
      { status: 500 }
    )
  }
}

// POST /api/service-areas - Create a new service area
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'RIDER') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, type, priority, polygon, gridCells, isGlobal, riderId } = body

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    // Validate rider-specific area
    if (!isGlobal && !riderId) {
      return NextResponse.json(
        { error: 'riderId is required for rider-specific service areas' },
        { status: 400 }
      )
    }

    // Create the service area
    const serviceArea = await prisma.serviceArea.create({
      data: {
        name,
        type: type.toUpperCase(),
        priority: priority || 1,
        isActive: true,
        isGlobal: isGlobal || false,
        riderId: isGlobal ? null : riderId,
      },
    })

    // Create polygon if provided
    if (type.toLowerCase() === 'polygon' && polygon) {
      await prisma.serviceAreaPolygon.create({
        data: {
          serviceAreaId: serviceArea.id,
          name: polygon.name || name,
          points: polygon.points,
          color: polygon.color || '#FF6B6B',
          serviceTypes: polygon.serviceTypes || ['courier', 'ride', 'delivery'],
          maxDistance: polygon.maxDistance,
        },
      })
    }

    // Create grid cells if provided
    if (type.toLowerCase() === 'grid' && gridCells && gridCells.length > 0) {
      const gridCellData = gridCells.map((cell: any) => ({
        serviceAreaId: serviceArea.id,
        cellId: cell.id,
        center: cell.center,
        size: cell.size,
        bounds: cell.bounds,
        serviceTypes: cell.serviceTypes || ['courier', 'ride', 'delivery'],
        maxDistance: cell.maxDistance,
      }))

      await prisma.serviceAreaGridCell.createMany({
        data: gridCellData,
      })
    }

    // Fetch the complete service area with relations
    const completeServiceArea = await prisma.serviceArea.findUnique({
      where: { id: serviceArea.id },
      include: {
        polygon: true,
        gridCells: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: completeServiceArea,
      message: 'Service area created successfully',
    })
  } catch (error) {
    console.error('Error creating service area:', error)
    return NextResponse.json(
      { error: 'Failed to create service area' },
      { status: 500 }
    )
  }
}
