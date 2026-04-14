import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Return configuration settings (for now, using environment variables)
    const configurations = {
      "GOOGLE_MAPS": [
        {
          id: "google_maps_api_key",
          key: "GOOGLE_MAPS_API_KEY",
          value: process.env.GOOGLE_MAPS_API_KEY || "",
          description: "Google Maps API Key for distance calculation and geocoding",
          category: "GOOGLE_MAPS",
          isActive: true
        }
      ],
      "PAYMENT": [
        {
          id: "stripe_secret_key",
          key: "STRIPE_SECRET_KEY",
          value: process.env.STRIPE_SECRET_KEY ? "***CONFIGURED***" : "",
          description: "Stripe Secret Key for payment processing",
          category: "PAYMENT",
          isActive: true
        },
        {
          id: "paystack_secret_key",
          key: "PAYSTACK_SECRET_KEY",
          value: process.env.PAYSTACK_SECRET_KEY ? "***CONFIGURED***" : "",
          description: "Paystack Secret Key for payment processing",
          category: "PAYMENT",
          isActive: true
        }
      ],
      "NOTIFICATIONS": [
        {
          id: "expo_access_token",
          key: "EXPO_ACCESS_TOKEN",
          value: process.env.EXPO_ACCESS_TOKEN ? "***CONFIGURED***" : "",
          description: "Expo Access Token for push notifications",
          category: "NOTIFICATIONS",
          isActive: true
        }
      ]
    }

    return NextResponse.json({
      configurations,
      message: "Configuration settings retrieved successfully"
    })
  } catch (error) {
    console.error("Configuration fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch configuration" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({
      message: "Configuration settings are managed through environment variables. Please update your .env file."
    }, { status: 200 })
  } catch (error) {
    console.error("Configuration save error:", error)
    return NextResponse.json({ error: "Failed to save configuration" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({
      message: "Configuration settings are managed through environment variables. Please update your .env file."
    }, { status: 200 })
  } catch (error) {
    console.error("Configuration update error:", error)
    return NextResponse.json({ error: "Failed to update configuration" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json({
      message: "Configuration settings are managed through environment variables."
    }, { status: 200 })
  } catch (error) {
    console.error("Configuration delete error:", error)
    return NextResponse.json({ error: "Failed to delete configuration" }, { status: 500 })
  }
}
