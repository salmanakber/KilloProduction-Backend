import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

function ownerTypeForRole(role: string | null | undefined): "rider" | "vendor" {
  return role === "RIDER" ? "rider" : "vendor"
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const { searchParams } = new URL(request.url)
    const ownerType = (searchParams.get("ownerType") || "all").toLowerCase()
    const status = (searchParams.get("status") || "all").toLowerCase()
    const search = (searchParams.get("search") || "").trim()
    const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.min(100, Math.max(1, Number.parseInt(searchParams.get("limit") || "20", 10)))
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (status === "verified") {
      where.isVerified = true
    } else if (status === "pending") {
      where.isVerified = false
      where.verificationStatus = "PENDING"
    } else if (status === "rejected") {
      where.verificationStatus = "REJECTED"
    } else if (status === "requires_documents") {
      where.verificationStatus = "REQUIRES_DOCUMENTS"
    }

    if (ownerType === "rider") {
      where.vendor = { role: "RIDER" }
    } else if (ownerType === "vendor") {
      where.vendor = { role: { not: "RIDER" } }
    }

    if (search) {
      where.OR = [
        { accountNumber: { contains: search, mode: "insensitive" } },
        { accountName: { contains: search, mode: "insensitive" } },
        { bankName: { contains: search, mode: "insensitive" } },
        { bankCode: { contains: search, mode: "insensitive" } },
        { routingNumber: { contains: search, mode: "insensitive" } },
        { vendor: { name: { contains: search, mode: "insensitive" } } },
        { vendor: { email: { contains: search, mode: "insensitive" } } },
        { vendor: { phone: { contains: search, mode: "insensitive" } } },
      ]
    }

    const [rows, total, verifiedCount, pendingCount, riderCount, vendorCount] = await Promise.all([
      prisma.vendorBankAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isVerified: "asc" }, { createdAt: "desc" }],
        include: {
          vendor: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              role: true,
            },
          },
        },
      }),
      prisma.vendorBankAccount.count({ where }),
      prisma.vendorBankAccount.count({ where: { ...where, isVerified: true } }),
      prisma.vendorBankAccount.count({ where: { ...where, isVerified: false } }),
      prisma.vendorBankAccount.count({
        where: { ...where, vendor: { role: "RIDER" } },
      }),
      prisma.vendorBankAccount.count({
        where: { ...where, vendor: { role: { not: "RIDER" } } },
      }),
    ])

    const accounts = rows.map((row) => ({
      id: row.id,
      accountName: row.accountName,
      accountNumber: row.accountNumber,
      bankName: row.bankName,
      bankCode: row.bankCode || row.routingNumber || "",
      routingNumber: row.routingNumber,
      swiftCode: row.swiftCode,
      currency: row.currency,
      isPrimary: row.isPrimary,
      isVerified: row.isVerified,
      verificationStatus: row.verificationStatus,
      verificationNotes: row.verificationNotes,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      owner: {
        id: row.vendor.id,
        name: row.vendor.name,
        email: row.vendor.email,
        phone: row.vendor.phone,
        role: row.vendor.role,
        ownerType: ownerTypeForRole(row.vendor.role),
      },
    }))

    return NextResponse.json({
      success: true,
      accounts,
      stats: {
        total,
        verified: verifiedCount,
        pending: pendingCount,
        riders: riderCount,
        vendors: vendorCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    })
  } catch (e) {
    console.error("admin payout-bank-accounts GET:", e)
    return NextResponse.json({ error: "Failed to load payout bank accounts" }, { status: 500 })
  }
}
