import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const pharmacy = await prisma.pharmacy.findUnique({ where: { userId: user.id } })
    if (!pharmacy) {
      return NextResponse.json({ error: "Pharmacy not found" }, { status: 404 })
    }

    if (!pharmacy.isVerified) {
      return NextResponse.json(
        { error: "Pharmacy account must be verified before adding medicines", code: "VERIFICATION_REQUIRED" },
        { status: 403 },
      )
    }

    const body = await request.json()
    const centralMedicineId = String(body?.centralMedicineId || "").trim()
    const price = Number(body?.price)
    const stock = Number(body?.stock)
    const minStock = body?.minStock != null ? Number(body.minStock) : undefined
    const isAvailable = body?.isAvailable != null ? Boolean(body.isAvailable) : undefined
    const expiryDate = body?.expiryDate ? new Date(body.expiryDate) : undefined
    const batchNumber = body?.batchNumber ? String(body.batchNumber) : undefined

    if (!centralMedicineId) {
      return NextResponse.json({ error: "centralMedicineId is required" }, { status: 400 })
    }
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json({ error: "price must be > 0" }, { status: 400 })
    }
    if (!Number.isFinite(stock) || stock < 0) {
      return NextResponse.json({ error: "stock must be >= 0" }, { status: 400 })
    }
    if (expiryDate && Number.isNaN(expiryDate.getTime())) {
      return NextResponse.json({ error: "expiryDate is invalid" }, { status: 400 })
    }

    // Ensure central medicine exists and active
    const cm = await prisma.centralMedicine.findUnique({
      where: { id: centralMedicineId },
      select: { id: true, isActive: true },
    })
    if (!cm || cm.isActive === false) {
      return NextResponse.json({ error: "Central medicine not found" }, { status: 404 })
    }

    try {
      const created = await prisma.pharmacyMedicine.create({
        data: {
          pharmacyId: pharmacy.id,
          centralMedicineId,
          price,
          stock,
          minStock: Number.isFinite(minStock as number) ? (minStock as number) : undefined,
          isAvailable: isAvailable !== undefined ? isAvailable : true,
          expiryDate: expiryDate || undefined,
          batchNumber: batchNumber || undefined,
        },
        include: { centralMedicine: true },
      })
      return NextResponse.json({ success: true, medicine: created }, { status: 201 })
    } catch (e: any) {
      // Unique constraint: already added
      const msg = String(e?.message || "")
      if (msg.includes("Unique constraint") || msg.includes("unique") || msg.includes("P2002")) {
        return NextResponse.json({ error: "Medicine already exists in your inventory" }, { status: 409 })
      }
      throw e
    }
  } catch (error) {
    console.error("Pharmacy manual add error:", error)
    return NextResponse.json({ error: "Failed to add medicine" }, { status: 500 })
  }
}

