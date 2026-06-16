import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function FoodItemDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient title="Menu item on Kilo" path={`/food/item/${params.id}`} />
  )
}
