"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import {
  buildAndroidIntentUrl,
  buildAppSchemeUrl,
  buildWebDeepLinkUrl,
  isMobileUserAgent,
} from "@/lib/mobile-app-link"
import { ACCOUNT_DELETION_PATH } from "@/lib/account-deletion-policy"

type AccountDeletionPageClientProps = {
  appName: string
}

function AccountDeletionPageClientInner({ appName }: AccountDeletionPageClientProps) {
  const [opening, setOpening] = useState(false)

  const urls = useMemo(
    () => ({
      web: buildWebDeepLinkUrl(ACCOUNT_DELETION_PATH),
      scheme: buildAppSchemeUrl(ACCOUNT_DELETION_PATH),
      intent: buildAndroidIntentUrl(ACCOUNT_DELETION_PATH),
    }),
    [],
  )

  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false
    return isMobileUserAgent(navigator.userAgent)
  }, [])

  const openInApp = () => {
    if (typeof window === "undefined") return
    setOpening(true)
    const ua = navigator.userAgent || ""
    if (/android/i.test(ua)) {
      window.location.href = urls.intent
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      window.location.href = urls.scheme
      window.setTimeout(() => {
        window.location.href = urls.web
      }, 1500)
    } else {
      window.location.href = urls.scheme
    }
  }

  useEffect(() => {
    if (!isMobile) return
    const timer = window.setTimeout(() => openInApp(), 900)
    return () => window.clearTimeout(timer)
  }, [isMobile])

  return (
    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
      <h2 className="text-lg font-bold text-white">Delete in the {appName} app</h2>
      <p className="text-sm text-slate-300 leading-relaxed">
        Account deletion must be confirmed inside the app while signed in. Tap below to open the
        deletion screen directly.
      </p>
      <button
        type="button"
        onClick={openInApp}
        disabled={opening}
        className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 transition-colors text-white font-semibold py-3.5 px-4 disabled:opacity-70"
      >
        {opening ? "Opening app…" : `Open ${appName} — Delete Account`}
      </button>
      <p className="text-xs text-slate-400 text-center leading-relaxed">
        If the app does not open, install {appName} from your app store, sign in, then go to{" "}
        <span className="text-slate-300">Account → Delete Account</span>.
      </p>
    </section>
  )
}

export default function AccountDeletionPageClient(props: AccountDeletionPageClientProps) {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-700 bg-slate-800/50 p-5 text-sm text-slate-400">
          Loading app link…
        </div>
      }
    >
      <AccountDeletionPageClientInner {...props} />
    </Suspense>
  )
}
