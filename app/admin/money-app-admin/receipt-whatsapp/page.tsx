import { redirect } from "next/navigation"

/** @deprecated Configure under Admin → System Settings → Notifications (Money transfer receipts). */
export default function MoneyReceiptWhatsappRedirectPage() {
  redirect("/admin/settings?tab=notifications&moneyReceipts=1")
}
