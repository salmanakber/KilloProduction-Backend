import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function ReviewsDeepLinkPage() {
  return (
    <AppOpenClient title="Reviews on Kilo" path="/reviews" preserveQuery={true} />
  )
}
