import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function PayDeepLinkPage() {
  return (
    <AppOpenClient title="Pay with Kilo" path="/pay" preserveQuery={true} />
  )
}
