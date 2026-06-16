import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RiderBookingDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Rider booking" path={`/rider/booking/${params.id}`} />
}
