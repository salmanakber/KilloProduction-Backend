import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const addresses = await prisma.address.findMany({
      where: { userId: session.id },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ],
    })

    return NextResponse.json({
      success: true,
      data: addresses,
    })
  } catch (error) {
    console.error('Error fetching addresses:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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
      address,
    } = body

    // Validate required fields
    
    
    if (!type || !street || !city || !state || !country || !postalCode) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // If this is set as default, unset other default addresses
    if (isDefault) {
      await prisma.address.updateMany({
        where: { userId: session.id },
        data: { isDefault: false },
      })
    }

    const addressData = await prisma.address.create({
      data: {
        userId: session.id,
        type,
        title ,
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
      message: 'Address created successfully',
      data: address,
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating address:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
