import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"

export async function POST(request: NextRequest) {
  try {
    const { phone, email, name, role = "CUSTOMER", modules = [] } = await request.json()

    // Validate required fields
    if (!phone && !email) {
      return NextResponse.json({ error: "Phone number or email is required" }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ phone }, { email: email || undefined }],
      },
    })

    if (existingUser) {
      return NextResponse.json({ error: "User already exists with this phone or email" }, { status: 400 })
    }

    // Generate OTP
    const otp = generateOTP()
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Create user with role-specific setup
    const userData: any = {
      phone,
      email,
      name,
      role,
      userProfile: {
        create: {
          firstName: name?.split(" ")[0],
          lastName: name?.split(" ").slice(1).join(" "),
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
    }

    // Role-specific setup
    if (role === "VENDOR" && modules.length > 0) {
      // Create vendor stores based on selected modules
      if (modules.includes("auto-parts")) {
        userData.autoPartsStore = {
          create: {
            storeName: `${name}'s Auto Parts Store`,
            address: "To be updated",
            phone: phone || "",
            email: email || "",
            isActive: false, // Requires verification
          },
        }
      }

      if (modules.includes("pharmacy")) {
        userData.pharmacy = {
          create: {
            pharmacyName: `${name}'s Pharmacy`,
            licenseNumber: `TEMP_${Date.now()}`, // To be updated during verification
            address: "To be updated",
            phone: phone || "",
            email: email || "",
            isActive: false, // Requires verification
          },
        }
      }

      if (modules.includes("restaurant")) {
        userData.restaurant = {
          create: {
            name: `${name}'s Restaurant`,
            address: "To be updated",
            phone: phone || "",
            email: email || "",
            cuisine: ["General"],
            deliveryTime: "30-45 mins",
            deliveryFee: 3.99,
            minOrderAmount: 15.0,
            isOpen: false, // Requires setup
            openingHours: {},
          },
        }
      }

      if (modules.includes("grocery")) {
        userData.groceryStore = {
          create: {
            storeName: `${name}'s Grocery Store`,
            address: "To be updated",
            phone: phone || "",
            email: email || "",
            deliveryFee: 2.99,
            minOrderAmount: 10.0,
            isOpen: false, // Requires setup
            openingHours: {},
          },
        }
      }
    }

    if (role === "RIDER") {
      userData.riderProfile = {
        create: {
          vehicleType: "MOTORCYCLE", // Default, to be updated
          licensePlate: "TEMP_PLATE",
          licenseNumber: "TEMP_LICENSE",
          licenseExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          modules: modules.length > 0 ? modules : ["AUTO_PARTS", "PHARMACY", "FOOD", "GROCERY"],
          isAvailable: false, // Requires verification
          deliveryZones: [],
        },
      }
    }

    const user = await prisma.user.create({
      data: userData,
      include: {
        userProfile: true,
        userSettings: true,
        wallet: true,
        autoPartsStore: true,
        pharmacy: true,
        restaurant: true,
        groceryStore: true,
        riderProfile: true,
      },
    })

    // Store OTP temporarily (in production, use Redis)
    // For now, we'll store it in a separate table or use a cache

    // Send OTP
    if (phone) {
      await sendOTP(phone, otp)
    }

    return NextResponse.json({
      message: "Registration successful. OTP sent to your phone.",
      userId: user.id,
      requiresVerification: true,
      role: user.role,
      modules: getUserModules(user),
    })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}

function getUserModules(user: any): string[] {
  const modules = []
  if (user.autoPartsStore) modules.push("AUTO_PARTS")
  if (user.pharmacy) modules.push("PHARMACY")
  if (user.restaurant) modules.push("FOOD")
  if (user.groceryStore) modules.push("GROCERY")
  if (user.riderProfile) modules.push("RIDING")
  return modules
}
