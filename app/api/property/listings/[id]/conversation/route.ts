import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { ensurePropertyListingConversation } from "@/lib/property-chat"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const conversation = await ensurePropertyListingConversation(params.id, user.id)
    const enriched = await import("@/lib/prisma").then(({ prisma }) =>
      prisma.conversation.findUnique({
        where: { id: conversation.id },
        include: {
          customer: { select: { id: true, name: true, avatar: true } },
          vendor: {
            select: {
              id: true,
              name: true,
              avatar: true,
              vendorProfile: { select: { businessName: true } },
            },
          },
        },
      })
    )
    return NextResponse.json({ success: true, conversation: enriched || conversation })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to open conversation" },
      { status: 400 }
    )
  }
}
