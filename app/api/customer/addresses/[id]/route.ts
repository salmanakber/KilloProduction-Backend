import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params
    const body = await request.json()
    const {
      type,
      title,
      street,
      city,
      state,
      country,
      postalCode,
      latitude,
      longitude,
      isDefault,
      instructions,
    } = body

    // Check if address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId: session.id },
    })

    if (!existingAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: session.id, id: { not: id } },
        data: { isDefault: false },
      })
    }

    const address = await prisma.address.update({
      where: { id },
      data: {
        type,
        title,
        street,
        city,
        state,
        country,
        postalCode,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        isDefault: isDefault || false,
        instructions,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Address updated successfully',
      data: address,
    })
  } catch (error) {
    console.error('Error updating address:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Check if address belongs to user
    const existingAddress = await prisma.address.findFirst({
      where: { id, userId: session.id },
    })

    if (!existingAddress) {
      return NextResponse.json({ error: 'Address not found' }, { status: 404 })
    }

    await prisma.address.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: 'Address deleted successfully',
    })
  } catch (error) {
    console.error('Error deleting address:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
