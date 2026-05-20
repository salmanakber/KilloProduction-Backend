import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"
import { sendEmailFromTemplate } from "@/lib/email"
import { systemSettings as getSystemSettings } from "@/lib/systemSettings"

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { email } = await request.json()
    const normalizedEmail = String(email || "").trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return NextResponse.json({ error: "Valid email is required." }, { status: 400 })
    }

    const systemSettings = await getSystemSettings()
    const appUrl = systemSettings.appUrl || "https://kilo.com"
    const senderName = systemSettings.appName || "Kilo"
    const adminContact = systemSettings.companyInfo?.supportCenter?.email || "support@killo.com"
    const emailData = {
      title: "You are invited to Kilo Money Transfer",
      message: `${senderName} invited you to join Kilo Money Transfer so they can send money to you instantly. Add your bank account after signup to receive transfers.`,
      actionUrl: `${appUrl}/register`,
      actionText: "Join Kilo",
      adminContact,
    }
    await sendEmailFromTemplate(normalizedEmail, "INVITE_BY_MONEY_TRANSFER", emailData, "GLOBAL", "INVITATION")
    return NextResponse.json({ success: true, message: "Invitation sent successfully." })
  } catch (error: any) {
    console.error("Error sending invite email:", error)
    return NextResponse.json({ error: error.message || "Failed to send invitation" }, { status: 500 })
  }
}
