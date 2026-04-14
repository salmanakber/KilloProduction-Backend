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

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: session.id },
      include: {
        user: {
          include: {
            userProfile: true,
            userSettings: true
          }
        }
      }
    })

    if (!pharmacy) {
      return NextResponse.json({ error: 'Pharmacy not found' }, { status: 404 })
    }

    return NextResponse.json(pharmacy)
  } catch (error) {
    console.error('Error fetching pharmacy profile:', error)
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
      
      const logo = formData.get('logo') as File | null
      const coverImage = formData.get('coverImage') as File | null

      if (logo) {
        try {
          console.log('📤 Uploading logo to Cloudinary...')
          const logoBuffer = Buffer.from(await logo.arrayBuffer())
          const logoBase64 = logoBuffer.toString('base64')
          
          const uploadResult = await cloudinary.uploader.upload(
            `data:${logo.type};base64,${logoBase64}`,
            {
              folder: 'pharmacy_logos',
              resource_type: 'image',
              transformation: [
                { width: 300, height: 300, crop: 'fill' }
              ]
            }
          )
          
          updateData.logo = uploadResult.secure_url
          hasImageUpload = true
          console.log('✅ Logo uploaded:', uploadResult.secure_url)
        } catch (uploadError) {
          console.error('Logo upload error:', uploadError)
          throw new Error('Failed to upload logo')
        }
      }

      if (coverImage) {
        try {
          console.log('📤 Uploading cover image to Cloudinary...')
          const coverBuffer = Buffer.from(await coverImage.arrayBuffer())
          const coverBase64 = coverBuffer.toString('base64')
          
          const uploadResult = await cloudinary.uploader.upload(
            `data:${coverImage.type};base64,${coverBase64}`,
            {
              folder: 'pharmacy_covers',
              resource_type: 'image',
              transformation: [
                { width: 1200, height: 600, crop: 'fill' }
              ]
            }
          )
          
          updateData.coverImage = uploadResult.secure_url
          hasImageUpload = true
          console.log('✅ Cover image uploaded:', uploadResult.secure_url)
        } catch (uploadError) {
          console.error('Cover upload error:', uploadError)
          throw new Error('Failed to upload cover image')
        }
      }
    } else {
      // Handle JSON (for regular updates)
      const body = await request.json()
      const { 
        pharmacyName, 
        description,
        email,
        phone, 
        address,
        website,
        latitude,
        longitude,
        openingHours,
        is24Hours
      } = body

      console.log('📝 Updating pharmacy profile with:', body)

      if (pharmacyName !== undefined) updateData.pharmacyName = pharmacyName
      if (description !== undefined) updateData.description = description
      if (email !== undefined) updateData.email = email
      if (phone !== undefined) updateData.phone = phone
      if (address !== undefined) updateData.address = address
      if (website !== undefined) updateData.website = website
      if (latitude !== undefined) updateData.lat = parseFloat(latitude)
      if (longitude !== undefined) updateData.lon = parseFloat(longitude)
      if (openingHours !== undefined) updateData.openingHours = openingHours
      if (is24Hours !== undefined) updateData.is24Hours = is24Hours
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No data provided to update' }, { status: 400 })
    }

    console.log('💾 Updating pharmacy with data:', updateData)

    const updatedPharmacy = await prisma.pharmacy.update({
      where: { userId: session.id },
      data: updateData
    })

    console.log('✅ Pharmacy updated successfully')

    // Return only the updated fields for image uploads
    if (hasImageUpload) {
      return NextResponse.json({
        logo: updatedPharmacy.logo,
        coverImage: updatedPharmacy.coverImage
      })
    }

    return NextResponse.json(updatedPharmacy)
  } catch (error: any) {
    console.error('❌ Error updating pharmacy profile:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error' 
    }, { status: 500 })
  }
}

