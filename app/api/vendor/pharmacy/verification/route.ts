import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cloudinary } from "@/lib/cloudinary"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    
    // Basic pharmacy information
    const pharmacyName = formData.get("pharmacyName") as string
    const licenseNumber = formData.get("licenseNumber") as string
    const description = formData.get("description") as string
    const address = formData.get("address") as string
    const phone = formData.get("phone") as string
    const email = formData.get("email") as string
    const website = formData.get("website") as string
    const openingHours = formData.get("openingHours") as string

    const is24Hours = formData.get("is24Hours") === "true"
    const deliveryAvailable = formData.get("deliveryAvailable") === "true"
    const emergencyContact = formData.get("emergencyContact") as string
    const pharmacistOnDuty = formData.get("pharmacistOnDuty") as string
    const responseTime = parseInt(formData.get("responseTime") as string) || 30
    
    // Specializations (MedicineOrigin enum values)
    const specializations = formData.getAll("specializations") as string[]
    
    // File uploads
    const licenseDocument = formData.get("licenseDocument") as File | null
    const storeFrontImage = formData.get("storeFrontImage") as File | null
    const ownerPhoto = formData.get("ownerPhoto") as File | null

    // Validation
    if (!pharmacyName || !licenseNumber || !address || !phone) {
      return NextResponse.json({ 
        error: "Missing required fields: pharmacyName, licenseNumber, address, phone" 
      }, { status: 400 })
    }

    // Upload files to Cloudinary
    let licenseDocumentUrl = null
    let storeFrontImageUrl = null
    let ownerPhotoUrl = null

    if (licenseDocument) {
      try {
        const bytes = await licenseDocument.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const result = await cloudinary.uploader.upload_stream(
          { folder: "pharmacy-documents" },
          (error, result) => {
            if (result) licenseDocumentUrl = result.secure_url
          }
        ).end(buffer)
      } catch (error) {
        console.error("License document upload error:", error)
      }
    }

    if (storeFrontImage) {
      try {
        const bytes = await storeFrontImage.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const result = await cloudinary.uploader.upload_stream(
          { folder: "pharmacy-images" },
          (error, result) => {
            if (result) storeFrontImageUrl = result.secure_url
          }
        ).end(buffer)
      } catch (error) {
        console.error("Store front image upload error:", error)
      }
    }

    if (ownerPhoto) {
      try {
        const bytes = await ownerPhoto.arrayBuffer()
        const buffer = Buffer.from(bytes)
        const result = await cloudinary.uploader.upload_stream(
          { folder: "pharmacy-owners" },
          (error, result) => {
            if (result) ownerPhotoUrl = result.secure_url
          }
        ).end(buffer)
      } catch (error) {
        console.error("Owner photo upload error:", error)
      }
    }

    // Check if pharmacy already exists
    const existingPharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id }
    })

    if (existingPharmacy) {
      // Update existing pharmacy
      const updatedPharmacy = await prisma.pharmacy.update({
        where: { userId: user.id },
        data: {
          pharmacyName,
          licenseNumber,
          description,
          address,
          phone,
          email,
          website,
          openingHours: openingHours ? JSON.parse(openingHours) : null,
          is24Hours,
          deliveryAvailable,
          emergencyContact,
          pharmacistOnDuty,
          responseTime,
          status: "PENDING",
          isVerified: false,
          isApprovedByAdmin: false,
          approvalDate: null,
          rejectedAt: null,
          rejectionReason: null,
          licenseDocument: licenseDocumentUrl || existingPharmacy.licenseDocument,
          storeFrontImage: storeFrontImageUrl || existingPharmacy.storeFrontImage,
          ownerPhoto: ownerPhotoUrl || existingPharmacy.ownerPhoto,
          updatedAt: new Date()
        }
      })

      // Update specializations
      if (specializations && specializations.length > 0) {
        // Delete existing specializations
        await prisma.pharmacySpecialization.deleteMany({
          where: { pharmacyId: updatedPharmacy.id }
        })

        // Create new specializations
        await Promise.all(
          specializations.map(spec => 
            prisma.pharmacySpecialization.create({
              data: {
                pharmacyId: updatedPharmacy.id,
                medicineOriginId: spec as any
              }
            })
          )
        )
      }

      return NextResponse.json({
        success: true,
        message: "Pharmacy verification updated successfully",
        pharmacy: updatedPharmacy
      })
    } else {
      // Create new pharmacy
      const newPharmacy = await prisma.pharmacy.create({
        data: {
          userId: user.id,
          pharmacyName,
          licenseNumber,
          description,
          address,
          phone,
          email,
          website,
          openingHours: openingHours ? JSON.parse(openingHours) : null,
          is24Hours,
          deliveryAvailable,
          emergencyContact,
          pharmacistOnDuty,
          responseTime,
          status: "PENDING",
          isVerified: false,
          isApprovedByAdmin: false,
          licenseDocument: licenseDocumentUrl,
          storeFrontImage: storeFrontImageUrl,
          ownerPhoto: ownerPhotoUrl
        }
      })

      // Create specializations
      if (specializations && specializations.length > 0) {
        await Promise.all(
          specializations.map(spec => 
            prisma.pharmacySpecialization.create({
              data: {
                pharmacyId: newPharmacy.id,
                medicineOriginId: spec as any
              }
            })
          )
        )
      }

      return NextResponse.json({
        success: true,
        message: "Pharmacy verification submitted successfully",
        pharmacy: newPharmacy
      }, { status: 201 })
    }
  } catch (error) {
    console.error("Pharmacy verification error:", error)
    return NextResponse.json({ 
      error: "Failed to submit pharmacy verification" 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({
      where: { userId: user.id },
      include: {
        specializations: {
          include: {
            medicineOrigin: {
              select: {
                id: true,
                name: true,
                displayName: true
              }
            }
          }
        }
      }
    })

    if (!pharmacy) {
      return NextResponse.json({ 
        hasPharmacy: false,
        verificationStatus: null,
        isVerified: false
      })
    }

    return NextResponse.json({
      hasPharmacy: true,
      verificationStatus: pharmacy.status,
      isVerified: pharmacy.isVerified,
      isApprovedByAdmin: pharmacy.isApprovedByAdmin,
      pharmacy: {
        id: pharmacy.id,
        pharmacyName: pharmacy.pharmacyName,
        licenseNumber: pharmacy.licenseNumber,
        description: pharmacy.description,
        address: pharmacy.address,
        phone: pharmacy.phone,
        email: pharmacy.email,
        website: pharmacy.website,
        openingHours: pharmacy.openingHours,
        is24Hours: pharmacy.is24Hours,
        deliveryAvailable: pharmacy.deliveryAvailable,
        emergencyContact: pharmacy.emergencyContact,
        pharmacistOnDuty: pharmacy.pharmacistOnDuty,
        responseTime: pharmacy.responseTime,
        licenseDocument: pharmacy.licenseDocument,
        storeFrontImage: pharmacy.storeFrontImage,
        ownerPhoto: pharmacy.ownerPhoto,
        specializations: pharmacy.specializations,
        status: pharmacy.status,
        isVerified: pharmacy.isVerified,
        isApprovedByAdmin: pharmacy.isApprovedByAdmin,
        approvalDate: pharmacy.approvalDate,
        rejectedAt: pharmacy.rejectedAt,
        rejectionReason: pharmacy.rejectionReason,
        createdAt: pharmacy.createdAt,
        updatedAt: pharmacy.updatedAt
      }
    })
  } catch (error) {
    console.error("Pharmacy verification status error:", error)
    return NextResponse.json({ 
      error: "Failed to get verification status" 
    }, { status: 500 })
  }
}
