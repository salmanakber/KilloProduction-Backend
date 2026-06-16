import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function PharmacyChatDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Pharmacy chat" path={`/pharmacy/chat/${params.id}`} />
}
