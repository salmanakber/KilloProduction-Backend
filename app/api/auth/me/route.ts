import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { authUserModuleInclude, formatAuthUserPayload } from "@/lib/auth-user-modules"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: authUserModuleInclude,
    })

    if (!fullUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      user: formatAuthUserPayload(fullUser),
    })
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
