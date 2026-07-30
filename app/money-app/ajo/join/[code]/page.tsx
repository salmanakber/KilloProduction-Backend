import AppOpenClient from "@/components/deep-link/AppOpenClient"

export default async function AjoJoinDeepLinkPage({
  params,
}: {
  params: Promise<{ code: string }> | { code: string }
}) {
  const resolved = await Promise.resolve(params)
  const code = encodeURIComponent(String(resolved.code || "").trim())
  return (
    <AppOpenClient
      title="Join Ajo Group"
      path={`/money-app/ajo/join/${code}`}
    />
  )
}
