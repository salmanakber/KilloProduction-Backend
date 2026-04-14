import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"

export async function requireAdmin() {
  const session = await authenticateRequest()
  if (!session?.id) {
    return { session: null, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    return { session: null, error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) }
  }
  return { session, error: null }
}
