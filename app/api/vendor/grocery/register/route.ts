import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { cloudinary } from "@/lib/cloudinary"
import { sendEmailFromTemplate } from "@/lib/email"

async function uploadToCloudinary(file: File, folder = "grocery") {
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
    const storeName = formData.get("storeName") as string
    const storeType = formData.get("storeType") as string
    const ownerName = formData.get("ownerName") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const password = formData.get("password") as string
    const address = formData.get("address") as string
    const latitude = formData.get("latitude") as string | null
    const longitude = formData.get("longitude") as string | null
    const description = formData.get("description") as string
    const businessRegistration = formData.get("businessRegistration") as string | null
    const tradeLicense = formData.get("tradeLicense") as string | null
    const healthPermit = formData.get("healthPermit") as string | null
    const storeSize = formData.get("storeSize") as string | null
    const numberOfEmployees = formData.get("numberOfEmployees") as string | null
    const productCategories = formData.get("productCategories") as string

    const rawOperatingHours = formData.get("operatingHours") as string

    const operatingHours = rawOperatingHours ? JSON.parse(rawOperatingHours) : {}
    const categories = productCategories ? JSON.parse(productCategories) : []

    const businessLicenseFile = formData.get("businessLicense") as File | null
    const tradeLicenseFile = formData.get("tradeLicense") as File | null
    const storeFrontFile = formData.get("storeFront") as File | null
    const storeInteriorFile = formData.get("storeInterior") as File | null
    const productSampleFile = formData.get("productSample") as File | null

    if (!storeName || !storeType || !ownerName || !email || !phone || !password || !address) {
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
    const businessLicenseUrl = businessLicenseFile ? await uploadToCloudinary(businessLicenseFile, "grocery/licenses") : null
    const tradeLicenseUrl = tradeLicenseFile ? await uploadToCloudinary(tradeLicenseFile, "grocery/licenses") : null
    const storeFrontUrl = storeFrontFile ? await uploadToCloudinary(storeFrontFile, "grocery/storefronts") : null
    const storeInteriorUrl = storeInteriorFile ? await uploadToCloudinary(storeInteriorFile, "grocery/interiors") : null
    const productSampleUrl = productSampleFile ? await uploadToCloudinary(productSampleFile, "grocery/samples") : null

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

      const groceryStore = await tx.groceryStore.create({
        data: {
          userId: user.id,
          storeName,
          description: description || null,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          phone,
          email,
          storeType: storeType ? [storeType] : undefined,
          openingHours: operatingHours,
          isVerified: false,
          isOpen: true,
          deliveryFee: 0,
          minOrderAmount: 0,
          maxDeliveryDistance: 15,
          businessLicense: businessLicenseUrl,
          tradeLicense: tradeLicenseUrl,
          storeFront: storeFrontUrl,
          storeInterior: storeInteriorUrl,
          productSample: productSampleUrl,
          businessRegistration: businessRegistration || null,
          healthPermit: healthPermit || null,
          storeSize: storeSize || null,
          numberOfEmployees: numberOfEmployees || null,
          productCategories: categories.length > 0 ? categories : null,
        },
      })

      return { user, groceryStore }
    })

    // Send welcome email
    try {
      await sendEmailFromTemplate(email, "CREATE_ACCOUNT_GROCERY", {
        app_name: process.env.APP_NAME || 'Killo',
        current_year: new Date().getFullYear().toString(),
        user_name: ownerName,
      }, "GROCERY" , "ACCOUNT")
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json(
      {
        message: "Grocery store registered successfully. Awaiting admin approval.",
        storeId: result.groceryStore.id,
        userId: result.user.id,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Grocery registration error:", error)
    return NextResponse.json(
      { error: error.message || "Registration failed. Please try again." },
      { status: 500 }
    )
  }
}
