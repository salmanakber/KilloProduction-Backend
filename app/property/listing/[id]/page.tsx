import PropertyListingOpenClient from "./PropertyListingOpenClient"

export default function PropertyListingDeepLinkPage({ params }: { params: { id: string } }) {
  return <PropertyListingOpenClient listingId={params.id} />
}
