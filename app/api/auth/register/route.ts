import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"
import bcrypt from "bcryptjs"
import {
  getPasswordPolicyFromSettings,
  validatePasswordAgainstPolicy,
} from "@/lib/password-policy"
import { authUserModuleInclude, getUserModules } from "@/lib/auth-user-modules"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      phone,
      email,
      name: nameRaw,
      firstName,
      lastName,
      password,
      role = "CUSTOMER",
      modules = [],
    } = body

    const name =
      typeof nameRaw === "string" && nameRaw.trim()
        ? nameRaw.trim()
        : [firstName, lastName].filter(Boolean).join(" ").trim()

    // Validate required fields
    if (!phone && !email) {
      return NextResponse.json({ error: "Phone number or email is required" }, { status: 400 })
    }

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    if (password && typeof password === "string") {
      const sys = await prisma.systemSettings.findFirst()
      const rules = getPasswordPolicyFromSettings(sys)
      const v = validatePasswordAgainstPolicy(password, rules)
      if (!v.ok) {
        return NextResponse.json({ error: v.message }, { status: 400 })
      }
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
      ...(password && typeof password === "string"
        ? { password: await bcrypt.hash(password, 12) }
        : {}),
      userProfile: {
        create: {
          firstName: firstName || name?.split(" ")[0],
          lastName: lastName || name?.split(" ").slice(1).join(" "),
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

      const wantsProperty =
        modules.includes("property") ||
        modules.includes("PROPERTY") ||
        modules.includes("property-host")
      if (wantsProperty) {
        userData.vendorProfile = {
          create: {
            businessName: `${name}'s Properties`,
            businessType: "Property Host",
            address: "To be updated",
            city: "To be updated",
            state: "To be updated",
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
      include: authUserModuleInclude,
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
      requiresOTP: true,
      role: user.role,
      modules: getUserModules(user),
    })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json({ error: "Registration failed" }, { status: 500 })
  }
}
