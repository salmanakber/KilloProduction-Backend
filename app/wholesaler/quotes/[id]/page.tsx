import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function WholesalerQuoteDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Wholesaler quote" path={`/wholesaler/quotes/${params.id}`} />
}
