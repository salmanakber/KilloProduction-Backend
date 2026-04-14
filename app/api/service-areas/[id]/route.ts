import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'

// GET /api/service-areas/[id] - Get a specific service area
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    const serviceArea = await prisma.serviceArea.findUnique({
      where: { id: params.id },
      include: {
        polygon: true,
        gridCells: true,
      },
    })

    if (!serviceArea) {
      return NextResponse.json(
        { error: 'Service area not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: serviceArea,
    })
  } catch (error) {
    console.error('Error fetching service area:', error)
    return NextResponse.json(
      { error: 'Failed to fetch service area' },
      { status: 500 }
    )
  }
}

// PUT /api/service-areas/[id] - Update a service area
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, isActive, priority, polygon, gridCells } = body

    // Check if service area exists
    const existingServiceArea = await prisma.serviceArea.findUnique({
      where: { id: params.id },
    })

    if (!existingServiceArea) {
      return NextResponse.json(
        { error: 'Service area not found' },
        { status: 404 }
      )
    }

    // Update the service area
    const updatedServiceArea = await prisma.serviceArea.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(isActive !== undefined && { isActive }),
        ...(priority !== undefined && { priority }),
      },
    })

    // Update polygon if provided
    if (polygon) {
      await prisma.serviceAreaPolygon.upsert({
        where: { serviceAreaId: params.id },
        update: {
          name: polygon.name,
          points: polygon.points,
          color: polygon.color,
          serviceTypes: polygon.serviceTypes,
          maxDistance: polygon.maxDistance,
        },
        create: {
          serviceAreaId: params.id,
          name: polygon.name,
          points: polygon.points,
          color: polygon.color || '#FF6B6B',
          serviceTypes: polygon.serviceTypes || ['courier', 'ride', 'delivery'],
          maxDistance: polygon.maxDistance,
        },
      })
    }

    // Update grid cells if provided
    if (gridCells && gridCells.length > 0) {
      // Delete existing grid cells
      await prisma.serviceAreaGridCell.deleteMany({
        where: { serviceAreaId: params.id },
      })

      // Create new grid cells
      const gridCellData = gridCells.map((cell: any) => ({
        serviceAreaId: params.id,
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

    // Fetch the complete updated service area
    const completeServiceArea = await prisma.serviceArea.findUnique({
      where: { id: params.id },
      include: {
        polygon: true,
        gridCells: true,
      },
    })

    return NextResponse.json({
      success: true,
      data: completeServiceArea,
      message: 'Service area updated successfully',
    })
  } catch (error) {
    console.error('Error updating service area:', error)
    return NextResponse.json(
      { error: 'Failed to update service area' },
      { status: 500 }
    )
  }
}

// DELETE /api/service-areas/[id] - Delete a service area
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized - Admin access required' },
        { status: 401 }
      )
    }

    // Check if service area exists
    const existingServiceArea = await prisma.serviceArea.findUnique({
      where: { id: params.id },
    })

    if (!existingServiceArea) {
      return NextResponse.json(
        { error: 'Service area not found' },
        { status: 404 }
      )
    }

    // Delete the service area (cascade will handle related records)
    await prisma.serviceArea.delete({
      where: { id: params.id },
    })

    return NextResponse.json({
      success: true,
      message: 'Service area deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting service area:', error)
    return NextResponse.json(
      { error: 'Failed to delete service area' },
      { status: 500 }
    )
  }
}


