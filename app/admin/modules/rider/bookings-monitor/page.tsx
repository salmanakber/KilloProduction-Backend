"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Car,
  Loader2,
  MapPinned,
  Package,
  RefreshCw,
  Radio,
  Search,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { MonitorBookingMapItem } from "@/components/admin/RideBookingsMonitorMap"
import { useAdminBookingsMonitorSocket } from "@/components/admin/useAdminBookingsMonitorSocket"

const RideBookingsMonitorMap = dynamic(
  () => import("@/components/admin/RideBookingsMonitorMap"),
  { ssr: false, loading: () => <MapSkeleton /> }
)

type MonitorBooking = MonitorBookingMapItem & {
  status: string
  paymentStatus: string
  fare: number
  distance: number
  estimatedTime: number
  createdAt: string
  updatedAt: string
  scheduledAt: string | null
  module: string
  customer: { id: string; name: string; phone: string | null; avatar: string | null }
  rider: {
    id: string
    name: string | null
    phone: string | null
    vehicleType?: string
    licensePlate?: string
  } | null
  rideType: { id: string; name: string; vehicleType?: string; icon?: string | null }
  hasActiveSos: boolean
  sosId: string | null
}

type Stats = {
  total: number
  live: number
  withRider: number
  activeSos: number
  rideCount: number
  courierCount: number
}

function MapSkeleton() {
  return (
    <div className="h-full min-h-[420px] rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 animate-pulse flex items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-slate-400">
        <MapPinned className="h-10 w-10" />
        <span className="text-sm font-medium">Loading map…</span>
      </div>
    </div>
  )
}

function statusTone(status: string) {
  const s = status.toUpperCase()
  if (["COMPLETED", "DELIVERED"].includes(s)) return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (["CANCELLED", "WITHDRAWN", "EXPIRED"].includes(s)) return "bg-slate-100 text-slate-600 border-slate-200"
  if (["BIDDING", "REQUESTED"].includes(s)) return "bg-amber-50 text-amber-800 border-amber-200"
  if (s.includes("TRANSIT") || s.includes("EN_ROUTE")) return "bg-blue-50 text-blue-700 border-blue-200"
  if (s.includes("PICKUP") || s.includes("ARRIVED")) return "bg-violet-50 text-violet-700 border-violet-200"
  return "bg-teal-50 text-teal-800 border-teal-200"
}

function formatStatus(s: string) {
  return s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatFare(
  amount: number | null | undefined,
  currency: { code: string; symbol: string } | null
) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—"
  const sym = currency?.symbol || currency?.code || ""
  return `${sym} ${Number(amount).toLocaleString()}`
}

