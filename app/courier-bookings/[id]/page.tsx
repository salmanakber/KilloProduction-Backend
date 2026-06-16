import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function CourierBookingDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Delivery tracking" path={`/courier-bookings/${params.id}`} />
}
