import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/adminAuth"

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { error } = await requireAdmin()
  if (error) return error

  try {
    const profile = await prisma.mechanicProfile.findUnique({
      where: { id: params.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isVerified: true,
            isActive: true,
            status: true,
            createdAt: true,
          },
        },
        expertise: true,
        _count: {
          select: {
            serviceRequests: true,
            reviews: true,
          },
        },
      },
    })

    if (!profile) {
      return NextResponse.json({ error: "Mechanic profile not found" }, { status: 404 })
    }

    return NextResponse.json({
      mechanic: profile,
      summary: {
        totalServiceRequests: profile._count.serviceRequests,
        totalReviews: profile._count.reviews,
      },
    })
  } catch (e) {
    console.error("Admin mechanic detail GET:", e)
    return NextResponse.json({ error: "Failed to load mechanic" }, { status: 500 })
  }
}
