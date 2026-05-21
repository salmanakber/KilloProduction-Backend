/// <reference path="../../types/google-maps.d.ts" />
"use client"

import { loadGoogleMapsScript } from "@/lib/load-google-maps-script"
import { useCallback, useEffect, useRef, useState } from "react"

export type MonitorBookingMapItem = {
  id: string
  bookingNumber: string
  type: "RIDE" | "COURIER"
  status: string
  hasActiveSos: boolean
  pickup: { lat: number; lng: number; address: string }
  drop: { lat: number; lng: number; address: string }
  lastLocation: { lat: number; lng: number } | null
}

type Props = {
  apiKey: string
  bookings: MonitorBookingMapItem[]
  selectedId: string | null
  onSelectBooking?: (id: string) => void
}

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "all", elementType: "labels.text.fill", stylers: [{ color: "#61747a" }] },
  { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "all", stylers: [{ saturation: -100 }, { lightness: 45 }] },
  { featureType: "water", elementType: "all", stylers: [{ color: "#cad2d3" }, { visibility: "on" }] },
]

const DEFAULT_CENTER = { lat: 6.5244, lng: 3.3792 }

function isValidCoord(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)
}

function waitForContainerSize(el: HTMLElement, maxAttempts = 40): Promise<void> {
  return new Promise((resolve) => {
    let attempts = 0
    const check = () => {
      if (el.offsetWidth > 0 && el.offsetHeight > 0) {
        resolve()
        return
      }
      attempts += 1
      if (attempts >= maxAttempts) {
        resolve()
        return
      }
      requestAnimationFrame(check)
    }
    check()
  })
}

