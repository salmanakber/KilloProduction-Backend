import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"

export async function POST(request: NextRequest) {
  try {
    const data = await request.json()

    const {
      firstName,
      lastName,
      phone,
      email,
      nationalId,
      emergencyContact,
      vehicleType,
      vehicleBrand,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      licensePlate,
      licenseNumber,
      licenseExpiry,
      insurance,
      insuranceExpiry,
      serviceTypes,
      modules,
      maxDeliveryDistance,
      vehiclePhotos,
      licensePhoto,
      insurancePhoto,
      nationalIdPhoto,
      selfiePhoto,
    } = data

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phone }, { email }],
      },
    })

    if (existingUser) {
      return NextResponse.json({ error: "User already exists with this phone or email" }, { status: 400 })
    }

    // Generate OTP for verification
    const otp = generateOTP()

    // Create user with rider profile
    const user = await prisma.user.create({
      data: {
        phone,
        email,
        name: `${firstName} ${lastName}`,
        role: "RIDER",
        userProfile: {
          create: {
            firstName,
            lastName,
          },
        },
        userSettings: {
          create: {},
        },
        wallet: {
          create: {
            balance: 0,
          },
        },
        riderProfile: {
          create: {
            vehicleType,
            vehicleBrand,
            vehicleModel,
            vehicleYear,
            vehicleColor,
            licensePlate: licensePlate.toUpperCase(),
            licenseNumber,
            licenseExpiry: new Date(licenseExpiry),
            insurance,
            insuranceExpiry: insuranceExpiry ? new Date(insuranceExpiry) : null,
            nationalId,
            emergencyContact,
            serviceTypes,
            modules: modules || [],
            maxDeliveryDistance: Number.parseFloat(maxDeliveryDistance) || 15,
            vehiclePhotos: vehiclePhotos || [],
            licensePhoto,
            insurancePhoto,
            nationalIdPhoto,
            selfiePhoto,
            documentsComplete: true,
            isApproved: false, // Requires admin approval
            isVerified: false,
            isAvailable: false,
            isOnline: false,
          },
        },
      },
      include: {
        riderProfile: true,
      },
    })

    // Send OTP for phone verification
    if (phone) {
      await sendOTP(phone, otp)
    }

    // TODO: Send notification to admin for approval
    // TODO: Send welcome email to rider

    return NextResponse.json({
      message: "Rider registration submitted successfully. Please verify your phone number.",
      userId: user.id,
      requiresVerification: true,
      requiresApproval: true,
    })
  } catch (error) {
    console.error("Rider registration error:", error)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}
