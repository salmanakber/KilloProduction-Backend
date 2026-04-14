import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { cloudinary } from "@/lib/cloudinary"
import { sendEmailFromTemplate } from "@/lib/email"

async function uploadToCloudinary(file: File, folder = "auto-parts") {
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const businessName = formData.get("businessName") as string
    const businessType = formData.get("businessType") as string
    const ownerName = formData.get("ownerName") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const password = formData.get("password") as string
    const address = formData.get("address") as string
    const latitude = formData.get("latitude") as string | null
    const longitude = formData.get("longitude") as string | null
    const description = formData.get("description") as string
    const registrationNumber = formData.get("registrationNumber") as string | null
    const taxId = formData.get("taxId") as string | null
    const yearsInBusiness = formData.get("yearsInBusiness") as string | null
    const specializations = formData.get("specializations") as string
    const brandsCarried = formData.get("brandsCarried") as string | null

    const rawOperatingHours = formData.get("operatingHours") as string

    const operatingHours = rawOperatingHours ? JSON.parse(rawOperatingHours) : {}
    const specs = specializations ? JSON.parse(specializations) : []

    const businessLicenseFile = formData.get("businessLicense") as File | null
    const storeFrontFile = formData.get("storeFront") as File | null
    const inventoryFile = formData.get("inventory") as File | null

    if (!businessName || !businessType || !ownerName || !email || !phone || !password || !address) {
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

    const hashedPassword = await bcrypt.hash(password, 12)

    // Upload documents to Cloudinary
    const businessLicenseUrl = businessLicenseFile ? await uploadToCloudinary(businessLicenseFile, "auto-parts/licenses") : null
    const storeFrontUrl = storeFrontFile ? await uploadToCloudinary(storeFrontFile, "auto-parts/storefronts") : null
    const inventoryUrl = inventoryFile ? await uploadToCloudinary(inventoryFile, "auto-parts/inventory") : null

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

      const autoPartsStore = await tx.autoPartsStore.create({
        data: {
          userId: user.id,
          storeName: businessName,
          description: description || null,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          phone,
          email,
          businessLicense: businessLicenseUrl,
          storeFront: storeFrontUrl,
          inventory: inventoryUrl,
          isVerified: false,
          isActive: true,
          openingHours: operatingHours,
          registrationNumber: registrationNumber || null,
          taxId: taxId || null,
          yearsInBusiness: yearsInBusiness || null,
          specializations: specs.length > 0 ? specs : null,
          brandsCarried: brandsCarried || null,
        },
      })

      return { user, autoPartsStore }
    })

    // Send welcome email
    try {
      await sendEmailFromTemplate(email, "ACCOUNT_CREATION_AUTOPARTS", {
        app_name: process.env.APP_NAME || 'Killo',
        current_year: new Date().getFullYear().toString(),
        auto_parts_store_name: businessName,
        support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
        username: ownerName,
      }, "AUTO_PARTS" , "ACCOUNT")
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json(
      {
        message: "Auto parts store registered successfully. Awaiting admin approval.",
        storeId: result.autoPartsStore.id,
        userId: result.user.id,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Auto parts registration error:", error)
    return NextResponse.json(
      { error: error.message || "Registration failed. Please try again." },
      { status: 500 }
    )
  }
}
