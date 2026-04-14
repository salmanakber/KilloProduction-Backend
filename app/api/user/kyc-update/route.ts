import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { cloudinary } from "@/lib/cloudinary"

// Field mapping: rejectedFields -> Prisma model fields
const FIELD_MAPPING: { [entityType: string]: { [rejectedField: string]: string } } = {
  PHARMACY: {
    pharmacyName: "pharmacyName",
    name: "pharmacyName",
    licenseNumber: "licenseNumber",
    address: "address",
    latitude: "lat",
    longitude: "lon",
    email: "email",
    phone: "phone",
    description: "description",
    ownerName: "name", // Maps to User.name
    businessLicense: "licenseDocument",
    licenseDocument: "licenseDocument",
    storeFrontImage: "storeFrontImage",
    ownerPhoto: "ownerPhoto",
    emergencyContact: "emergencyContact",
  },
  FOOD: {
    name: "name",
    restaurantName: "name",
    address: "address",
    latitude: "latitude",
    longitude: "longitude",
    email: "email",
    phone: "phone",
    description: "description",
    businessLicense: "businessLicense",
    foodLicense: "foodLicense",
    businessRegistration: "businessRegistration",
    restaurantFront: "restaurantFront",
    kitchenPhoto: "kitchenPhoto",
    menuSample: "menuSample",
  },
  GROCERY: {
    storeName: "storeName",
    address: "address",
    latitude: "latitude",
    longitude: "longitude",
    email: "email",
    phone: "phone",
    description: "description",
    businessLicense: "businessLicense",
    tradeLicense: "tradeLicense",
    businessRegistration: "businessRegistration",
    storeFront: "storeFront",
    storeInterior: "storeInterior",
    productSample: "productSample",
  },
  AUTO_PARTS: {
    storeName: "storeName",
    businessName: "storeName",
    address: "address",
    latitude: "latitude",
    longitude: "longitude",
    email: "email",
    phone: "phone",
    description: "description",
    taxId: "taxId",
    businessLicense: "businessLicense",
    storeFront: "storeFront",
    inventory: "inventory",
  },
  RIDER: {
    name: "name", // Maps to User.name
    email: "email", // Maps to User.email
    phone: "phone", // Maps to User.phone
    licenseNumber: "licenseNumber",
    licensePlate: "licensePlate",
    nationalId: "nationalId",
    driversLicense: "licensePhoto",
    licensePhoto: "licensePhoto",
    vehicleRegistration: "vehiclePhotos",
    insurance: "insurance",
    insurancePhoto: "insurancePhoto",
    nationalIdPhoto: "nationalIdPhoto",
    selfiePhoto: "selfiePhoto",
    emergencyContact: "emergencyContact",
  },
}

