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

    // Check and create user profile if it doesn't exist
    let userProfile = await prisma.userProfile.findUnique({
      where: { userId: session.id },
    })

    if (!userProfile) {
      try {
        userProfile = await prisma.userProfile.create({
          data: {
            userId: session.id,
            firstName: session.name?.split(' ')[0] || 'User',
            lastName: session.name?.split(' ').slice(1).join(' ') || '',
            dateOfBirth: null,
            gender: null,
            bio: null,
            profileImage: null,
            emergencyContact: null,
          },
        })
        console.log('✅ Created user profile for user:', session.id)
      } catch (error) {
        console.error('❌ Error creating user profile:', error)
        return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
      }
    }

    // Check and create user settings if they don't exist
    let userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.id },
    })

    if (!userSettings) {
      try {
        userSettings = await prisma.userSettings.create({
          data: {
            userId: session.id,
            // Default settings
            language: 'en',
            currency: 'NGN',
            theme: 'light',
            pushNotifications: true,
            emailNotifications: true,
            smsNotifications: false,
            locationTracking: true,
            dataSharing: false,
            autoReorder: false,
            deliveryInstructions: null,
            deviceTokens: null,
          },
        })
        console.log('✅ Created user settings for user:', session.id)
      } catch (error) {
        console.error('❌ Error creating user settings:', error)
        // Continue with default settings
        userSettings = {
          id: 'temp',
          userId: session.id,
          pushNotifications: true,
          emailNotifications: true,
          smsNotifications: false,
          locationTracking: true,
          dataSharing: false,
          language: 'en',
          currency: 'NGN',
          theme: 'light',
          autoReorder: false,
          deliveryInstructions: null,
          deviceTokens: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }

    // Check and create wallet if it doesn't exist
    let wallet = await prisma.wallet.findUnique({
      where: { userId: session.id },
    })

    if (!wallet) {
      try {
        wallet = await prisma.wallet.create({
          data: {
            userId: session.id,
            balance: 0,
            currency: 'NGN',
            isActive: true
          },
        })
        console.log('✅ Created wallet for user:', session.id)
      } catch (error) {
        console.error('❌ Error creating wallet:', error)
        // Continue with default wallet
        wallet = {
          id: 'temp',
          userId: session.id,
          balance: 0,
          currency: 'NGN',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    }

    // Check and create pharmacy if it doesn't exist
    let pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: session.id },
    })

    if (!pharmacy) {
      try {
        pharmacy = await prisma.pharmacy.create({
          data: {
            userId: session.id,
            pharmacyName: session.name ? `${session.name}'s Pharmacy` : 'My Pharmacy',
            licenseNumber: `PHAR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            description: 'Pharmacy description',
            address: 'Pharmacy address',
            phone: session.phone || '',
            email: session.email || '',
            isVerified: false,
            is24Hours: false,
            deliveryAvailable: true,
            rating: 0,
            totalReviews: 0,
            totalOrders: 0,
            openingHours: {
              monday: { open: '08:00', close: '18:00', isOpen: true },
              tuesday: { open: '08:00', close: '18:00', isOpen: true },
              wednesday: { open: '08:00', close: '18:00', isOpen: true },
              thursday: { open: '08:00', close: '18:00', isOpen: true },
              friday: { open: '08:00', close: '18:00', isOpen: true },
              saturday: { open: '09:00', close: '17:00', isOpen: true },
              sunday: { open: '10:00', close: '16:00', isOpen: false }
            },
            specialties: ['General Pharmacy', 'Prescription Medicine'],
            medicineOrigins: ['Local', 'International'],
            selectedIllnesses: ['General Health', 'Pain Management'],
            responseTime: 30,
            status: 'PENDING'
          },
        })
        console.log('✅ Created pharmacy for user:', session.id)
      } catch (error) {
        console.error('❌ Error creating pharmacy:', error)
        return NextResponse.json({ error: 'Failed to create pharmacy profile' }, { status: 500 })
      }
    }

    // Now fetch the complete profile with all related data
    const completeUserProfile = await prisma.userProfile.findUnique({
      where: { userId: session.id },
      include: {
        user: {
          include: {
            pharmacy: true
          }
        }
      }
    })

    return NextResponse.json(completeUserProfile)
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('profileImage') as File | null

      if (!file || typeof (file as any).arrayBuffer !== 'function') {
        return NextResponse.json({ error: 'profileImage file required' }, { status: 400 })
      }

      const buf = Buffer.from(await file.arrayBuffer())
      const b64 = buf.toString('base64')
      const uploadResult = await cloudinary.uploader.upload(
        `data:${(file as any).type || 'image/jpeg'};base64,${b64}`,
        {
          folder: 'user_profiles',
          resource_type: 'image',
          transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }],
        }
      )

      let userProfile = await prisma.userProfile.findUnique({
        where: { userId: session.id },
      })

      if (!userProfile) {
        userProfile = await prisma.userProfile.create({
          data: {
            userId: session.id,
            firstName: session.name?.split(' ')[0] || 'User',
            lastName: session.name?.split(' ').slice(1).join(' ') || '',
            dateOfBirth: null,
            gender: null,
            bio: null,
            profileImage: uploadResult.secure_url,
            emergencyContact: null,
          },
        })
      } else {
        userProfile = await prisma.userProfile.update({
          where: { userId: session.id },
          data: { profileImage: uploadResult.secure_url },
        })
      }

      await prisma.user.update({
        where: { id: session.id },
        data: { avatar: uploadResult.secure_url },
      })

      return NextResponse.json({
        ...userProfile,
        profileImage: uploadResult.secure_url,
      })
    }

    const body = await request.json()
    const { firstName, lastName, bio, emergencyContact } = body
    console.log('✅ User profile exists for user:', body)

    // Ensure user profile exists before updating
    let userProfile = await prisma.userProfile.findUnique({
      where: { userId: session.id },
    })

    if (!userProfile) {
      try {
        userProfile = await prisma.userProfile.create({
          data: {
            userId: session.id,
            firstName: firstName || session.name?.split(' ')[0] || 'User',
            lastName: lastName || session.name?.split(' ').slice(1).join(' ') || '',
            dateOfBirth: null,
            gender: null,
            bio: bio || null,
            profileImage: null,
            emergencyContact: emergencyContact || null,
          },
        })
        console.log('✅ Created user profile for user:', session.id)
        return NextResponse.json(userProfile)
      } catch (error) {
        console.error('❌ Error creating user profile:', error)
        return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
      }
    }
    

    // Update existing profile
    const updatedProfile = await prisma.userProfile.update({
      where: { userId: session.id },
      data: {
        firstName,
        lastName,
        bio,
        emergencyContact,
      }
    })

    return NextResponse.json(updatedProfile)
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
