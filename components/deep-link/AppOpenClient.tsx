"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  buildAndroidIntentUrl,
  buildAppSchemeUrl,
  buildWebDeepLinkUrl,
  isMobileUserAgent,
} from "@/lib/mobile-app-link"

type AppOpenClientProps = {
  title: string
  subtitle?: string
  /** App path e.g. /food/restaurant/abc — query string appended from URL when preserveQuery is true */
  path: string
  preserveQuery?: boolean
}

export default function AppOpenClient({
  title,
  subtitle = "Open in the Kilo Super App to continue.",
  path,
  preserveQuery = true,
}: AppOpenClientProps) {
  const searchParams = useSearchParams()
  const [opening, setOpening] = useState(false)

  const queryString = preserveQuery ? searchParams.toString() : ""
  const deepPath = queryString ? `${path}?${queryString}` : path

  const urls = useMemo(
    () => ({
      web: buildWebDeepLinkUrl(deepPath),
      scheme: buildAppSchemeUrl(deepPath),
      intent: buildAndroidIntentUrl(deepPath),
    }),
    [deepPath],
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
    const timer = window.setTimeout(() => openInApp(), 700)
    return () => window.clearTimeout(timer)
  }, [isMobile, deepPath])

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="max-w-lg mx-auto p-6 space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-emerald-300 font-bold">Kilo Super App</p>
          <h1 className="text-2xl font-bold mt-1">{title}</h1>
          {subtitle && <p className="text-sm text-slate-300 mt-2">{subtitle}</p>}
        </header>

        <section className="space-y-3">
          <button
            type="button"
            onClick={openInApp}
            disabled={opening}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 transition-colors text-white font-semibold py-3.5 px-4 disabled:opacity-70"
          >
            {opening ? "Opening Kilo app…" : "Open in Kilo app"}
          </button>
          <p className="text-xs text-slate-400 text-center leading-relaxed">
            If nothing happens, install the Kilo app from your store, then tap again.
          </p>
        </section>
      </div>
    </main>
  )
}
