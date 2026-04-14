import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { cloudinary } from '@/lib/cloudinary'

export async function POST(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const imageFile = formData.get('image') as File

    if (!imageFile) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json({ 
        error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' 
      }, { status: 400 })
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (imageFile.size > maxSize) {
      return NextResponse.json({ 
        error: 'File too large. Maximum size is 5MB.' 
      }, { status: 400 })
    }

    // Convert file to buffer
    const bytes = await imageFile.arrayBuffer()
    const buffer = Buffer.from(bytes)

    // Upload to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'killo-super-app/profile-images',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ],
          public_id: `user-${session.id}-${Date.now()}`
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      ).end(buffer)
    })

    const uploadData = uploadResult as any

    // Update user profile with new image URL
    const updatedProfile = await prisma.userProfile.upsert({
      where: { userId: session.id },
      update: {
        profileImage: uploadData.secure_url,
      },
      create: {
        userId: session.id,
        profileImage: uploadData.secure_url,
      }
    })

    return NextResponse.json({
      success: true,
      profileImage: uploadData.secure_url,
      message: 'Profile image uploaded successfully'
    })

  } catch (error) {
    console.error('Error uploading profile image:', error)
    return NextResponse.json({ 
      error: 'Failed to upload profile image. Please try again.' 
    }, { status: 500 })
  }
}
