import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { cloudinary } from '@/lib/cloudinary'

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== 'WHOLESALER' as any) {
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
          folder: 'killo-super-app/wholesaler/profile-images',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto', fetch_format: 'auto' }
          ],
          public_id: `wholesaler-${user.id}-${Date.now()}`
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      ).end(buffer)
    })

    const uploadData = uploadResult as any
    const imageUrl = uploadData.secure_url

    // Update user avatar
    await prisma.user.update({
      where: { id: user.id },
      data: { avatar: imageUrl }
    })

    // Update or create user profile with new image URL
    await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        profileImage: imageUrl,
      },
      create: {
        userId: user.id,
        profileImage: imageUrl,
      }
    })

    return NextResponse.json({
      success: true,
      profileImage: imageUrl,
      message: 'Profile image uploaded successfully'
    })

  } catch (error) {
    console.error('Error uploading profile image:', error)
    return NextResponse.json({ 
      error: 'Failed to upload profile image. Please try again.' 
    }, { status: 500 })
  }
}
