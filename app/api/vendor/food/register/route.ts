import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { cloudinary } from "@/lib/cloudinary"
import { sendEmailFromTemplate } from "@/lib/email"

async function uploadToCloudinary(file: File, folder = "restaurants") {
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
    const restaurantName = formData.get("restaurantName") as string
    const restaurantType = formData.get("restaurantType") as string
    const ownerName = formData.get("ownerName") as string
    const email = formData.get("email") as string
    const phone = formData.get("phone") as string
    const password = formData.get("password") as string
    const address = formData.get("address") as string
    const latitude = formData.get("latitude") as string | null
    const longitude = formData.get("longitude") as string | null
    const description = formData.get("description") as string
    const cuisineTypes = formData.get("cuisineTypes") as string
    const priceRange = formData.get("priceRange") as string
    const seatingCapacity = formData.get("seatingCapacity") as string | null
    const businessRegistration = formData.get("businessRegistration") as string | null
    const foodHandlersCert = formData.get("foodHandlersCert") as string | null
    const fireServiceCert = formData.get("fireServiceCert") as string | null

    const rawOperatingHours = formData.get("operatingHours") as string

    const operatingHours = rawOperatingHours ? JSON.parse(rawOperatingHours) : {}
    const cuisines = cuisineTypes ? JSON.parse(cuisineTypes) : []

    const businessLicenseFile = formData.get("businessLicense") as File | null
    const foodLicenseFile = formData.get("foodLicense") as File | null
    const restaurantFrontFile = formData.get("restaurantFront") as File | null
    const kitchenPhotoFile = formData.get("kitchenPhoto") as File | null
    const menuSampleFile = formData.get("menuSample") as File | null

    if (!restaurantName || !restaurantType || !ownerName || !email || !phone || !password || !address) {
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
    const businessLicenseUrl = businessLicenseFile ? await uploadToCloudinary(businessLicenseFile, "restaurants/licenses") : null
    const foodLicenseUrl = foodLicenseFile ? await uploadToCloudinary(foodLicenseFile, "restaurants/licenses") : null
    const restaurantFrontUrl = restaurantFrontFile ? await uploadToCloudinary(restaurantFrontFile, "restaurants/storefronts") : null
    const kitchenPhotoUrl = kitchenPhotoFile ? await uploadToCloudinary(kitchenPhotoFile, "restaurants/kitchens") : null
    const menuSampleUrl = menuSampleFile ? await uploadToCloudinary(menuSampleFile, "restaurants/menus") : null

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

      const restaurant = await tx.restaurant.create({
        data: {
          userId: user.id,
          name: restaurantName,
          description: description || null,
          address,
          latitude: latitude ? parseFloat(latitude) : null,
          longitude: longitude ? parseFloat(longitude) : null,
          phone,
          email,
          cuisine: cuisines,
          priceRange: priceRange as any || "MODERATE",
          openingHours: operatingHours,
          deliveryTime: "30-45",
          deliveryFee: 0,
          minOrderAmount: 0,
          maxDeliveryDistance: 10,
          isOpen: true,
          isVerified: false,
          businessLicense: businessLicenseUrl,
          foodLicense: foodLicenseUrl,
          restaurantFront: restaurantFrontUrl,
          kitchenPhoto: kitchenPhotoUrl,
          menuSample: menuSampleUrl,
          businessRegistration: businessRegistration || null,
          foodHandlersCert: foodHandlersCert || null,
          fireServiceCert: fireServiceCert || null,
          seatingCapacity: seatingCapacity || null,
        },
      })

      return { user, restaurant }
    })

    // Send welcome email
    try {
      await sendEmailFromTemplate(email, "FOOD_ACCOUNT_CREATION", {
        app_name: process.env.APP_NAME || 'Killo',
        current_year: new Date().getFullYear().toString(),
        restaurant_name: restaurantName,
        support_email: process.env.SUPPORT_EMAIL || 'support@killo.com',
        username: ownerName,
      }, "FOOD" , "ACCOUNT")
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError)
      // Don't fail the request if email fails
    }

    return NextResponse.json(
      {
        message: "Restaurant registered successfully. Awaiting admin approval.",
        restaurantId: result.restaurant.id,
        userId: result.user.id,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error("Restaurant registration error:", error)
    return NextResponse.json(
      { error: error.message || "Registration failed. Please try again." },
      { status: 500 }
    )
  }
}
