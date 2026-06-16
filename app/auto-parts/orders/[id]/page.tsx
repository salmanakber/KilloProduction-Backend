import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function AutoPartsOrderDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Auto parts order" path={`/auto-parts/orders/${params.id}`} />
}
