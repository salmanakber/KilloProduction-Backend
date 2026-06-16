import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RiderFeedbackDeepLinkPage() {
  return (
    <AppOpenClient title="Leave feedback" path="/riderfeedback" preserveQuery={true} />
  )
}
