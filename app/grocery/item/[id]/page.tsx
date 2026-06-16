import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function GroceryItemDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient title="Product on Kilo" path={`/grocery/item/${params.id}`} />
  )
}
