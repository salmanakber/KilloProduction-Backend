import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateFromCookie } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const config = await prisma.firebaseConfig.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" }
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error("Firebase config fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch Firebase configuration" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()

    // Validate required fields
    const requiredFields = ["projectId", "projectName", "apiKey", "authDomain", "storageBucket", "messagingSenderId", "appId"]
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    // Deactivate all existing configs
    await prisma.firebaseConfig.updateMany({
      where: { isActive: true },
      data: { isActive: false }
    })

    // Create new config
    const config = await prisma.firebaseConfig.create({
      data: {
        projectId: data.projectId,
        projectName: data.projectName,
        apiKey: data.apiKey,
        authDomain: data.authDomain,
        storageBucket: data.storageBucket,
        messagingSenderId: data.messagingSenderId,
        appId: data.appId,
        measurementId: data.measurementId,
        isActive: true
      }
    })

    return NextResponse.json({ config }, { status: 201 })
  } catch (error) {
    console.error("Firebase config creation error:", error)
    return NextResponse.json({ error: "Failed to create Firebase configuration" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const data = await request.json()
    const { id } = data

    if (!id) {
      return NextResponse.json({ error: "Configuration ID is required" }, { status: 400 })
    }

    // Validate required fields
    const requiredFields = ["projectId", "projectName", "apiKey", "authDomain", "storageBucket", "messagingSenderId", "appId"]
    for (const field of requiredFields) {
      if (!data[field]) {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 })
      }
    }

    // If this config is being set as active, deactivate others
    if (data.isActive) {
      await prisma.firebaseConfig.updateMany({
        where: { 
          isActive: true,
          id: { not: id }
        },
        data: { isActive: false }
      })
    }

    // Update config
    const config = await prisma.firebaseConfig.update({
      where: { id },
      data: {
        projectId: data.projectId,
        projectName: data.projectName,
        apiKey: data.apiKey,
        authDomain: data.authDomain,
        storageBucket: data.storageBucket,
        messagingSenderId: data.messagingSenderId,
        appId: data.appId,
        measurementId: data.measurementId,
        isActive: data.isActive
      }
    })

    return NextResponse.json({ config })
  } catch (error) {
    console.error("Firebase config update error:", error)
    return NextResponse.json({ error: "Failed to update Firebase configuration" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await authenticateFromCookie(request)
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Configuration ID is required" }, { status: 400 })
    }

    await prisma.firebaseConfig.delete({
      where: { id }
    })

    return NextResponse.json({ message: "Firebase configuration deleted successfully" })
  } catch (error) {
    console.error("Firebase config deletion error:", error)
    return NextResponse.json({ error: "Failed to delete Firebase configuration" }, { status: 500 })
  }
}
