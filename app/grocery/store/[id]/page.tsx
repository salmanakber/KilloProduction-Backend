import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function GroceryStoreDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient title="Grocery store on Kilo" path={`/grocery/store/${params.id}`} />
  )
}
