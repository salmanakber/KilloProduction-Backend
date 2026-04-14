import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/rider/service-areas - Get service areas for riders
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'RIDER') {
      return NextResponse.json(
        { error: 'Unauthorized - Rider access required' },
        { status: 401 }
      )
    }

    // Get service areas: global areas + rider's personal areas
    const serviceAreas = await prisma.serviceArea.findMany({
      where: {
        isActive: true,
        OR: [
          { isGlobal: true }, // Global service areas available to all riders
          { riderId: user.id } // Rider's personal service areas
        ]
      },
      include: {
        polygon: true,
        gridCells: {
          where: {
            isActive: true,
          },
        },
      },
      orderBy: [
        { isGlobal: 'desc' }, // Global areas first
        { priority: 'desc' },
      ],
    })

    // Transform the data to match the frontend interface
    const transformedServiceAreas = serviceAreas.map(area => ({
      id: area.id,
      name: area.name,
      type: area.type.toLowerCase(),
      isActive: area.isActive,
      priority: area.priority,
      isGlobal: area.isGlobal,
      riderId: area.riderId,
      polygon: area.polygon ? {
        id: area.polygon.id,
        name: area.polygon.name,
        points: area.polygon.points,
        color: area.polygon.color,
        isActive: area.polygon.isActive,
        serviceTypes: area.polygon.serviceTypes,
        maxDistance: area.polygon.maxDistance,
      } : undefined,
      gridCells: area.gridCells.map(cell => ({
        id: cell.id,
        center: cell.center,
        size: cell.size,
        bounds: cell.bounds,
        isActive: cell.isActive,
        serviceTypes: cell.serviceTypes,
        maxDistance: cell.maxDistance,
      })),
    }))

    return NextResponse.json({
      success: true,
      data: transformedServiceAreas,
    })
  } catch (error) {
    console.error('Error fetching service areas for rider:', error)
    return NextResponse.json(
      { error: 'Failed to fetch service areas' },
      { status: 500 }
    )
  }
}

// POST /api/rider/service-areas - Create a new service area for the rider
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'RIDER') {
      return NextResponse.json(
        { error: 'Unauthorized - Rider access required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, type, priority, polygon, gridCells } = body

    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      )
    }

    // Create the service area for this specific rider
    const serviceArea = await prisma.serviceArea.create({
      data: {
        name,
        type: type.toUpperCase(),
        priority: priority || 1,
        isActive: true,
        isGlobal: false, // Always false for rider-created areas
        riderId: user.id, // Associate with the authenticated rider
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