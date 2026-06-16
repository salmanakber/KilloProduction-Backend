import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function PropertyReviewDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Review your stay" path={`/property/review/${params.id}`} />
}
