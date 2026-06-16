import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function SupportTicketDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Support ticket" path={`/support/tickets/${params.id}`} />
}
