import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const vendorProfile = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
      },
    })

    if (!vendorProfile) {
      return NextResponse.json({ error: "Vendor profile not found" }, { status: 404 })
    }

    return NextResponse.json({
      ...vendorProfile,
      user: vendorProfile.user,
    })
  } catch (error) {
    console.error("Error fetching vendor profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if vendor profile exists
    const existingProfile = await prisma.vendorProfile.findUnique({
      where: { userId: user.id },
    })

    const contentType = request.headers.get("content-type")
    let vendorUpdateData: any = {}
    let userUpdateData: any = {}
    let hasImageUpload = false

    if (contentType && contentType.includes("multipart/form-data")) {
      // Handle FormData (for image uploads)
      const formData = await request.formData()

      const logo = formData.get("logo") as File | null
      const coverImage = formData.get("coverImage") as File | null

      if (logo) {
        try {
          console.log("📤 Uploading logo to Cloudinary...")
          const logoBuffer = Buffer.from(await logo.arrayBuffer())
          const logoBase64 = logoBuffer.toString("base64")

          const uploadResult = await cloudinary.uploader.upload(
            `data:${logo.type};base64,${logoBase64}`,
            {
              folder: "auto-parts/vendor-logos",
              resource_type: "image",
              transformation: [{ width: 300, height: 300, crop: "fill" }],
            }
          )

          vendorUpdateData.logo = uploadResult.secure_url
          hasImageUpload = true
          console.log("✅ Logo uploaded:", uploadResult.secure_url)
        } catch (uploadError) {
          console.error("Logo upload error:", uploadError)
          throw new Error("Failed to upload logo")
        }
      }

      if (coverImage) {
        try {
          console.log("📤 Uploading cover image to Cloudinary...")
          const coverBuffer = Buffer.from(await coverImage.arrayBuffer())
          const coverBase64 = coverBuffer.toString("base64")

          const uploadResult = await cloudinary.uploader.upload(
            `data:${coverImage.type};base64,${coverBase64}`,
            {
              folder: "auto-parts/vendor-covers",
              resource_type: "image",
              transformation: [{ width: 1200, height: 600, crop: "fill" }],
            }
          )

          vendorUpdateData.coverImage = uploadResult.secure_url
          hasImageUpload = true
          console.log("✅ Cover image uploaded:", uploadResult.secure_url)
        } catch (uploadError) {
          console.error("Cover upload error:", uploadError)
          throw new Error("Failed to upload cover image")
        }
      }
    } else {
      // Handle JSON (for regular updates)
      const body = await request.json()
      const {
        // VendorProfile fields
        businessName,
        businessType,
        businessLicense,
        taxId,
        description,
        website,
        address,
        city,
        state,
        latitude,
        longitude,
        vehicleMakes, // Array of vehicle makes
        categories, // Array of category IDs
        // User fields
        name,
        email,
        phone,
      } = body

      console.log("📝 Updating vendor profile with:", body)

      // VendorProfile updates
      if (businessName !== undefined) vendorUpdateData.businessName = businessName
      if (businessType !== undefined) vendorUpdateData.businessType = businessType
      if (businessLicense !== undefined) vendorUpdateData.businessLicense = businessLicense
      if (taxId !== undefined) vendorUpdateData.taxId = taxId
      if (description !== undefined) vendorUpdateData.description = description
      if (website !== undefined) vendorUpdateData.website = website
      if (address !== undefined) vendorUpdateData.address = address
      if (city !== undefined) vendorUpdateData.city = city
      if (state !== undefined) vendorUpdateData.state = state
      if (latitude !== undefined) vendorUpdateData.latitude = parseFloat(latitude)
      if (longitude !== undefined) vendorUpdateData.longitude = parseFloat(longitude)
      if (vehicleMakes !== undefined) {
        // Ensure it's an array and store as JSON
        vendorUpdateData.vehicleMakes = Array.isArray(vehicleMakes) ? vehicleMakes : []
      }
      if (categories !== undefined) {
        // Ensure it's an array and store as JSON
        vendorUpdateData.categories = Array.isArray(categories) ? categories : []
      }

      // User updates
      if (name !== undefined) userUpdateData.name = name
      if (email !== undefined) userUpdateData.email = email
      if (phone !== undefined) userUpdateData.phone = phone
    }

    // Update in transaction (upsert - create if doesn't exist)
    const result = await prisma.$transaction(async (tx) => {
      // Upsert VendorProfile (create if doesn't exist)
      let updatedProfile
      if (Object.keys(vendorUpdateData).length > 0 || !existingProfile) {
        // Prepare data for upsert
        const profileData = {
          userId: user.id,
          businessName: vendorUpdateData.businessName || existingProfile?.businessName || "",
          businessType: vendorUpdateData.businessType || existingProfile?.businessType || "AUTO_PARTS_RETAILER",
          address: vendorUpdateData.address || existingProfile?.address || "",
          city: vendorUpdateData.city || existingProfile?.city || "",
          state: vendorUpdateData.state || existingProfile?.state || "",
          ...vendorUpdateData, // Override with any updates
        }

        updatedProfile = await tx.vendorProfile.upsert({
          where: { userId: user.id },
          update: vendorUpdateData,
          create: profileData,
        })
        await tx.autoPartsStore.upsert({
          where: { userId: user.id },
          update: {
            storeName: vendorUpdateData.businessName || existingProfile?.businessName || "",
            description: vendorUpdateData.description || existingProfile?.description || "",
            address: vendorUpdateData.address || existingProfile?.address || "",
            website: vendorUpdateData.website || existingProfile?.website || "",
            latitude: vendorUpdateData.latitude || existingProfile?.latitude || null,
            longitude: vendorUpdateData.longitude || existingProfile?.longitude || null,
            phone: vendorUpdateData.phone || user.phone || "",
          },
          create: {
            userId: user.id,
            storeName: vendorUpdateData.businessName || existingProfile?.businessName || "",
            website: vendorUpdateData.website || existingProfile?.website || "",
            address: vendorUpdateData.address || existingProfile?.address || "",
            latitude: vendorUpdateData.latitude || existingProfile?.latitude || null,
            longitude: vendorUpdateData.longitude || existingProfile?.longitude || null,
              phone: vendorUpdateData.phone || user.phone || "",
          },
        })

      } else {
        updatedProfile = existingProfile
      }

      // Update User
      const updatedUser =
        Object.keys(userUpdateData).length > 0
          ? await tx.user.update({
              where: { id: user.id },
              data: userUpdateData,
            })
          : await tx.user.findUnique({ where: { id: user.id } })

      return { profile: updatedProfile, user: updatedUser }
    })

    console.log("✅ Vendor profile updated successfully")

    // Return only the updated fields for image uploads
    if (hasImageUpload) {
      return NextResponse.json({
        logo: result.profile.logo,
        coverImage: result.profile.coverImage,
      })
    }

    return NextResponse.json({
      ...result.profile,
      user: result.user,
    })
  } catch (error: any) {
    console.error("❌ Error updating vendor profile:", error)
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}
