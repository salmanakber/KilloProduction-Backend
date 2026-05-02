import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

/** Placeholder for future DB-backed templates; system notices are composed inline in the broadcast UI. */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    return NextResponse.json({
      templates: [] as Array<{
        id: string
        name: string
        type: string
        subject: string
        content: string
        variables: string[]
        isActive: boolean
      }>,
    })
  } catch (e) {
    console.error("notification templates:", e)
    return NextResponse.json({ error: "Failed to load templates" }, { status: 500 })
  }
}
