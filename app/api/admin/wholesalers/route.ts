import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"
import { sendEmail } from "@/lib/email"
import { NotificationBridge } from "@/lib/notification-bridge"
import bcrypt from "bcryptjs"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get("search")
    const status = searchParams.get("status")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "20")

    // Build where clause
    const where: any = {}

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { licenseNumber: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
      ]
    }

    if (status === "verified") {
      where.isVerified = true
    } else if (status === "pending") {
      where.isVerified = false
    } else if (status === "active") {
      where.user = { isActive: true }
    }

    const [wholesalers, total] = await Promise.all([
      prisma.wholesaler.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
            },
          },
          _count: {
            select: {
              wholesalerProducts: true,
              supplierOrders: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.wholesaler.count({ where }),
    ])

    return NextResponse.json({
      wholesalers,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Wholesalers fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch wholesalers" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      companyName,
      licenseNumber,
      description,
      address,
      phone,
      email,
      website,
      specialties,
      deliveryZones,
      paymentTerms,
    } = body

    // Validate required fields
    if (!companyName || !licenseNumber || !email || !phone || !address) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Check if license number already exists
    const existingLicense = await prisma.wholesaler.findUnique({
      where: { licenseNumber },
    })
    if (existingLicense) {
      return NextResponse.json(
        { error: "License number already exists" },
        { status: 400 }
      )
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })
    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      )
    }

    // Generate a secure password with better complexity
    const generateSecurePassword = () => {
      const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      const lowercase = 'abcdefghijklmnopqrstuvwxyz'
      const numbers = '0123456789'
      const symbols = '!@#$%^&*'
      
      let password = ''
      // Ensure at least one of each type
      password += uppercase[Math.floor(Math.random() * uppercase.length)]
      password += lowercase[Math.floor(Math.random() * lowercase.length)]
      password += numbers[Math.floor(Math.random() * numbers.length)]
      password += symbols[Math.floor(Math.random() * symbols.length)]
      
      // Fill the rest randomly
      const allChars = uppercase + lowercase + numbers + symbols
      for (let i = 4; i < 12; i++) {
        password += allChars[Math.floor(Math.random() * allChars.length)]
      }
      
      // Shuffle the password
      return password.split('').sort(() => Math.random() - 0.5).join('')
    }
    
    const password = generateSecurePassword()
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user and wholesaler in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const defaultCurrency = await tx.currency.findFirst({ where: { isDefault: true }, select: { code: true } })
      const currencyCode = defaultCurrency?.code || process.env.DEFAULT_CURRENCY || "USD"
      // Create user with complete profile
      const newUser = await tx.user.create({
        data: {
          name: companyName,
          email,
          phone,
          password: hashedPassword,
          role: "WHOLESALER",
          isActive: true,
          isVerified: false, // Will be verified when wholesaler is approved
          // Create user profile
          userProfile: {
            create: {
              firstName: companyName.split(' ')[0] || companyName,
              lastName: companyName.split(' ').slice(1).join(' ') || '',
            }
          },
          // Create user settings
          userSettings: {
            create: {
              pushNotifications: true,
              emailNotifications: true,
              smsNotifications: true,
              language: "en",
              currency: currencyCode,
            }
          },
          // Create wallet
          wallet: {
            create: {
              balance: 0,
              currency: currencyCode,
            }
          }
        },
      })

      // Create wholesaler
      const newWholesaler = await tx.wholesaler.create({
        data: {
          userId: newUser.id,
          companyName,
          licenseNumber,
          description: description || "",
          address,
          phone,
          email,
          website: website || "",
          specialties: specialties || [],
          deliveryZones: deliveryZones || [],
          paymentTerms: paymentTerms || "",
          isVerified: false, // Start as pending verification
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              userSettings: true,
            },
          },
          _count: {
            select: {
              wholesalerProducts: true,
              supplierOrders: true,
            },
          },
        },
      })

      return { user: newUser, wholesaler: newWholesaler, password }
    })

    // Send welcome email with credentials
    try {
      await sendEmail(email, "genericNotification", {
        title: "Welcome to Killo - Your Wholesaler Account is Ready!",
        message: `Your wholesaler account has been created successfully. Here are your login credentials:

Email: ${email}
Password: ${password}

Please change your password after your first login. Your account is currently pending verification and will be reviewed by our team.`,
        email,
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL}/wholesaler/login`,
        actionText: "Login to Dashboard",
        adminContact: process.env.ADMIN_EMAIL || "admin@killo.com"
      })
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError)
      // Don't fail the request if email fails
    }

    // Send notification via NotificationBridge (includes WebSocket and Expo Push)
    try {
      await NotificationBridge.sendNotification({
        userId: result.user.id,
        title: "Wholesaler Account Created",
        message: "Your wholesaler account has been created successfully. Please check your email for login credentials.",
        type: "SYSTEM",
        module: "WHOLESALER",
        data: {
          accountType: "wholesaler",
          status: "pending_verification"
        }
      })
    } catch (notificationError) {
      console.error("Failed to send notification:", notificationError)
      // Don't fail the request if notification fails
    }

    return NextResponse.json({
      message: "Wholesaler created successfully",
      wholesaler: result.wholesaler,
    })
  } catch (error) {
    console.error("Wholesaler creation error:", error)
    return NextResponse.json(
      { error: "Failed to create wholesaler" },
      { status: 500 }
    )
  }
}
