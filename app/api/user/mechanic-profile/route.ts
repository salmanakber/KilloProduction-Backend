import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const mechanicProfile = await prisma.mechanicProfile.findUnique({
      where: { userId: user.id },
      include: {
        expertise: true,
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

    if (!mechanicProfile) {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })
    }

    // Transform expertise to match expected format
    const formattedExpertise = mechanicProfile.expertise.map((exp) => ({
      type: exp.expertiseType,
      experienceYears: exp.experienceYears,
      isPrimary: exp.isPrimary,
    }))

    return NextResponse.json({
      ...mechanicProfile,
      expertise: formattedExpertise,
      user: mechanicProfile.user,
    })
  } catch (error) {
    console.error("Error fetching mechanic profile:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "MECHANIC") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if mechanic profile exists
    const existingProfile = await prisma.mechanicProfile.findUnique({
      where: { userId: user.id },
      include: { expertise: true },
    })

    const contentType = request.headers.get("content-type")
    let mechanicUpdateData: any = {}
    let expertiseData: any[] = []
    let hasImageUpload = false

    if (contentType && contentType.includes("multipart/form-data")) {
      // Handle FormData (for image uploads and other fields)
      const formData = await request.formData()

      // Handle image uploads (logoFile, coverFile from mobile app)
      const logoFile = formData.get("logoFile") as File | null
      const coverFile = formData.get("coverFile") as File | null
      
      // Handle logo
      if (logoFile && logoFile.size > 0) {
        try {
          console.log("📤 Uploading logo to Cloudinary...")
          const logoBuffer = Buffer.from(await logoFile.arrayBuffer())
          const logoBase64 = logoBuffer.toString("base64")
          const mimeType = logoFile.type || "image/jpeg"

          const uploadResult = await cloudinary.uploader.upload(
            `data:${mimeType};base64,${logoBase64}`,
            {
              folder: "auto-parts/mechanic-logos",
              resource_type: "image",
              transformation: [{ width: 300, height: 300, crop: "fill" }],
            }
          )

          mechanicUpdateData.logo = uploadResult.secure_url
          hasImageUpload = true
          console.log("✅ Logo uploaded:", uploadResult.secure_url)
        } catch (uploadError) {
          console.error("Logo upload error:", uploadError)
          throw new Error("Failed to upload logo")
        }
      } else {
        // Check if logo is provided as URL string
        const logo = formData.get("logo") as string | null
        if (logo && logo !== "null" && logo !== "") {
          mechanicUpdateData.logo = logo
        }
      }

      // Handle cover image
      if (coverFile && coverFile.size > 0) {
        try {
          console.log("📤 Uploading cover image to Cloudinary...")
          const coverBuffer = Buffer.from(await coverFile.arrayBuffer())
          const coverBase64 = coverBuffer.toString("base64")
          const mimeType = coverFile.type || "image/jpeg"

          const uploadResult = await cloudinary.uploader.upload(
            `data:${mimeType};base64,${coverBase64}`,
            {
              folder: "auto-parts/mechanic-covers",
              resource_type: "image",
              transformation: [{ width: 1200, height: 600, crop: "fill" }],
            }
          )

          mechanicUpdateData.coverImage = uploadResult.secure_url
          hasImageUpload = true
          console.log("✅ Cover image uploaded:", uploadResult.secure_url)
        } catch (uploadError) {
          console.error("Cover upload error:", uploadError)
          throw new Error("Failed to upload cover image")
        }
      } else {
        // Check if coverImage is provided as URL string
        const coverImage = formData.get("coverImage") as string | null
        if (coverImage && coverImage !== "null" && coverImage !== "") {
          mechanicUpdateData.coverImage = coverImage
        }
      }

      // Handle other fields from FormData
      const businessName = formData.get("businessName") as string | null
      const businessType = formData.get("businessType") as string | null
      const description = formData.get("description") as string | null
      const address = formData.get("address") as string | null
      const city = formData.get("city") as string | null
      const state = formData.get("state") as string | null
      const phone = formData.get("phone") as string | null
      const email = formData.get("email") as string | null
      const hourlyRate = formData.get("hourlyRate") as string | null
      const serviceRadius = formData.get("serviceRadius") as string | null
      const yearsOfExperience = formData.get("yearsOfExperience") as string | null
      const availableFrom = formData.get("availableFrom") as string | null
      const availableTo = formData.get("availableTo") as string | null
      const latitude = formData.get("latitude") as string | null
      const longitude = formData.get("longitude") as string | null
      const expertiseStr = formData.get("expertise") as string | null

      if (businessName !== null && businessName !== "null" && businessName !== "") {
        mechanicUpdateData.businessName = businessName
      }
      if (businessType !== null && businessType !== "null" && businessType !== "") {
        mechanicUpdateData.businessType = businessType
      }
      if (description !== null && description !== "null") {
        mechanicUpdateData.description = description || null
      }
      if (address !== null && address !== "null" && address !== "") {
        mechanicUpdateData.address = address
      }
      if (city !== null && city !== "null" && city !== "") {
        mechanicUpdateData.city = city
      }
      if (state !== null && state !== "null" && state !== "") {
        mechanicUpdateData.state = state
      }
      if (phone !== null && phone !== "null") {
        mechanicUpdateData.phone = phone || null
      }
      if (email !== null && email !== "null") {
        mechanicUpdateData.email = email || null
      }
      if (hourlyRate !== null && hourlyRate !== "null" && hourlyRate !== "") {
        mechanicUpdateData.hourlyRate = parseFloat(hourlyRate)
      }
      if (serviceRadius !== null && serviceRadius !== "null" && serviceRadius !== "") {
        mechanicUpdateData.serviceRadius = parseFloat(serviceRadius)
      }
      if (yearsOfExperience !== null && yearsOfExperience !== "null" && yearsOfExperience !== "") {
        mechanicUpdateData.yearsOfExperience = parseInt(yearsOfExperience)
      }
      if (availableFrom !== null && availableFrom !== "null") {
        mechanicUpdateData.availableFrom = availableFrom || null
      }
      if (availableTo !== null && availableTo !== "null") {
        mechanicUpdateData.availableTo = availableTo || null
      }
      if (latitude !== null && latitude !== "null" && latitude !== "") {
        mechanicUpdateData.latitude = parseFloat(latitude)
      }
      if (longitude !== null && longitude !== "null" && longitude !== "") {
        mechanicUpdateData.longitude = parseFloat(longitude)
      }

      // Parse expertise JSON string
      if (expertiseStr && expertiseStr !== "null" && expertiseStr !== "") {
        try {
          expertiseData = JSON.parse(expertiseStr)
        } catch (error) {
          console.error("Error parsing expertise:", error)
        }
      }
    } else {
      // Handle JSON (for regular updates)
      const body = await request.json()
      const {
        businessName,
        businessType,
        description,
        address,
        city,
        state,
        phone,
        email,
        hourlyRate,
        serviceRadius,
        yearsOfExperience,
        availableFrom,
        availableTo,
        latitude,
        longitude,
        logo,
        coverImage,
        expertise,
      } = body

      console.log("📝 Updating mechanic profile with:", body)

      if (businessName !== undefined) mechanicUpdateData.businessName = businessName
      if (businessType !== undefined) mechanicUpdateData.businessType = businessType
      if (description !== undefined) mechanicUpdateData.description = description
      if (address !== undefined) mechanicUpdateData.address = address
      if (city !== undefined) mechanicUpdateData.city = city
      if (state !== undefined) mechanicUpdateData.state = state
      if (phone !== undefined) mechanicUpdateData.phone = phone
      if (email !== undefined) mechanicUpdateData.email = email
      if (hourlyRate !== undefined) mechanicUpdateData.hourlyRate = hourlyRate ? parseFloat(hourlyRate.toString()) : null
      if (serviceRadius !== undefined) mechanicUpdateData.serviceRadius = serviceRadius ? parseFloat(serviceRadius.toString()) : null
      if (yearsOfExperience !== undefined) mechanicUpdateData.yearsOfExperience = yearsOfExperience ? parseInt(yearsOfExperience.toString()) : null
      if (availableFrom !== undefined) mechanicUpdateData.availableFrom = availableFrom || null
      if (availableTo !== undefined) mechanicUpdateData.availableTo = availableTo || null
      if (latitude !== undefined) mechanicUpdateData.latitude = latitude ? parseFloat(latitude.toString()) : null
      if (longitude !== undefined) mechanicUpdateData.longitude = longitude ? parseFloat(longitude.toString()) : null
      if (logo !== undefined) mechanicUpdateData.logo = logo || null
      if (coverImage !== undefined) mechanicUpdateData.coverImage = coverImage || null
      if (expertise !== undefined) expertiseData = Array.isArray(expertise) ? expertise : []
    }

    // Update in transaction (upsert - create if doesn't exist)
    const result = await prisma.$transaction(async (tx) => {
      // Upsert MechanicProfile (create if doesn't exist)
      let updatedProfile
      if (Object.keys(mechanicUpdateData).length > 0 || !existingProfile) {
        // Prepare data for upsert
        const profileData = {
          userId: user.id,
          businessName: mechanicUpdateData.businessName || existingProfile?.businessName || "",
          businessType: mechanicUpdateData.businessType || existingProfile?.businessType || "Auto Repair Shop",
          address: mechanicUpdateData.address || existingProfile?.address || "",
          city: mechanicUpdateData.city || existingProfile?.city || "",
          state: mechanicUpdateData.state || existingProfile?.state || "",
          ...mechanicUpdateData, // Override with any updates
        }

        updatedProfile = await tx.mechanicProfile.upsert({
          where: { userId: user.id },
          update: mechanicUpdateData,
          create: profileData,
        })
      } else {
        updatedProfile = existingProfile
      }

      // Handle expertise updates
      if (expertiseData.length > 0) {
        // Delete existing expertise
        await tx.mechanicExpertise.deleteMany({
          where: { mechanicProfileId: updatedProfile.id },
        })

        // Create new expertise records
        if (expertiseData.length > 0) {
          await tx.mechanicExpertise.createMany({
            data: expertiseData.map((exp: any) => ({
              mechanicProfileId: updatedProfile.id,
              expertiseType: exp.type,
              experienceYears: exp.experienceYears || null,
              isPrimary: exp.isPrimary || false,
            })),
          })
        }
      }

      // Fetch updated profile with expertise
      return await tx.mechanicProfile.findUnique({
        where: { id: updatedProfile.id },
        include: { expertise: true },
      })
    })

    console.log("✅ Mechanic profile updated successfully")

    // Return only the updated fields for image uploads
    if (hasImageUpload) {
      return NextResponse.json({
        logo: result?.logo,
        coverImage: result?.coverImage,
        ...result,
      })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("❌ Error updating mechanic profile:", error)
    return NextResponse.json(
      {
        error: error.message || "Internal server error",
      },
      { status: 500 }
    )
  }
}