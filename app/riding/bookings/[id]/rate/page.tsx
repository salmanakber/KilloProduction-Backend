import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RideBookingRateDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient
      title="Rate your ride"
      path={`/riding/bookings/${params.id}/rate`}
      preserveQuery={true}
    />
  )
}
