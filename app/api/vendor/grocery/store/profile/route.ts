import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { cloudinary } from '@/lib/cloudinary'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const store = await prisma.groceryStore.findUnique({
      where: { userId: session.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true
          }
        }
      }
    })

    if (!store) {
      return NextResponse.json({ error: 'Grocery store not found' }, { status: 404 })
    }

    return NextResponse.json(store)
  } catch (error) {
    console.error('Error fetching grocery store profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type')
    let updateData: any = {}
    let hasImageUpload = false

    if (contentType && contentType.includes('multipart/form-data')) {
      // Handle FormData (for image uploads)
      const formData = await request.formData()
      
      const logoFile = formData.get('logo') as File | null
      const coverImageFile = formData.get('coverImage') as File | null

      if (logoFile && logoFile.size > 0) {
        hasImageUpload = true
        const imageBuffer = Buffer.from(await logoFile.arrayBuffer())
        const imageBase64 = imageBuffer.toString('base64')
        
        const uploadResult = await cloudinary.uploader.upload(
          `data:${logoFile.type};base64,${imageBase64}`,
          {
            folder: 'grocery/stores/logos',
            resource_type: 'image',
            transformation: [
              { quality: 'auto', fetch_format: 'auto' },
              { width: 400, height: 400, crop: 'limit' }
            ]
          }
        )
        
        updateData.logo = uploadResult.secure_url
      }

      if (coverImageFile && coverImageFile.size > 0) {
        hasImageUpload = true
        const imageBuffer = Buffer.from(await coverImageFile.arrayBuffer())
        const imageBase64 = imageBuffer.toString('base64')
        
        const uploadResult = await cloudinary.uploader.upload(
          `data:${coverImageFile.type};base64,${imageBase64}`,
          {
            folder: 'grocery/stores/covers',
            resource_type: 'image',
            transformation: [
              { quality: 'auto', fetch_format: 'auto' },
              { width: 1200, height: 600, crop: 'limit' }
            ]
          }
        )
        
        updateData.coverImage = uploadResult.secure_url
      }

      const ohRaw = formData.get("openingHours")
      if (typeof ohRaw === "string" && ohRaw.length > 0) {
        try {
          updateData.openingHours = JSON.parse(ohRaw)
        } catch {
          /* ignore */
        }
      }
      const pcRaw = formData.get("productCategories")
      if (typeof pcRaw === "string" && pcRaw.length > 0) {
        try {
          updateData.productCategories = JSON.parse(pcRaw)
        } catch {
          /* ignore */
        }
      }
    } else {
      // Handle JSON (for regular updates)
      const body = await request.json()
      const { 
        storeName, 
        description,
        email,
        phone, 
        address,
        website,
        latitude,
        longitude,
        deliveryFee,
        minOrderAmount,
        maxDeliveryDistance,
        isOpen,
        storeType,
        productCategories,
        openingHours,
      } = body

      console.log('📝 Updating grocery store profile with:', body)

      if (storeName !== undefined) updateData.storeName = storeName
      if (description !== undefined) updateData.description = description
      if (email !== undefined) updateData.email = email
      if (phone !== undefined) updateData.phone = phone
      if (address !== undefined) updateData.address = address
      if (website !== undefined) updateData.website = website
      if (latitude !== undefined) updateData.latitude = latitude ? parseFloat(latitude.toString()) : null
      if (longitude !== undefined) updateData.longitude = longitude ? parseFloat(longitude.toString()) : null
      if (deliveryFee !== undefined) updateData.deliveryFee = deliveryFee ? parseFloat(deliveryFee.toString()) : 0
      if (minOrderAmount !== undefined) updateData.minOrderAmount = minOrderAmount ? parseFloat(minOrderAmount.toString()) : 0
      if (maxDeliveryDistance !== undefined) updateData.maxDeliveryDistance = maxDeliveryDistance ? parseFloat(maxDeliveryDistance.toString()) : 10
      if (isOpen !== undefined) updateData.isOpen = isOpen
      if (storeType !== undefined) updateData.storeType = storeType
      if (productCategories !== undefined) updateData.productCategories = productCategories
      if (openingHours !== undefined) updateData.openingHours = openingHours
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 })
    }

    console.log('💾 Updating grocery store with data:', updateData)

    const updatedStore = await prisma.groceryStore.update({
      where: { userId: session.id },
      data: updateData,
    })

    console.log('✅ Grocery store updated successfully')

    // Return only the updated fields for image uploads
    if (hasImageUpload) {
      return NextResponse.json({
        logo: updatedStore.logo,
        coverImage: updatedStore.coverImage
      })
    }

    return NextResponse.json(updatedStore)
  } catch (error: any) {
    console.error('❌ Error updating grocery store profile:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}
