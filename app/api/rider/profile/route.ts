import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authenticateRequest } from '@/lib/auth'
import { rejectIfRiderCommissionLocked } from '@/lib/rider-app-access'
import { cloudinary } from '@/lib/cloudinary'

async function uploadRiderAvatar(imageBase64: string) {
  return new Promise<string>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder: "kilo/rider-profiles" }, (error, result) => {
        if (error || !result?.secure_url) return reject(error || new Error("Upload failed"))
        resolve(result.secure_url)
      })
      .end(Buffer.from(imageBase64, "base64"))
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    if (session.role !== 'RIDER') {
      return NextResponse.json({ error: 'Forbidden - Rider access only' }, { status: 403 })
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
        console.log('✅ Created user profile for rider:', session.id)
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
        console.log('✅ Created user settings for rider:', session.id)
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
        console.log('✅ Created wallet for rider:', session.id)
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

    // Check and create rider profile if it doesn't exist
    let riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: session.id },
    })

    if (!riderProfile) {
      try {
        riderProfile = await prisma.riderProfile.create({
          data: {
            userId: session.id,
            vehicleType: 'MOTORCYCLE',
            vehicleBrand: 'Brand',
            vehicleModel: 'Model',
            vehicleYear: '2020',
            vehicleColor: 'Color',
            licensePlate: 'ABC123',
            licenseNumber: 'LIC-001',
            licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            maxDeliveryDistance: 15,
            isAvailable: false,
            rating: 0,
            totalRides: 0,
            totalDeliveries: 0,
            totalEarnings: 0,
            completionRate: 0,
            cancellationRate: 0,
            averageRating: 0,
            isVerified: false,
            isApproved: false,
            documentsComplete: false,
            documentsVerified: false,
            status: 'PENDING'
          },
        })
        console.log('✅ Created rider profile for user:', session.id)
      } catch (error) {
        console.error('❌ Error creating rider profile:', error)
        return NextResponse.json({ error: 'Failed to create rider profile' }, { status: 500 })
      }
    }

    // Now fetch the complete profile with all related data
    const completeProfile = await prisma.riderProfile.findUnique({
      where: { userId: session.id },
      include: {
        
        user: {
          include: {
            userProfile: true,
            userSettings: true,
            wallet: true
          }
        }
      }
    })

    return NextResponse.json(completeProfile)
  } catch (error) {
    console.error('Error fetching rider profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const riderLockResponse = rejectIfRiderCommissionLocked(session)
    if (riderLockResponse) return riderLockResponse

    if (session.role !== 'RIDER') {
      return NextResponse.json({ error: 'Forbidden - Rider access only' }, { status: 403 })
    }

    const body = await request.json()
    const {
      vehicleType,
      vehicleBrand,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      licensePlate,
      licenseNumber,
      licenseExpiry,
      insurance,
      insuranceExpiry,
      maxDeliveryDistance,
      emergencyContact,
      name,
      firstName,
      lastName,
      avatarBase64,
    } = body

    // Ensure rider profile exists before updating
    let riderProfile = await prisma.riderProfile.findUnique({
      where: { userId: session.id },
    })

    if (!riderProfile) {
      try {
        riderProfile = await prisma.riderProfile.create({
          data: {
            userId: session.id,
            vehicleType: vehicleType || 'MOTORCYCLE',
            vehicleBrand: vehicleBrand || 'Brand',
            vehicleModel: vehicleModel || 'Model',
            vehicleYear: vehicleYear || '2020',
            vehicleColor: vehicleColor || 'Color',
            licensePlate: licensePlate || 'ABC123',
            licenseNumber: licenseNumber || 'LIC-001',
            licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            insurance: insurance || null,
            insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
            maxDeliveryDistance: maxDeliveryDistance || 15,
            isAvailable: false,
            rating: 0,
            totalRides: 0,
            totalDeliveries: 0,
            totalEarnings: 0,
            completionRate: 0,
            cancellationRate: 0,
            averageRating: 0,
            isVerified: false,
            isApproved: false,
            documentsComplete: false,
            documentsVerified: false,
            status: 'PENDING'
          },
        })
        console.log('✅ Created rider profile for user:', session.id)
        return NextResponse.json(riderProfile)
      } catch (error) {
        console.error('❌ Error creating rider profile:', error)
        return NextResponse.json({ error: 'Failed to create rider profile' }, { status: 500 })
      }
    }

    // Update existing rider profile
    const updatedProfile = await prisma.riderProfile.update({
      where: { userId: session.id },
      data: {
        vehicleType,
        vehicleBrand,
        vehicleModel,
        vehicleYear,
        vehicleColor,
        licensePlate,
        licenseNumber,
        licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : undefined,
        insurance,
        insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : undefined,
        maxDeliveryDistance,
        emergencyContact
      }
    })

    // Also update user profile emergency contact if provided
    let avatarUrl: string | undefined
    if (avatarBase64 && typeof avatarBase64 === "string") {
      const base64 = avatarBase64.includes(",") ? avatarBase64.split(",")[1] : avatarBase64
      if (base64) {
        avatarUrl = await uploadRiderAvatar(base64)
      }
    }

    if (name || avatarUrl) {
      await prisma.user.update({
        where: { id: session.id },
        data: {
          ...(name ? { name } : {}),
          ...(avatarUrl ? { avatar: avatarUrl } : {}),
        },
      })
    }

    if (emergencyContact || firstName || lastName) {
      await prisma.userProfile.upsert({
        where: { userId: session.id },
        update: {
          ...(emergencyContact ? { emergencyContact } : {}),
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
        },
        create: {
          userId: session.id,
          firstName: firstName || "",
          lastName: lastName || "",
          emergencyContact: emergencyContact || null,
        },
      })
    }

    return NextResponse.json(updatedProfile)
  } catch (error) {
    console.error('Error updating rider profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
