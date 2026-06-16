import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function PharmacyOrderDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Pharmacy order" path={`/pharmacy/orders/${params.id}`} />
}
