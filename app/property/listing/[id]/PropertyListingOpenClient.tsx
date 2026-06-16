"use client"

import { useEffect, useMemo, useState } from "react"
import {
  isMobileUserAgent,
  propertyListingAndroidIntentUrl,
  propertyListingAppSchemeUrl,
  propertyListingWebUrl,
} from "@/lib/mobile-app-link"

type ListingPreview = {
  id: string
  name: string
  tagline?: string
  city?: string
  price?: number
  rating?: number
  reviews?: number
  image?: string | null
  badge?: string | null
}

export default function PropertyListingOpenClient({ listingId }: { listingId: string }) {
  const [listing, setListing] = useState<ListingPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  const webUrl = propertyListingWebUrl(listingId)
  const appSchemeUrl = propertyListingAppSchemeUrl(listingId)
  const androidIntentUrl = propertyListingAndroidIntentUrl(listingId)

  const isMobile = useMemo(() => {
    if (typeof navigator === "undefined") return false
    return isMobileUserAgent(navigator.userAgent)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/property/listings/${encodeURIComponent(listingId)}`, {
          cache: "no-store",
        })
        const json = await res.json()
        if (!res.ok) {
          throw new Error(json?.error || "Listing not found")
        }
        const card = json?.listing || json?.card || json
        if (!cancelled) {
          setListing({
            id: card.id || listingId,
            name: card.name || card.title || "Property",
            tagline: card.tagline,
            city: card.city,
            price: card.price ?? card.nightlyRate,
            rating: card.rating,
            reviews: card.reviews ?? card.reviewCount,
            image: card.image ?? (Array.isArray(card.images) ? card.images[0] : null),
            badge: card.badge,
          })
          setError(null)
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unable to load listing")
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [listingId])

  const openInApp = () => {
    setOpening(true)
    if (typeof window === "undefined") return

    const ua = navigator.userAgent || ""
    const isAndroid = /android/i.test(ua)
    const isIOS = /iphone|ipad|ipod/i.test(ua)

    if (isAndroid) {
      window.location.href = androidIntentUrl
    } else if (isIOS) {
      window.location.href = appSchemeUrl
      setTimeout(() => {
        window.location.href = webUrl
      }, 1500)
    } else {
      window.location.href = appSchemeUrl
    }
  }

  useEffect(() => {
    if (!isMobile) return
    const timer = setTimeout(() => openInApp(), 600)
    return () => clearTimeout(timer)
  }, [isMobile, listingId])

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Listing not found</p>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="max-w-lg mx-auto p-6 space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-emerald-300 font-bold">Kilo Luxe Escapes</p>
          <h1 className="text-2xl font-bold mt-1">{listing?.name || "Opening stay…"}</h1>
          {listing?.tagline && <p className="text-sm text-slate-300 mt-2">{listing.tagline}</p>}
          {listing?.city && <p className="text-xs text-slate-400 mt-1">{listing.city}</p>}
        </header>

        {listing?.image && (
          <div className="rounded-2xl overflow-hidden border border-white/10 aspect-[16/10] bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={listing.image} alt={listing.name} className="w-full h-full object-cover" />
          </div>
        )}

        {listing && (
          <section className="bg-white/10 rounded-2xl p-4 border border-white/10 flex items-center justify-between gap-4">
            <div>
              {listing.badge && (
                <p className="text-xs text-amber-300 font-semibold uppercase tracking-wide">{listing.badge}</p>
              )}
              {listing.price != null && (
                <p className="text-lg font-bold mt-1">₦{Math.round(listing.price).toLocaleString()} / night</p>
              )}
              {listing.rating != null && (
                <p className="text-sm text-slate-300 mt-1">
                  ★ {listing.rating.toFixed(2)}
                  {listing.reviews != null ? ` · ${listing.reviews} reviews` : ""}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <button
            type="button"
            onClick={openInApp}
            disabled={opening}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 transition-colors text-white font-semibold py-3.5 px-4 disabled:opacity-70"
          >
            {opening ? "Opening Kilo app…" : "Open in Kilo app"}
          </button>
          <p className="text-xs text-slate-400 text-center">
            If the app doesn&apos;t open, install Kilo from the Play Store or App Store, then tap again.
          </p>
        </section>
      </div>
    </main>
  )
}
