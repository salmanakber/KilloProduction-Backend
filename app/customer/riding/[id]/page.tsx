import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function CustomerRidingDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Your ride" path={`/customer/riding/${params.id}`} />
}
