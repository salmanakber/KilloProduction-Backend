import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function MoneyTransferDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Transfer" path={`/money-app/transfers/${params.id}`} />
}
