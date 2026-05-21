"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { io, type Socket } from "socket.io-client"

type TripPayload = {
  bookingId: string
  bookingNumber: string
  status: string
  pickupAddress: string
  dropAddress: string
  pickupLatitude: number
  pickupLongitude: number
  dropLatitude: number
  dropLongitude: number
  rider: { name: string; phone: string | null; vehicleType: string | null; licensePlate: string | null } | null
  riderLocation: {
    latitude: number
    longitude: number
    heading: number | null
    updatedAt: string
  } | null
  isActive: boolean
  updatedAt: string
}

export default function PublicTripTrackPage({ params }: { params: { token: string } }) {
  const token = params?.token
  const [trip, setTrip] = useState<TripPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastPing, setLastPing] = useState<string>("")
  const socketRef = useRef<Socket | null>(null)

  const mapsUrl = useMemo(() => {
    if (!trip?.riderLocation) return null
    const { latitude, longitude } = trip.riderLocation
    return `https://www.google.com/maps?q=${latitude},${longitude}`
  }, [trip?.riderLocation])

  const fetchSnapshot = async () => {
    const res = await fetch(`/api/riding/share/${encodeURIComponent(token)}`, { cache: "no-store" })
    const json = await res.json()
    if (!res.ok) {
      throw new Error(json?.error || "Unable to load trip")
    }
    setTrip(json.data.trip)
    setLastPing(new Date().toLocaleTimeString())
    setError(null)
  }

  useEffect(() => {
    if (!token) return
    let cancelled = false
    const poll = async () => {
      try {
        await fetchSnapshot()
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Link expired")
      }
    }
    void poll()
    const interval = setInterval(poll, 4000)

    const origin = typeof window !== "undefined" ? window.location.origin : ""
    const socket = io(origin, { path: "/api/socketio", transports: ["websocket"] })
    socketRef.current = socket
    socket.on("connect", () => {
      socket.emit("join_trip_share", { token }, (ack: any) => {
        if (ack?.ok && ack?.trip) {
          setTrip(ack.trip)
          setError(null)
        }
      })
    })
    socket.on("trip_share_location", (data: { lat: number; lng: number; heading?: number }) => {
      setTrip((prev) =>
        prev
          ? {
              ...prev,
              riderLocation: {
                latitude: data.lat,
                longitude: data.lng,
                heading: data.heading ?? null,
                updatedAt: new Date().toISOString(),
              },
            }
          : prev,
      )
      setLastPing(new Date().toLocaleTimeString())
    })
    socket.on("trip_share_update", (data: TripPayload) => {
      setTrip(data)
      setLastPing(new Date().toLocaleTimeString())
    })

    return () => {
      cancelled = true
      clearInterval(interval)
      socket.emit("leave_trip_share")
      socket.disconnect()
    }
  }, [token])

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-slate-900">Tracking unavailable</p>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
        </div>
      </main>
    )
  }

  if (!trip) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600 animate-pulse">Loading live trip…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      <div className="max-w-lg mx-auto p-6 space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-emerald-300 font-bold">Live trip tracking</p>
          <h1 className="text-2xl font-bold mt-1">Trip #{trip.bookingNumber}</h1>
          <p className="text-sm text-slate-300 mt-1">
            Status: <span className="font-semibold text-white">{trip.status.replace(/_/g, " ")}</span>
          </p>
          <p className="text-xs text-slate-400 mt-2">Last update: {lastPing || "—"}</p>
        </header>

        <section className="bg-white/10 rounded-2xl p-4 border border-white/10 space-y-3">
          <div>
            <p className="text-xs text-slate-400">Pickup</p>
            <p className="text-sm font-medium">{trip.pickupAddress}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Drop-off</p>
            <p className="text-sm font-medium">{trip.dropAddress}</p>
          </div>
        </section>

        {trip.rider && (
          <section className="bg-white/10 rounded-2xl p-4 border border-white/10">
            <p className="text-xs text-slate-400">Driver</p>
            <p className="font-semibold">{trip.rider.name}</p>
            {trip.rider.licensePlate && (
              <p className="text-sm text-slate-300">{trip.rider.licensePlate}</p>
            )}
          </section>
        )}

        {trip.riderLocation ? (
          <section className="bg-emerald-600/20 rounded-2xl p-4 border border-emerald-400/30">
            <p className="text-xs text-emerald-200">Driver location (live)</p>
            <p className="font-mono text-sm mt-1">
              {trip.riderLocation.latitude.toFixed(5)}, {trip.riderLocation.longitude.toFixed(5)}
            </p>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-3 text-sm font-semibold bg-emerald-500 text-white px-4 py-2 rounded-lg"
              >
                Open in Google Maps
              </a>
            )}
          </section>
        ) : (
          <p className="text-sm text-slate-400">Waiting for driver GPS update…</p>
        )}

        {!trip.isActive && (
          <p className="text-amber-300 text-sm font-medium">This trip has ended. Tracking is read-only.</p>
        )}
      </div>
    </main>
  )
}
