import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function RiderLiveMapDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Live map" path={`/rider/live-map/${params.id}`} />
}
