import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default function MoneyTransactionDeepLinkPage({ params }: { params: { id: string } }) {
  return <AppOpenClient title="Transaction" path={`/money-app/transactions/${params.id}`} />
}
