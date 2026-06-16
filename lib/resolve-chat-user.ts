import { type NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authenticateRequest } from "@/lib/auth"

/**
 * Resolve the current user for chat API routes.
 * Mobile sends Bearer JWT; web admin may use next-auth cookies.
 * NextAuth is optional so missing NEXTAUTH_SECRET does not break mobile chat.
 */
export async function resolveChatUserId(request: NextRequest): Promise<string | null> {
  const user = await authenticateRequest(request)
  if (user?.id) return user.id

  if (!process.env.NEXTAUTH_SECRET) return null

  try {
    const session = await getServerSession()
    if (session?.user?.id) return session.user.id
  } catch (err) {
    console.warn("resolveChatUserId: next-auth session unavailable", err)
  }

  return null
}
