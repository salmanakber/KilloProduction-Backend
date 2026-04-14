import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const categories = await prisma.medicineCategory.findMany({
      include: {
        _count: {
          select: {
            medicines: true,
          },
        },
      },
      orderBy: { name: "asc" },
    })

    return NextResponse.json({ categories })
  } catch (error) {
    console.error("Error fetching medicine categories:", error)
    return NextResponse.json({ error: "Failed to fetch medicine categories" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    const { name, description, requiresPrescription, isControlled } = await request.json()

    if (!name) {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 })
    }

    const category = await prisma.medicineCategory.create({
      data: {
        name,
        description,
        requiresPrescription: requiresPrescription ?? false,
        isControlled: isControlled ?? false,
      },
    })

    // Log admin action
    await prisma.adminAuditLog.create({
      data: {
        adminId: session.user.id,
        action: "CREATE_MEDICINE_CATEGORY",
        module: "PHARMACY",
        details: JSON.stringify({
          categoryId: category.id,
          categoryName: name,
        }),
      },
    })

    return NextResponse.json({ category }, { status: 201 })
  } catch (error) {
    console.error("Error creating medicine category:", error)
    return NextResponse.json({ error: "Failed to create medicine category" }, { status: 500 })
  }
}
