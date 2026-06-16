import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function FoodRestaurantDeepLinkPage({ params }: { params: { id: string } }) {
  return (
    <AppOpenClient title="Restaurant on Kilo" path={`/food/restaurant/${params.id}`} />
  )
}
