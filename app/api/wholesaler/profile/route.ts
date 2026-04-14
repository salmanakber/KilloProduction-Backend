import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const wholesaler = await prisma.wholesaler.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          include: {
            userProfile: true
          }
        }
      }
    })

    if (!wholesaler) {
      return NextResponse.json({ error: "Wholesaler not found" }, { status: 404 })
    }

    // Get or create user profile
    let userProfile = wholesaler.user.userProfile
    if (!userProfile) {
      userProfile = await prisma.userProfile.create({
        data: {
          userId: user.id,
          firstName: wholesaler.user.name?.split(' ')[0] || '',
          lastName: wholesaler.user.name?.split(' ').slice(1).join(' ') || '',
        }
      })
    }

    return NextResponse.json({
      // User profile fields (for frontend form)
      firstName: userProfile.firstName || '',
      lastName: userProfile.lastName || '',
      bio: userProfile.bio || '',
      emergencyContact: userProfile.emergencyContact || '',
      profileImage: userProfile.profileImage || wholesaler.user.avatar || '',
      
      // Wholesaler company info (read-only)
      companyName: wholesaler.companyName,
      licenseNumber: wholesaler.licenseNumber,
      address: wholesaler.address,
      latitude: wholesaler.latitude,
      longitude: wholesaler.longitude,
      phone: wholesaler.phone,
      email: wholesaler.email,
      description: wholesaler.description,
      website: wholesaler.website,
      isVerified: wholesaler.isVerified,
      specialties: wholesaler.specialties,
      deliveryZones: wholesaler.deliveryZones,
      paymentTerms: wholesaler.paymentTerms,
    })
  } catch (error) {
    console.error("Wholesaler profile fetch error:", error)
    return NextResponse.json(
      { error: "Failed to fetch wholesaler profile" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "WHOLESALER" as any) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { firstName, lastName, bio, emergencyContact, profileImage } = body

    // Update or create user profile
    const userProfile = await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        bio: bio || undefined,
        emergencyContact: emergencyContact || undefined,
        profileImage: profileImage || undefined,
      },
      create: {
        userId: user.id,
        firstName: firstName || '',
        lastName: lastName || '',
        bio: bio || '',
        emergencyContact: emergencyContact || '',
        profileImage: profileImage || '',
      }
    })

    // Update user name if firstName/lastName changed
    if (firstName || lastName) {
      const fullName = [firstName, lastName].filter(Boolean).join(' ')
      if (fullName) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: fullName }
        })
      }
    }

    // Update user avatar if profileImage changed
    if (profileImage) {
      await prisma.user.update({
        where: { id: user.id },
        data: { avatar: profileImage }
      })
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
      profile: {
        firstName: userProfile.firstName,
        lastName: userProfile.lastName,
        bio: userProfile.bio,
        emergencyContact: userProfile.emergencyContact,
        profileImage: userProfile.profileImage,
      }
    })
  } catch (error) {
    console.error("Wholesaler profile update error:", error)
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    )
  }
}
