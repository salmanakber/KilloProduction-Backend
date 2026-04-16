import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({ where: { userId: user.id } })
    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get("q") || "").trim()
    const limit = Math.min(30, Math.max(1, Number(searchParams.get("limit") || 20)))

    const where: any = {
      isActive: true,
      pharmacyMedicines: { none: { pharmacyId: pharmacy.id } },
    }
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { genericName: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { manufacturer: { contains: q, mode: "insensitive" } },
      ]
    }

    const medicines = await prisma.centralMedicine.findMany({
      where,
      take: limit,
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        genericName: true,
        category: true,
        form: true,
        strength: true,
        manufacturer: true,
        images: true,
      },
    })

    return NextResponse.json({ medicines })
  } catch (error) {
    console.error("Pharmacy catalog fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch catalog" }, { status: 500 })
  }
}

