import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RiderDeliveryDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Delivery job" path={`/rider/deliveries/${params.id}`} />
}