export default function RideBookingsMonitorMap({
  apiKey,
  bookings,
  selectedId,
  onSelectBooking,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])
  const routePolylineRef = useRef<google.maps.Polyline | null>(null)
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasInitialFit = useRef<string | null>(null)

  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const clearOverlays = useCallback(() => {
    markersRef.current.forEach((m) => m.setMap(null))
    markersRef.current = []
    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null)
      routePolylineRef.current = null
    }
    if (animIntervalRef.current) {
      clearInterval(animIntervalRef.current)
      animIntervalRef.current = null
    }
  }, [])

  const getIcons = useCallback((maps: typeof google.maps) => ({
    pickup: (sel: boolean) => ({
      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
      fillColor: sel ? "#0f766e" : "#94a3b8",
      fillOpacity: 1,
      strokeWeight: 2,
      strokeColor: "#ffffff",
      scale: sel ? 1.8 : 1.4,
      anchor: new maps.Point(12, 24),
    }),
    drop: (sel: boolean) => ({
      path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z",
      fillColor: sel ? "#ef4444" : "#cbd5e1",
      fillOpacity: 1,
      strokeWeight: 2,
      strokeColor: "#ffffff",
      scale: sel ? 1.8 : 1.4,
      anchor: new maps.Point(12, 24),
    }),
    rider: (sel: boolean, sos: boolean, type: string) => ({
      path:
        type === "RIDE"
          ? "M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99z"
          : "M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z",
      fillColor: sos ? "#ef4444" : sel ? "#2563eb" : "#334155",
      fillOpacity: 1,
      strokeWeight: 2,
      strokeColor: "#ffffff",
      scale: sel ? 1.3 : 1.0,
      anchor: new maps.Point(12, 12),
    }),
  }), [])

  const renderOverlays = useCallback(() => {
    const map = mapRef.current
    if (!map || !window.google?.maps) return

    const maps = window.google.maps
    const iconSet = getIcons(maps)

    clearOverlays()

    const bounds = new maps.LatLngBounds()
    let hasCoords = false
    const selected = bookings.find((b) => b.id === selectedId)

    bookings.forEach((b) => {
      const isSelected = b.id === selectedId

      if (isValidCoord(b.pickup.lat, b.pickup.lng)) {
        bounds.extend(b.pickup)
        hasCoords = true
        const m = new maps.Marker({
          position: b.pickup,
          map,
          title: `${b.bookingNumber} pickup`,
          icon: iconSet.pickup(isSelected),
          zIndex: isSelected ? 100 : 10,
        })
        m.addListener("click", () => onSelectBooking?.(b.id))
        markersRef.current.push(m)
      }

      if (isValidCoord(b.drop.lat, b.drop.lng)) {
        bounds.extend(b.drop)
        hasCoords = true
        const m = new maps.Marker({
          position: b.drop,
          map,
          title: `${b.bookingNumber} drop-off`,
          icon: iconSet.drop(isSelected),
          zIndex: isSelected ? 90 : 9,
        })
        m.addListener("click", () => onSelectBooking?.(b.id))
        markersRef.current.push(m)
      }

      if (b.lastLocation && isValidCoord(b.lastLocation.lat, b.lastLocation.lng)) {
        bounds.extend(b.lastLocation)
        hasCoords = true
        const m = new maps.Marker({
          position: b.lastLocation,
          map,
          title: `Rider — ${b.bookingNumber}`,
          icon: iconSet.rider(isSelected, b.hasActiveSos, b.type),
          zIndex: isSelected ? 110 : 20,
          animation: b.hasActiveSos ? maps.Animation.BOUNCE : undefined,
        })
        m.addListener("click", () => onSelectBooking?.(b.id))
        markersRef.current.push(m)
      }
    })

    if (selected) {
      const path = [selected.pickup, selected.lastLocation, selected.drop].filter(
        (p): p is { lat: number; lng: number } =>
          !!p && isValidCoord(p.lat, p.lng)
      )
      if (path.length >= 2) {
        routePolylineRef.current = new maps.Polyline({
          path,
          geodesic: true,
          strokeColor: selected.hasActiveSos ? "#ef4444" : "#0f766e",
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 3 },
              offset: "0",
              repeat: "15px",
            },
          ],
          map,
        })

        let count = 0
        animIntervalRef.current = setInterval(() => {
          const line = routePolylineRef.current
          if (!line) return
          count = (count + 1) % 200
          const lineIcons = line.get("icons") as Array<{ offset?: string }> | undefined
          if (lineIcons?.[0]) {
            lineIcons[0].offset = `${count / 5}px`
            line.set("icons", lineIcons)
          }
        }, 40)
      }
    }

    const fitKey = `${selectedId ?? "none"}-${bookings.length}`
    if (hasCoords && hasInitialFit.current !== fitKey) {
      map.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 })
      const z = map.getZoom()
      if (z != null && z > 15) map.setZoom(15)
      hasInitialFit.current = fitKey
    }

    maps.event.trigger(map, "resize")
  }, [bookings, selectedId, clearOverlays, onSelectBooking, getIcons])

  useEffect(() => {
    const prev = (window as { gm_authFailure?: () => void }).gm_authFailure
    ;(window as { gm_authFailure?: () => void }).gm_authFailure = () => {
      setMapError(
        "Google Maps rejected this API key. Enable Maps JavaScript API, billing, and add this admin URL to HTTP referrer restrictions."
      )
      setMapReady(false)
    }
    return () => {
      ;(window as { gm_authFailure?: () => void }).gm_authFailure = prev
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const init = async () => {
      if (!apiKey || !containerRef.current) return
      try {
        setMapError(null)
        await loadGoogleMapsScript(apiKey)
        if (!mounted || !containerRef.current) return
        await waitForContainerSize(containerRef.current)

        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center: DEFAULT_CENTER,
            zoom: 11,
            styles: MAP_STYLES,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            gestureHandling: "greedy",
          })
        }
        setMapReady(true)
      } catch (e: unknown) {
        setMapError(e instanceof Error ? e.message : "Failed to initialize map")
      }
    }
    void init()
    return () => {
      mounted = false
    }
  }, [apiKey])

  useEffect(() => {
    if (mapReady) renderOverlays()
  }, [mapReady, bookings, selectedId, renderOverlays])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !mapReady) return
    const ro = new ResizeObserver(() => {
      if (mapRef.current && window.google?.maps) {
        google.maps.event.trigger(mapRef.current, "resize")
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mapReady])

  useEffect(() => () => clearOverlays(), [clearOverlays])

  if (mapError) {
    return (
      <div className="flex min-h-[480px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-bold text-red-800">Map could not load</p>
        <p className="mt-2 max-w-md text-xs text-red-700">{mapError}</p>
      </div>
    )
  }

  return (
    <div className="relative h-[480px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) + 1)}
          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-lg font-bold leading-none text-slate-700 shadow-md"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) - 1)}
          className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-lg font-bold leading-none text-slate-700 shadow-md"
        >
          −
        </button>
      </div>
    </div>
  )
}
