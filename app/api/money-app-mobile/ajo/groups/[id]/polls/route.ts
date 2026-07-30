import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { createAjoPoll } from "@/lib/ajo-chat-service"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await authenticateRequest(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const body = await request.json().catch(() => ({}))
    const question = typeof body.question === "string" ? body.question : ""
    const options = Array.isArray(body.options)
      ? body.options.filter((o: unknown) => typeof o === "string")
      : []
    const message = await createAjoPoll({
      groupId: params.id,
      userId: user.id,
      question,
      options,
    })
    return NextResponse.json({ success: true, message })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
