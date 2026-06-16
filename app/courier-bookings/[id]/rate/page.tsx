import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function CourierBookingRateDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient
      title="Rate your delivery"
      path={`/courier-bookings/${params.id}/rate`}
      preserveQuery={true}
    />
  )
}
