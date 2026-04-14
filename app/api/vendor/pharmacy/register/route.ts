import { type NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { cloudinary } from "@/lib/cloudinary"
import { sendEmailFromTemplate } from "@/lib/email"

async function uploadToCloudinary(file: File, folder = "pharmacies") {
  const buffer = Buffer.from(await file.arrayBuffer())
  return await new Promise<string>((resolve, reject) => {
    cloudinary.uploader
      .upload_stream({ folder }, (err, result) => {
        if (err || !result) return reject(err)
        resolve(result.secure_url)
      })
      .end(buffer)
  })
}

async function handlePharmacyJsonRegister(request: NextRequest) {
  try {
    const data = (await request.json()) as Record<string, unknown>
    const pharmacyName = data.pharmacyName as string
    const ownerName = (data.ownerName as string) || pharmacyName
    const email = data.email as string
    const phone = data.phone as string
    const address = data.address as string
    const latitude = data.latitude as string | undefined
    const longitude = data.longitude as string | undefined
    const licenseNumber = data.licenseNumber as string
    const description = (data.description as string) || ""
    const emergencyContact = (data.emergencyContact as string) || ""
    const medicineTypes = Array.isArray(data.medicineTypes)
      ? (data.medicineTypes as string[])
      : []
    const operatingHours = (data.operatingHours as Record<string, unknown>) || {}

    if (!pharmacyName || !ownerName || !email || !phone || !licenseNumber || !address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { phone }],
      },
    })
    if (existingUser) {
      return NextResponse.json({ error: "User with this email or phone already exists" }, { status: 400 })
    }

    const existingLicense = await prisma.pharmacy.findUnique({ where: { licenseNumber } })
    if (existingLicense) {
      return NextResponse.json({ error: "Pharmacy with this license number already exists" }, { status: 400 })
    }

    const generatedPassword = crypto.randomBytes(6).toString("hex")
    const hashedPassword = await bcrypt.hash(generatedPassword, 12)

    const result = await prisma.$transaction(async (tx) => {
      const defaultCurrency = await tx.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
      const user = await tx.user.create({
        data: {
          email,
          phone,
          name: ownerName,
          role: "VENDOR",
          isVerified: false,
          isActive: false,
          password: hashedPassword,
          userSettings: {
            create: { currency: currencyCode },
          },
          wallet: {
            create: {
              balance: 0,
              currency: currencyCode,
            },
          },
        },
      })

      const pharmacy = await tx.pharmacy.create({
        data: {
          userId: user.id,
          pharmacyName,
          licenseNumber,
          address,
          lat: latitude ? parseFloat(latitude) : null,
          lon: longitude ? parseFloat(longitude) : null,
          phone,
          email,
          description: description || null,
          emergencyContact: emergencyContact || null,
          licenseDocument: null,
          storeFrontImage: null,
          ownerPhoto: null,
          openingHours: operatingHours as Prisma.InputJsonValue,
          deliveryAvailable: true,
          isVerified: false,
          isApprovedByAdmin: false,
          specialties: medicineTypes as Prisma.InputJsonValue,
        },
      })

      return { user, pharmacy }
    })

    try {
      await sendEmailFromTemplate(
        email,
        "ACCOUNT_CREATION_PHARMACY",
        {
          app_name: process.env.APP_NAME || "Killo",
          pharmacy_name: pharmacyName,
          current_year: new Date().getFullYear().toString(),
          username: ownerName,
          password: generatedPassword,
          support_email: process.env.SUPPORT_EMAIL || "support@killo.com",
        },
        "PHARMACY",
        "ACCOUNT"
      )
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError)
    }

    return NextResponse.json(
      {
        message: "Pharmacy registered successfully. Awaiting admin approval.",
        generatedPassword,
        pharmacyId: result.pharmacy.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Pharmacy JSON registration error:", error)
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("application/json")) {
    return handlePharmacyJsonRegister(request)
  }

  try {
    const formData = await request.formData()
    const pharmacyName = formData.get("pharmacyName") as string
    const ownerName = formData.get("ownerName") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const address = formData.get("address") as string
    const latitude = formData.get("latitude") as string | null
    const longitude = formData.get("longitude") as string | null
    const licenseNumber = formData.get("licenseNumber") as string
    const description = formData.get("description") as string
    const emergencyContact = formData.get("emergencyContact") as string

    const rawOperatingHours = formData.get("operatingHours") as string
    const rawMedicineTypes = formData.get("medicineTypes") as string
    const rawIllnessTypes = formData.get("illnessTypes") as string | null

    const medicineOrigins = rawMedicineTypes ? JSON.parse(rawMedicineTypes) : []
    const operatingHours = rawOperatingHours ? JSON.parse(rawOperatingHours) : {}
    const illnessTypes = rawIllnessTypes ? JSON.parse(rawIllnessTypes) : []

    const licenseFile = formData.get("license") as File | null
    const storeFront = formData.get("storeFront") as File | null
    const ownerPhoto = formData.get("ownerPhoto") as File | null

    // Upload to Cloudinary
    const licenseUrl = licenseFile ? await uploadToCloudinary(licenseFile, "pharmacy_license") : ""
    const storeFrontUrl = storeFront ? await uploadToCloudinary(storeFront, "pharmacy_storefront") : ""
    const ownerPhotoUrl = ownerPhoto ? await uploadToCloudinary(ownerPhoto, "pharmacy_owner") : ""

    if (!pharmacyName || !ownerName || !email || !phone || !licenseNumber) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { phone },
        ],
      },
    })
    if (existingUser) {
      return NextResponse.json({ error: "User with this email or phone already exists" }, { status: 400 })
    }

    const existingLicense = await prisma.pharmacy.findUnique({ where: { licenseNumber } })
    if (existingLicense) {
      return NextResponse.json({ error: "Pharmacy with this license number already exists" }, { status: 400 })
    }

    const generatedPassword = crypto.randomBytes(6).toString("hex")
    const hashedPassword = await bcrypt.hash(generatedPassword, 12)

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          phone,
          name: ownerName,
          role: "VENDOR",
          isVerified: false,
          isActive: false,
          password: hashedPassword,
          userSettings: {
            create: {},
          },
          wallet: {
            create: {
              balance: 0,
              currency: process.env.DEFAULT_CURRENCY || "NGN",
            },
          },
        },
      })

      const pharmacy = await tx.pharmacy.create({
        data: {
          userId: user.id,
          pharmacyName,
          licenseNumber,
          address,
          lat: latitude ? parseFloat(latitude) : null,
          lon: longitude ? parseFloat(longitude) : null,
          phone,
          email,
          description,
          emergencyContact,
          licenseDocument: licenseUrl,
          storeFrontImage: storeFrontUrl,
          ownerPhoto: ownerPhotoUrl,
          openingHours: operatingHours,
          deliveryAvailable: true,
          isVerified: false,
          isApprovedByAdmin: false,
          specializations: {
            create: medicineOrigins.map((originId: string) => ({
              medicineOriginId: originId,
              illnessTypes,
            })),
          },
        },
        include: { specializations: true },
      })

      return { user, pharmacy }
    })

    // Send welcome email
    try {
      await sendEmailFromTemplate(email, "ACCOUNT_CREATION_PHARMACY", {
        app_name: process.env.APP_NAME || 'Killo',
        pharmacy_name: pharmacyName,
        current_year: new Date().getFullYear().toString(),
        username: ownerName,
        password: generatedPassword,
        support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
      }, "PHARMACY" , "ACCOUNT")
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json(
      {
        message: "Pharmacy registered successfully. Awaiting admin approval.",
        generatedPassword,
        pharmacyId: result.pharmacy.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Pharmacy registration error:", error)
    return NextResponse.json({ error: "Registration failed. Please try again." }, { status: 500 })
  }
}
