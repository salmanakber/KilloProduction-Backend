import { authenticateRequest } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    
    

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      include: {
        userProfile: true,
        userSettings: true,
      },
    })


   

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatar: user.avatar,
        role: user.role,
        isVerified: user.isVerified,
        profile: user.userProfile,
        settings: user.userSettings,
      },
    })
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await authenticateRequest(request)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, email, phone, profile } = body

    // Update User model
    const userUpdateData: any = {}
    if (name !== undefined) userUpdateData.name = name
    if (email !== undefined) userUpdateData.email = email
    if (phone !== undefined) userUpdateData.phone = phone

    // Update UserProfile model
    const profileUpdateData: any = {}
    if (profile) {
      if (profile.firstName !== undefined) profileUpdateData.firstName = profile.firstName
      if (profile.lastName !== undefined) profileUpdateData.lastName = profile.lastName
      if (profile.dateOfBirth !== undefined) profileUpdateData.dateOfBirth = profile.dateOfBirth ? new Date(profile.dateOfBirth) : null
      if (profile.gender !== undefined) profileUpdateData.gender = profile.gender
      if (profile.bio !== undefined) profileUpdateData.bio = profile.bio
      if (profile.emergencyContact !== undefined) profileUpdateData.emergencyContact = profile.emergencyContact
    }

    // Use transaction to update both models
    const result = await prisma.$transaction(async (tx) => {
      // Update User
      const updatedUser = await tx.user.update({
        where: { id: session.id },
        data: userUpdateData,
      })

      // Update or create UserProfile
      let updatedProfile
      if (Object.keys(profileUpdateData).length > 0) {
        updatedProfile = await tx.userProfile.upsert({
          where: { userId: session.id },
          update: profileUpdateData,
          create: {
            userId: session.id,
            ...profileUpdateData,
          },
        })
      } else {
        updatedProfile = await tx.userProfile.findUnique({
          where: { userId: session.id },
        })
      }

      return { user: updatedUser, profile: updatedProfile }
    })

    return NextResponse.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        avatar: result.user.avatar,
        profile: result.profile,
      },
    })
  } catch (error: any) {
    console.error('Error updating user profile:', error)
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0]
      return NextResponse.json(
        { error: `${field} is already taken` },
        { status: 400 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
