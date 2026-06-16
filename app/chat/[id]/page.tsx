import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function ChatDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Chat on Kilo" path={`/chat/${params.id}`} />
}
