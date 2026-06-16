import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RideBookingDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Ride tracking" path={`/riding/bookings/${params.id}`} />
}
