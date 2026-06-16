import { redirect } from "next/navigation"
import { propertyListingWebPath } from "@/lib/mobile-app-link"

/** Alias path used in some share / notification links. */
export default function StaysDeepLinkPage({ params }: { params: { id: string } }) {
  redirect(propertyListingWebPath(params.id))
}
