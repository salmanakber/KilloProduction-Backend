import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user || user.role !== "VENDOR") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const store = await prisma.autoPartsStore.findUnique({
      where: { userId: user.id },
    })

    if (!store) {
      return NextResponse.json({ error: "Auto parts store not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get("type") || "matched" // matched, submitted, accepted

    let where: any = {}

    if (type === "matched") {
      // Get part types that this store sells
      const storePartTypes = await prisma.autoPart.findMany({
        where: { storeId: store.id },
        select: { partType: true, category: true },
        distinct: ["partType"],
      })

      where = {
        status: "OPEN",
        OR: [
          {
            partType: {
              in: storePartTypes.map((p) => p.partType),
            },
          },
        ],
      }
    } else if (type === "submitted") {
      where = {
        offers: {
          some: {
            vendorId: user.id,
          },
        },
      }
    } else if (type === "accepted") {
      where = {
        offers: {
          some: {
            vendorId: user.id,
            status: "ACCEPTED",
          },
        },
      }
    }

    const requests = await prisma.partRequest.findMany({
      where,
      include: {
        user: {
          select: {
            name: true,
            phone: true,
          },
        },
        offers: {
          where: type !== "matched" ? { vendorId: user.id } : undefined,
          include: {
            vendor: {
              select: {
                name: true,
                autoPartsStore: {
                  select: {
                    storeName: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            offers: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error("Part requests fetch error:", error)
    return NextResponse.json({ error: "Failed to fetch part requests" }, { status: 500 })
  }
}
