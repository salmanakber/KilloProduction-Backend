import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { sendEmail } from "@/lib/email"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { email } = await request.json()
    const normalizedEmail = String(email || "").trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kilo1app.com"
    const senderName = user.name || user.email || "A Kilo user"
    const result = await sendEmail(normalizedEmail, "genericNotification", {
      title: "You are invited to Kilo Money Transfer",
      message: `${senderName} invited you to join Kilo Money Transfer so they can send money to you instantly. Add your bank account after signup to receive transfers.`,
      actionUrl: `${appUrl}/register`,
      actionText: "Join Kilo",
      adminContact: "support@killo.com",
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send invitation email" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Invitation sent successfully." })
  } catch (error: any) {
    console.error("Error sending invite email:", error)
    return NextResponse.json({ error: error.message || "Failed to send invitation" }, { status: 500 })
  }
}
