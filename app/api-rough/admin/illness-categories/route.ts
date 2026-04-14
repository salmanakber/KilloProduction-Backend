import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const isCommon = searchParams.get("common") === "true"

    const where: any = { isActive: true }
    if (isCommon) {
      where.isCommon = true
    }

    const illnesses = await prisma.illnessCategory.findMany({
      where,
      orderBy: [{ isCommon: "desc" }, { name: "asc" }],
    })

    return NextResponse.json({ illnesses })
  } catch (error) {
    console.error("Illness categories fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch illness categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const data = await request.json()
    const { name, displayName, description, icon, isCommon, symptoms, medicines } = data

    if (!name || !displayName) {
      return NextResponse.json({ error: "Name and display name are required" }, { status: 400 })
    }

    const illness = await prisma.illnessCategory.create({
      data: {
        name: name.toLowerCase(),
        displayName,
        description,
        icon,
        isCommon: isCommon || false,
        symptoms: symptoms || [],
        medicines: medicines || [],
      },
    })

    return NextResponse.json(illness, { status: 201 })
  } catch (error) {
    console.error("Illness category creation error:", error)
    return NextResponse.json({ error: "Failed to create illness category" }, { status: 500 })
  }
}