// Image fields that need Cloudinary upload
const IMAGE_FIELDS: { [entityType: string]: string[] } = {
  PHARMACY: ["licenseDocument", "businessLicense", "storeFrontImage", "ownerPhoto"],
  FOOD: ["businessLicense", "foodLicense", "restaurantFront", "kitchenPhoto", "menuSample"],
  GROCERY: ["businessLicense", "tradeLicense", "storeFront", "storeInterior", "productSample"],
  AUTO_PARTS: ["businessLicense", "storeFront", "inventory"],
  RIDER: ["licensePhoto", "driversLicense", "vehiclePhotos", "vehicleRegistration", "insurancePhoto", "nationalIdPhoto", "selfiePhoto"],
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Check if request is FormData (for image uploads) or JSON
    const contentType = request.headers.get("content-type") || ""
    const isFormData = contentType.includes("multipart/form-data")

    let entityType: string
    let fields: any = {}
    let imageFiles: { [fieldName: string]: File } = {}

    if (isFormData) {
      const formData = await request.formData()
      entityType = formData.get("entityType") as string

      if (!entityType) {
        return NextResponse.json({ error: "entityType is required" }, { status: 400 })
      }

      // Get all text fields
      for (const [key, value] of formData.entries()) {
        if (key !== "entityType" && !key.startsWith("image_")) {
          if (value instanceof File) {
            // This is an image field
            const fieldName = key.replace("image_", "")
            imageFiles[fieldName] = value
          } else {
            fields[key] = value as string
          }
        } else if (key.startsWith("image_")) {
          const fieldName = key.replace("image_", "")
          const file = value as File
          if (file && file.size > 0) {
            imageFiles[fieldName] = file
          }
        }
      }
    } else {
      const body = await request.json()
      entityType = body.entityType
      fields = body.fields || {}
    }

    if (!entityType) {
      return NextResponse.json({ error: "entityType is required" }, { status: 400 })
    }

    // Fetch unresolved rejections to get rejectedFields
    const unresolvedRejections = await prisma.kycRejection.findMany({
      where: {
        userId: user.id,
        entityType,
        isResolved: false,
      },
      select: {
        rejectedFields: true,
      },
    })

    // Collect all rejected fields
    const allRejectedFields = new Set<string>()
    unresolvedRejections.forEach((rejection) => {
      if (rejection.rejectedFields && Array.isArray(rejection.rejectedFields)) {
        rejection.rejectedFields.forEach((field: string) => allRejectedFields.add(field))
      }
    })

    // Only allow updates to rejected fields
    const allowedFields = new Set(allRejectedFields)
    const filteredFields: any = {}
    const userUpdateFields: any = {}

    // Process text fields
    for (const [key, value] of Object.entries(fields)) {
      if (allowedFields.has(key)) {
        const mappedField = FIELD_MAPPING[entityType]?.[key] || key
        
        // Convert lat/lon to numbers if they exist
        let processedValue: any = value
        if (key === "latitude" || key === "longitude" || mappedField === "lat" || mappedField === "lon" || mappedField === "latitude" || mappedField === "longitude") {
          processedValue = parseFloat(value as string)
          if (isNaN(processedValue)) {
            continue // Skip invalid lat/lon values
          }
        }
        
        // Check if this field maps to User model
        if (mappedField === "name" || mappedField === "email" || mappedField === "phone") {
          userUpdateFields[mappedField] = processedValue
        } else {
          filteredFields[mappedField] = processedValue
        }
      }
    }

    // Upload images to Cloudinary
    const imageUploadPromises: Promise<{ field: string; url: string }>[] = []
    
    for (const [fieldName, file] of Object.entries(imageFiles)) {
      if (allowedFields.has(fieldName) && IMAGE_FIELDS[entityType]?.includes(fieldName)) {
        const uploadPromise = (async () => {
          try {
            // Validate file type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
            if (!allowedTypes.includes(file.type)) {
              throw new Error(`Invalid file type for ${fieldName}. Only JPG, PNG, and WEBP are allowed.`)
            }

            // Validate file size (max 5MB)
            const maxSize = 5 * 1024 * 1024 // 5MB
            if (file.size > maxSize) {
              throw new Error(`File too large for ${fieldName}. Maximum size is 5MB.`)
            }

            // Convert to buffer and upload
            const fileBuffer = Buffer.from(await file.arrayBuffer())
            const fileBase64 = fileBuffer.toString('base64')
            
            const folder = `kyc-updates/${entityType.toLowerCase()}/${fieldName}`
            const mappedField = FIELD_MAPPING[entityType]?.[fieldName] || fieldName
            
            const uploadResult = await cloudinary.uploader.upload(
              `data:${file.type};base64,${fileBase64}`,
              {
                folder,
                resource_type: 'image',
                transformation: [
                  { quality: 'auto', fetch_format: 'auto' },
                  { width: 1200, height: 1200, crop: 'limit' }
                ]
              }
            )

            return { field: mappedField, url: uploadResult.secure_url }
          } catch (error: any) {
            console.error(`Error uploading ${fieldName}:`, error)
            throw error
          }
        })()

        imageUploadPromises.push(uploadPromise)
      }
    }

    // Wait for all image uploads to complete
    const uploadedImages = await Promise.all(imageUploadPromises)
    
    // Add uploaded image URLs to filteredFields
    uploadedImages.forEach(({ field, url }) => {
      filteredFields[field] = url
    })

    if (Object.keys(filteredFields).length === 0 && Object.keys(userUpdateFields).length === 0) {
      return NextResponse.json({ 
        error: "No valid fields to update. Please check that you're updating only rejected fields." 
      }, { status: 400 })
    }

    // Fetch user with all store profiles
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        autoPartsStore: true,
        pharmacy: true,
        restaurant: true,
        groceryStore: true,
        riderProfile: true,
      },
    })

    if (!fullUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    let updatedEntity: any = null

    // Update User model fields if needed
    if (Object.keys(userUpdateFields).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: userUpdateFields,
      })
    }

    // Update based on entity type
    switch (entityType) {
      case "PHARMACY": {
        if (!fullUser.pharmacy) {
          return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
        }

        updatedEntity = await prisma.pharmacy.update({
          where: { id: fullUser.pharmacy.id },
          data: filteredFields,
        })
        break
      }

      case "FOOD": {
        if (!fullUser.restaurant) {
          return NextResponse.json({ error: "Restaurant not found" }, { status: 404 })
        }

        updatedEntity = await prisma.restaurant.update({
          where: { id: fullUser.restaurant.id },
          data: filteredFields,
        })
        break
      }

      case "GROCERY": {
        if (!fullUser.groceryStore) {
          return NextResponse.json({ error: "Grocery store not found" }, { status: 404 })
        }

        updatedEntity = await prisma.groceryStore.update({
          where: { id: fullUser.groceryStore.id },
          data: filteredFields,
        })
        break
      }

      case "AUTO_PARTS": {
        if (!fullUser.autoPartsStore) {
          return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
        }

        updatedEntity = await prisma.autoPartsStore.update({
          where: { id: fullUser.autoPartsStore.id },
          data: filteredFields,
        })
        break
      }

      case "RIDER": {
        if (!fullUser.riderProfile) {
          return NextResponse.json({ error: "Rider profile not found" }, { status: 404 })
        }

        updatedEntity = await prisma.riderProfile.update({
          where: { id: fullUser.riderProfile.id },
          data: filteredFields,
        })
        break
      }

      default:
        return NextResponse.json({ error: "Invalid entity type" }, { status: 400 })
    }

    // Mark rejections as resolved after successful update
    if (updatedEntity && allRejectedFields.size > 0) {
      await prisma.kycRejection.updateMany({
        where: {
          userId: user.id,
          entityType,
          isResolved: false,
        },
        data: {
          isResolved: true,
          resolvedAt: new Date(),
        },
      })

      // Reset verification status to pending for admin review
      if (entityType === "PHARMACY") {
        await prisma.pharmacy.update({
          where: { id: updatedEntity.id },
          data: { isVerified: false, status: "PENDING" }
        })
      } else if (entityType === "FOOD") {
        await prisma.restaurant.update({
          where: { id: updatedEntity.id },
          data: { isVerified: false }
        })
      } else if (entityType === "GROCERY") {
        await prisma.groceryStore.update({
          where: { id: updatedEntity.id },
          data: { isVerified: false }
        })
      } else if (entityType === "AUTO_PARTS") {
        await prisma.autoPartsStore.update({
          where: { id: updatedEntity.id },
          data: { isVerified: false }
        })
      } else if (entityType === "RIDER") {
        await prisma.riderProfile.update({
          where: { id: updatedEntity.id },
          data: { isVerified: false, isApproved: false }
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: "Profile updated successfully. Your application will be reviewed again.",
      entity: updatedEntity,
    })
  } catch (error: any) {
    console.error("Error updating KYC data:", error)
    return NextResponse.json({ 
      error: error.message || "Failed to update profile" 
    }, { status: 500 })
  }
}
