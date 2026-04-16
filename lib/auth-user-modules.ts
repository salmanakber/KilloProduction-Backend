/** Maps persisted user relations to app module strings (JWT / client). */
export function getUserModules(user: {
  autoPartsStore?: unknown
  pharmacy?: unknown
  restaurant?: unknown
  mechanicProfile?: unknown
  groceryStore?: unknown
  riderProfile?: unknown
  wholesaler?: unknown
}): string[] {
  const modules: string[] = []
  if (user.autoPartsStore) modules.push("AUTO_PARTS")
  if (user.pharmacy) modules.push("PHARMACY")
  if (user.restaurant) modules.push("FOOD")
  if (user.groceryStore) modules.push("GROCERY")
  if (user.riderProfile) modules.push("RIDING")
  if (user.mechanicProfile) modules.push("MECHANIC")
  if (user.wholesaler) modules.push("SUPPLIER")
  return modules
}
