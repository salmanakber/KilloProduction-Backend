import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function OrderDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient title="Order on Kilo" path={`/orders/${params.id}`} />
  )
}
