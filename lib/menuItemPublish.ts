import { prisma } from "@/lib/prisma"

/** When item is available for customers, require at least one menu category on the restaurant and a valid categoryId. */
export async function validateFoodMenuItemPublish(
  restaurantId: string,
  categoryId: string | null | undefined,
  isAvailable: boolean | undefined
): Promise<string | null> {
  const wantLive = isAvailable !== false
  if (!wantLive) return null
  const n = await prisma.menuCategory.count({ where: { restaurantId, isActive: true } })
  if (n === 0) {
    return "Add at least one menu category in your profile before publishing items."
  }
  if (!categoryId) {
    return "Select a menu category before marking the item as available."
  }
  const cat = await prisma.menuCategory.findFirst({
    where: { id: categoryId, restaurantId, isActive: true },
  })
  if (!cat) {
    return "Invalid or inactive menu category."
  }
  return null
}
