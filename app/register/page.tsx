import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RegisterDeepLinkPage() {
  return <AppOpenClient title="Join Kilo" path="/register" preserveQuery={true} />
}
