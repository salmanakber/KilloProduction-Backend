import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function GroceryOrderDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Grocery order" path={`/grocery/orders/${params.id}`} />
}
