"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { 
  Wrench, 
  RefreshCw, 
  Save, 
  Settings2, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  CheckCircle,
  Clock,
  MapPin,
  Mail,
  Phone,
  Zap,
  Users,
  MoreHorizontal
} from "lucide-react"
import { cn } from "@/lib/utils"

type MechanicRow = {
  id: string
  userId: string
  name: string
  email: string
  phone: string
  city?: string
  state?: string
  status: string
  isVerified: boolean
  serviceRequestCount?: number
  registrationDate: string
}

export default function AdminMechanicModulePage() {
  const [mechanics, setMechanics] = useState<MechanicRow[]>([])
  const [loading, setLoading] = useState(true)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [pickupPricePerKm, setPickupPricePerKm] = useState("2")
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [currencySymbol, setCurrencySymbol] = useState("₦")
  const applySearch = () => {
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const r = await fetch("/api/admin/modules/mechanic/settings", { credentials: "include" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed settings")
      setPickupPricePerKm(String(j.pickupPricePerKm ?? 2))
      setSettingsUpdatedAt(j.updatedAt || null)
      setCurrencySymbol(j.currencySymbol || "₦")
    } catch {
      setPickupPricePerKm("2")
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  const loadMechanics = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "15",
        ...(searchQuery ? { search: searchQuery } : {}),
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      })
      const r = await fetch(`/api/admin/modules/mechanic/list?${q}`, { credentials: "include" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || "Failed list")
      setMechanics(j.mechanics || [])
      setTotalPages(j.pagination?.pages || 1)
    } catch {
      setMechanics([])
    } finally {
      setLoading(false)
    }
  }, [page, searchQuery, statusFilter])

  useEffect(() => { void loadSettings() }, [loadSettings])
  useEffect(() => { void loadMechanics() }, [loadMechanics])

  const savePickupSettings = async () => {
    const n = Number.parseFloat(pickupPricePerKm)
    if (!Number.isFinite(n) || n <= 0) return
    setSavingSettings(true)
    try {
      const r = await fetch("/api/admin/modules/mechanic/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupPricePerKm: n }),
      })
      const j = await r.json()
      if (r.ok) {
        setPickupPricePerKm(String(j.pickupPricePerKm))
        setSettingsUpdatedAt(j.updatedAt || null)
      }
    } catch (e) { console.error(e) } finally { setSavingSettings(false) }
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm transition-all duration-200"

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Main Page Wrapper */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pt-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Mechanic Module</h1>
            <p className="text-sm text-slate-500 mt-1">Directory of repair partners and pickup logistics</p>
          </div>
          <button 
            onClick={() => void loadMechanics()} 
            className="flex items-center w-fit px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Sync
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Mechanics", val: mechanics.length, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Verified", val: mechanics.filter(m => m.isVerified).length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Pending", val: mechanics.filter(m => !m.isVerified).length, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Rate (KM)", val: `${currencySymbol}${pickupPricePerKm}`, icon: Zap, color: "text-purple-600", bg: "bg-purple-50" },
          ].map((s, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{s.val}</p>
                </div>
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", s.bg)}>
                  <s.icon className={cn("h-5 w-5", s.color)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Content Area */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  placeholder="Search name or email..." 
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySearch()}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>
              <div className="flex items-center gap-3">
                <select 
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="APPROVED">Verified</option>
                  <option value="PENDING">Pending</option>
                </select>
                <button onClick={applySearch} className={cn(gradientBtnClass, "px-4 py-2 rounded-lg text-sm font-semibold")}>
                  Filter
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Mechanic</th>
                      <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Jobs</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr><td colSpan={5} className="px-6 py-10 text-center"><RefreshCw className="h-5 w-5 animate-spin mx-auto text-slate-400" /></td></tr>
                    ) : mechanics.length === 0 ? (
                      <tr><td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-400">No records found</td></tr>
                    ) : (
                      mechanics.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{m.email}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center text-xs text-slate-500">
                              <MapPin className="h-3 w-3 mr-1 text-slate-400" />
                              {[m.city, m.state].filter(Boolean).join(", ") || "—"}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight border",
                              m.isVerified ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                            )}>
                              {m.isVerified ? "Verified" : "Pending"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-medium text-slate-900">{m.serviceRequestCount ?? 0}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                href={`/admin/modules/vendor-performance?vendorId=${encodeURIComponent(m.userId)}&module=MECHANIC&label=${encodeURIComponent(m.name)}`}
                                className="text-[11px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                              >
                                Metrics
                              </Link>
                              <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="h-4 w-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="p-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="p-1 border border-slate-300 rounded bg-white disabled:opacity-50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden sticky top-8">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900">Logistics Rates</h3>
              </div>
              <div className="p-5 space-y-5">
                <p className="text-xs text-slate-500 leading-relaxed">
                  Adjust the global per-kilometer rate for mechanic pickup distance calculations.
                </p>
                
                {settingsLoading ? (
                  <div className="py-4 text-center"><RefreshCw className="h-4 w-4 animate-spin mx-auto text-slate-300" /></div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 block mb-1.5">Rate ({currencySymbol} / KM)</label>
                      <div className="relative">
                        <Zap className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-amber-500" />
                        <input 
                          type="number"
                          step="0.01"
                          value={pickupPricePerKm}
                          onChange={(e) => setPickupPricePerKm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                        />
                      </div>
                    </div>
                    
                    {settingsUpdatedAt && (
                      <p className="text-[10px] text-slate-400 italic">Sync: {new Date(settingsUpdatedAt).toLocaleString()}</p>
                    )}

                    <button 
                      onClick={() => void savePickupSettings()}
                      disabled={savingSettings}
                      className={cn(gradientBtnClass, "w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2")}
                    >
                      {savingSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}