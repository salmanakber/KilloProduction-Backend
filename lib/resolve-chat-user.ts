import { type NextRequest } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions, authenticateRequest } from "@/lib/auth"

export async function resolveChatUserId(request: NextRequest): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (session?.user?.id) return session.user.id
  const user = await authenticateRequest(request)
  return user?.id ?? null
}
