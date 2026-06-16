import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function PharmacyQuoteDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Pharmacy quote" path={`/pharmacy/quotes/${params.id}`} />
}
