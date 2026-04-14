import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Cloudinary
    const uploadResponse = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'profile_images',
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill' },
            { quality: 'auto' }
          ]
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      ).end(buffer)
    })

    const imageUrl = uploadResponse.secure_url

    // Update user avatar in database
    await prisma.user.update({
      where: { id: session.id },
      data: { avatar: imageUrl },
    })

    // Also update UserProfile profileImage if exists
    await prisma.userProfile.upsert({
      where: { userId: session.id },
      update: { profileImage: imageUrl },
      create: {
        userId: session.id,
        profileImage: imageUrl,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Profile image uploaded successfully',
      imageUrl,
    })
  } catch (error) {
    console.error('Error uploading profile image:', error)
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    )
  }
}