export default function RideBookingsMonitorPage() {
  const [bookings, setBookings] = useState<MonitorBooking[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [mapsApiKey, setMapsApiKey] = useState<string | null>(null)
  const [mapsConfigured, setMapsConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [group, setGroup] = useState<"live" | "completed" | "all">("live")
  const [type, setType] = useState<"ALL" | "RIDE" | "COURIER">("ALL")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [currency, setCurrency] = useState<{ code: string; symbol: string } | null>(null)

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ group, type, search, limit: "100" })
      const res = await fetch(`/api/admin/ride-bookings-monitor?${params}`, { cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load")
      setBookings(data.bookings || [])
      setStats(data.stats || null)
      setMapsConfigured(Boolean(data.maps?.configured))
      setMapsApiKey(data.maps?.apiKey || null)
      if (data.currency?.code) {
        setCurrency({ code: data.currency.code, symbol: data.currency.symbol || data.currency.code })
      }
      setSelectedId((prev) => {
        if (prev && data.bookings?.some((b: MonitorBooking) => b.id === prev)) return prev
        return data.bookings?.[0]?.id ?? null
      })
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [group, type, search])

  useEffect(() => {
    fetchData()
    setCurrentPage(1) // Reset page on filter change
  }, [fetchData])

  // Pagination Logic
  const totalPages = Math.ceil(bookings.length / itemsPerPage)
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage
    return bookings.slice(start, start + itemsPerPage)
  }, [bookings, currentPage])

  const { socketConnected } = useAdminBookingsMonitorSocket(group === "live", {
    onLocation: (data) => {
      setBookings((prev) =>
        prev.map((b) => b.id === data.bookingId ? { ...b, lastLocation: { lat: data.lat, lng: data.lng, at: data.timestamp || new Date().toISOString() }, updatedAt: data.timestamp || new Date().toISOString() } : b)
      )
    },
    onStatus: (data) => {
      if (!data.status) return
      setBookings((prev) =>
        prev.map((b) => b.id === data.bookingId ? { ...b, status: data.status!, updatedAt: data.timestamp || new Date().toISOString() } : b)
      )
    },
    onSos: (data) => {
      setBookings((prev) => prev.map((b) => b.id === data.bookingId ? { ...b, hasActiveSos: true, sosId: data.sosId } : b))
      setStats((s) => (s ? { ...s, activeSos: Math.max(s.activeSos, (s.activeSos || 0) + 1) } : s))
    },
  })

  const selected = useMemo(() => bookings.find((b) => b.id === selectedId) ?? null, [bookings, selectedId])

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-500">
      {/* Header - EXACT ORIGINAL GRADIENT */}
      <div className="relative overflow-hidden rounded-3xl border border-teal-900/10 bg-gradient-to-br from-[#0f766e] via-[#115e59] to-[#1A2433] p-8 shadow-xl">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md">
              <MapPinned className="h-8 w-8 text-teal-200" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-200/80">Operations command</p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-white">Live bookings monitor</h1>
              <p className="mt-2 max-w-xl text-sm font-medium text-teal-100/80">Track GPS, pickup, drop-off, and SOS alerts live.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className={cn("flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold", socketConnected ? "border-emerald-300/40 bg-emerald-500/20 text-emerald-100" : "border-white/15 bg-white/10 text-white/70")}>
              <span className={cn("h-2 w-2 rounded-full", socketConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-400")} />
              {socketConnected ? "Live socket" : "Socket connecting…"}
            </div>
            <button onClick={() => fetchData()} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-teal-900 shadow-lg hover:bg-teal-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "On map", value: stats?.total ?? "—", icon: Radio, color: "text-teal-600" },
          { label: "Live now", value: stats?.live ?? "—", icon: Car, color: "text-blue-600" },
          { label: "With rider", value: stats?.withRider ?? "—", icon: Users, color: "text-violet-600" },
          { label: "SOS active", value: stats?.activeSos ?? "—", icon: AlertTriangle, color: "text-red-600" },
          { label: "Rides", value: stats?.rideCount ?? "—", icon: Car, color: "text-slate-600" },
          { label: "Courier", value: stats?.courierCount ?? "—", icon: Package, color: "text-orange-600" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase text-slate-500">{card.label}</span><card.icon className={cn("h-4 w-4", card.color)} /></div>
            <p className="mt-2 text-2xl font-black text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search booking #..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" />
        </div>
        <div className="flex gap-2">
          {["live", "completed", "all"].map((g: any) => (
            <button key={g} onClick={() => setGroup(g)} className={cn("rounded-xl px-4 py-2 text-xs font-bold uppercase transition", group === g ? "bg-teal-600 text-white shadow-md" : "bg-slate-100 text-slate-600")}>{g}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Booking list with restored SOS and Pagination */}
        <div className="xl:col-span-4 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden max-h-[720px]">
          <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between bg-slate-50/80">
            <span className="text-sm font-bold text-slate-800">Bookings ({bookings.length})</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {paginatedBookings.map((b) => (
              <button key={b.id} onClick={() => setSelectedId(b.id)} className={cn("w-full text-left p-4 transition", b.id === selectedId && "bg-teal-50/60 ring-1 ring-inset ring-teal-500/20")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {b.type === "RIDE" ? <Car className="h-4 w-4 shrink-0 text-teal-600" /> : <Package className="h-4 w-4 shrink-0 text-orange-600" />}
                    <span className="font-bold text-slate-900 truncate">#{b.bookingNumber}</span>
                    {b.hasActiveSos && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-black uppercase text-red-700">SOS</span>}
                  </div>
                  <span className={cn("shrink-0 rounded-lg border px-2 py-0.5 text-[10px] font-bold", statusTone(b.status))}>{formatStatus(b.status)}</span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 line-clamp-1">{b.customer.name}</p>
                <p className="text-xs text-slate-400">{b.rider?.name || "No rider assigned"}</p>
              </button>
            ))}
          </div>
          {/* Pagination UI */}
          {totalPages > 1 && (
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="p-1 disabled:opacity-30"><ChevronLeft className="h-5 w-5 text-teal-700" /></button>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter">Page {currentPage} of {totalPages}</span>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="p-1 disabled:opacity-30"><ChevronRight className="h-5 w-5 text-teal-700" /></button>
            </div>
          )}
        </div>

        {/* Map + Detail (DETAILS ARE FULLY RESTORED HERE) */}
        <div className="xl:col-span-8 flex flex-col gap-4">
          <div className="relative min-h-[480px] rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
            {mapsConfigured && mapsApiKey && (
              <RideBookingsMonitorMap apiKey={mapsApiKey} bookings={bookings} selectedId={selectedId} onSelectBooking={setSelectedId} />
            )}
          </div>

          {/* RESTORED BOOKING DETAILS SECTION */}
          {selected && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm animate-in slide-in-from-bottom-2">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-slate-900">#{selected.bookingNumber}</h2>
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{selected.type}</span>
                    {selected.hasActiveSos && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Active SOS
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{selected.rideType?.name} · Updated {new Date(selected.updatedAt).toLocaleString()}</p>
                </div>
                <span className={cn("rounded-xl border px-3 py-1 text-xs font-bold", statusTone(selected.status))}>{formatStatus(selected.status)}</span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <DetailBlock title="Customer" lines={[selected.customer.name, selected.customer.phone || "—"]} />
                <DetailBlock title="Rider" lines={[selected.rider?.name || "Unassigned", selected.rider?.licensePlate || selected.rider?.vehicleType || "—"]} />
                <DetailBlock title="Trip" lines={[`${selected.distance} km · ~${selected.estimatedTime} min`, `Fare: ${formatFare(selected.fare, currency)} · ${selected.paymentStatus}`]} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <AddressBlock label="Pickup" address={selected.pickup.address} color="emerald" />
                <AddressBlock label="Drop-off" address={selected.drop.address} color="red" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Sub-components exactly as they were
function DetailBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
      {lines.map((line, i) => (
        <p key={i} className={cn("text-sm font-semibold text-slate-800", i > 0 && "text-slate-500 font-medium")}>{line}</p>
      ))}
    </div>
  )
}

function AddressBlock({ label, address, color }: { label: string; address: string; color: "emerald" | "red" }) {
  return (
    <div className={cn("rounded-xl border p-4", color === "emerald" ? "border-emerald-100 bg-emerald-50/40" : "border-red-100 bg-red-50/40")}>
      <p className={cn("text-[10px] font-bold uppercase tracking-wider", color === "emerald" ? "text-emerald-700" : "text-red-700")}>{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-800 line-clamp-2">{address}</p>
    </div>
  )
}