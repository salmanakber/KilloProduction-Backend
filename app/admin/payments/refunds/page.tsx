"use client"

import { useState, useEffect, useMemo } from "react"
import {
  RefreshCw,
  Search,
  Download,
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Settings,
  Clock,
  ShieldAlert,
  Undo2,
  CheckCircle,
  Ban,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Wallet,
  Settings2,
  BarChart2
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ComposedChart, Legend } from "recharts"

// --- Interfaces ---
interface RefundRequest {
  id: string
  paymentId?: string
  orderId: string
  transactionId: string
  customerName: string
  customerEmail: string
  amount: number
  currency: string
  reason: string
  customerNote: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED" | "FAILED"
  method: "ORIGINAL_PAYMENT" | "WALLET"
  requestedAt: string
  processedAt?: string
  adminNote?: string
}

export default function RefundManagement() {
  // --- State ---
  const [loading, setLoading] = useState(true)
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [activeTab, setActiveTab] = useState("pending")
  const [dateRange, setDateRange] = useState("7d")
  const [searchQuery, setSearchQuery] = useState("")
  const [actionBanner, setActionBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  
  // Modals & Settings
  const [selectedRefund, setSelectedRefund] = useState<RefundRequest | null>(null)
  const [autoRefundThreshold, setAutoRefundThreshold] = useState(20)
  const [savingSettings, setSavingSettings] = useState(false)
  const [refundSettings, setRefundSettings] = useState<any>(null)
  const [currencySymbol, setCurrencySymbol] = useState("₦")
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "amount_desc" | "amount_asc">("newest")
  const [totalPages, setTotalPages] = useState(1)

  const [page, setPage] = useState(1)

  // --- Initialize Data ---
  useEffect(() => {
    void (async () => {
      setLoading(true)
      try {
        const [refundRes, settingsRes, statsRes] = await Promise.all([
          fetch(`/api/admin/payments/refunds?range=${dateRange}&status=ALL&page=${page}&limit=50`),
          fetch("/api/admin/payments/refunds/settings"),
          fetch(`/api/admin/payments/stats?range=${dateRange}`),
        ])
        const refundData = await refundRes.json()
        const settingsData = await settingsRes.json()
        const statsData = await statsRes.json().catch(() => ({}))
        setRefunds(refundData.refunds || [])
        setTotalPages(Math.max(1, Number(refundData?.pagination?.pages || 1)))
        const rs = settingsData.settings || null
        setRefundSettings(rs)
        if (typeof rs?.autoRefundThreshold === "number" && Number.isFinite(rs.autoRefundThreshold)) {
          setAutoRefundThreshold(rs.autoRefundThreshold)
        }
        if (typeof statsData?.currencySymbol === "string" && statsData.currencySymbol.trim()) {
          setCurrencySymbol(statsData.currencySymbol)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [dateRange, page])

  // --- Handlers ---
  const handleAction = async (row: RefundRequest, action: "approve" | "reject") => {
    if (!row.paymentId) return
    const res = await fetch(`/api/admin/payments/refunds/${row.paymentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action === "approve" ? "APPROVE" : "REJECT" }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setActionBanner({ type: "err", text: data.error || "Failed to process refund" })
      return
    }
    setRefunds((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? { ...r, status: (data.status || (action === "approve" ? "APPROVED" : "REJECTED")) as any, processedAt: new Date().toISOString() }
          : r,
      ),
    )
    setActionBanner({ type: "ok", text: `Refund request ${row.id} ${action}d successfully.` })
    setSelectedRefund(null)
  }

  const handleRebroadcast = async (row: RefundRequest) => {
    if (!row.paymentId) return
    const res = await fetch(`/api/admin/payments/refunds/${row.paymentId}/rebroadcast`, { method: "POST" })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setActionBanner({ type: "err", text: data.error || "Failed to rebroadcast refund pickup" })
      return
    }
    setActionBanner({ type: "ok", text: `Refund pickup rebroadcasted for ${row.id}.` })
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const payload = {
        settings: {
          ...(refundSettings || {}),
          autoRefundThreshold,
          loyalCompletedOrdersMin: Number(refundSettings?.loyalCompletedOrdersMin ?? 50),
          loyalCompletedRidesMin: Number(refundSettings?.loyalCompletedRidesMin ?? 15),
        },
      }
      const res = await fetch("/api/admin/payments/refunds/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error("Failed to save")
      setSavingSettings(false)
      setActionBanner({ type: "ok", text: `Auto-refund threshold updated to ${cur}${autoRefundThreshold}.` })
    } catch (e: any) {
      setSavingSettings(false)
      setActionBanner({ type: "err", text: e?.message || "Failed to save settings" })
    }
  }

  // --- Derived Data (Filtering) ---
  const filteredRefunds = useMemo(() => {
    const rows = refunds.filter(r => {
      // Tab Filter
      if (activeTab === "pending" && r.status !== "PENDING") return false
      if (activeTab === "history" && r.status === "PENDING") return false
      
      // Search Filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return r.id.toLowerCase().includes(q) || 
               r.orderId.toLowerCase().includes(q) || 
               r.customerName.toLowerCase().includes(q)
      }
      return true
    })
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (sortBy === "oldest") return +new Date(a.requestedAt) - +new Date(b.requestedAt)
      if (sortBy === "amount_desc") return b.amount - a.amount
      if (sortBy === "amount_asc") return a.amount - b.amount
      return +new Date(b.requestedAt) - +new Date(a.requestedAt)
    })
    return sorted
  }, [refunds, activeTab, searchQuery, sortBy])

  // --- UI Helpers ---
  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED":
      case "COMPLETED": return "bg-emerald-50 text-emerald-700 border-emerald-200/60"
      case "PENDING": return "bg-amber-50 text-amber-700 border-amber-200/60"
      case "REJECTED":
      case "FAILED": return "bg-rose-50 text-rose-700 border-rose-200/60"
      default: return "bg-slate-50 text-slate-750 border-slate-200/60"
    }
  }

  const cur = currencySymbol
  const pendingRows = refunds.filter((r) => r.status === "PENDING")
  const processedRows = refunds.filter((r) => r.status === "APPROVED" || r.status === "COMPLETED")
  const rejectedRows = refunds.filter((r) => r.status === "REJECTED" || r.status === "FAILED")
  const pendingVolume = pendingRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const processedVolume = processedRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const avgResolutionHours = useMemo(() => {
    const diffs = refunds
      .filter((r) => r.processedAt)
      .map((r) => (new Date(r.processedAt!).getTime() - new Date(r.requestedAt).getTime()) / 36e5)
      .filter((n) => Number.isFinite(n) && n >= 0)
    if (!diffs.length) return 0
    return diffs.reduce((a, b) => a + b, 0) / diffs.length
  }, [refunds])
  const reasonChartData = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of refunds) {
      const key = String(r.reason || "Other").trim() || "Other"
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)
  }, [refunds])
  const timelineData = useMemo(() => {
    const map = new Map<string, { date: string; volume: number }>()
    for (const r of refunds) {
      const d = new Date(r.requestedAt)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      const existing = map.get(key)
      if (existing) {
        existing.volume += Number(r.amount || 0)
      } else {
        map.set(key, { date: label, volume: Number(r.amount || 0) })
      }
    }
    return Array.from(map.values()).slice(-10)
  }, [refunds])

  const exportCsv = () => {
    const headers = ["id", "paymentId", "orderId", "customer", "amount", "currency", "method", "status", "requestedAt", "processedAt"]
    const rows = filteredRefunds.map((r) => [
      r.id,
      r.paymentId || "",
      r.orderId,
      r.customerName,
      String(r.amount),
      r.currency,
      r.method,
      r.status,
      r.requestedAt,
      r.processedAt || "",
    ])
    const esc = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)
    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => esc(String(c))).join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `refunds-${dateRange}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- SKELETON LOADING UI ---
  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-4 md:p-8 bg-slate-50/50 min-h-screen">
        {/* Header Skeleton */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-5 rounded-2xl border border-slate-200">
          <div className="space-y-2">
            <div className="h-6 bg-slate-150 rounded w-48" />
            <div className="h-4 bg-slate-100 rounded w-80" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 bg-slate-100 rounded-xl w-28" />
            <div className="h-9 bg-slate-150 rounded-xl w-32" />
          </div>
        </div>

        {/* Micro setting Skeleton */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-slate-100 rounded-xl" />
            <div className="space-y-2">
              <div className="h-4 bg-slate-150 rounded w-44" />
              <div className="h-3 bg-slate-100 rounded w-96" />
            </div>
          </div>
          <div className="h-10 bg-slate-100 rounded-xl w-48" />
        </div>

        {/* KPI Grid Skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-4">
              <div className="flex justify-between items-center">
                <div className="h-9 w-9 bg-slate-100 rounded-lg" />
                <div className="h-4 w-12 bg-slate-100 rounded" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3 bg-slate-100 rounded w-16" />
                <div className="h-6 bg-slate-250 rounded w-28" />
                <div className="h-3 bg-slate-50 rounded w-36" />
              </div>
            </div>
          ))}
        </div>

        {/* Big Table/Tabs Skeleton */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="h-12 bg-slate-50 border-b border-slate-150 flex items-center px-4 gap-3">
            <div className="h-6 w-24 bg-slate-200 rounded" />
            <div className="h-6 w-24 bg-slate-200 rounded" />
          </div>
          <div className="p-4 space-y-4">
            <div className="flex justify-between gap-4">
              <div className="h-9 bg-slate-100 rounded-lg w-full max-w-xs" />
              <div className="h-9 bg-slate-100 rounded-lg w-32" />
            </div>
            <div className="space-y-2.5">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="h-12 bg-slate-50 rounded-lg w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16 bg-slate-50/50 min-h-screen p-4 md:p-8 max-w-full overflow-hidden">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Refund Management</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl font-medium leading-relaxed">Review disputes, process return requests, and manage customer chargebacks.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-9 text-xs border border-slate-200 bg-white rounded-xl px-2.5 focus:ring-1 focus:ring-indigo-500 outline-none font-bold text-slate-700 cursor-pointer shadow-sm"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center h-9 px-4 text-white text-xs font-bold rounded-xl bg-slate-900 hover:bg-slate-800 shadow-sm transition-all"
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ACTION BANNER */}
      {actionBanner && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border animate-in slide-in-from-top-4 shadow-sm ${
            actionBanner.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionBanner.type === "ok" ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" /> : <XCircle className="h-4.5 w-4.5 text-rose-600" />}
            <span className="text-xs font-bold">{actionBanner.text}</span>
          </div>
          <button type="button" className="p-1 rounded-lg hover:bg-black/5 transition-colors" onClick={() => setActionBanner(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* AUTO-REFUND SETTING */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-indigo-100 transition-colors">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 group-hover:bg-indigo-100 group-hover:text-indigo-600 transition-colors shrink-0">
            <Settings className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Auto-Approve Micro Refunds</h2>
            <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl leading-relaxed font-medium">
              When enabled (threshold &gt; 0), wallet refunds at or below this amount are approved instantly for trusted customers — those with at least the configured counts of completed marketplace orders and completed ride bookings (see below). Physical returns that need courier pickup are never auto-approved.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 shrink-0 self-end md:self-auto">
          <label htmlFor="threshold" className="text-xs font-bold text-slate-500 pl-1.5">
            Threshold ({cur})
          </label>
          <input
            id="threshold"
            type="number"
            min={0}
            value={autoRefundThreshold}
            onChange={(e) => setAutoRefundThreshold(Number(e.target.value) || 0)}
            className="w-16 text-center border border-slate-200 rounded-lg py-1 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none"
          />
          <button
            type="button"
            disabled={savingSettings}
            onClick={handleSaveSettings}
            className="px-4 py-1.5 text-white text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {savingSettings ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* REFUND CONFIGS PANEL */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 group hover:border-slate-300 transition-colors">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-2.5">
          <Settings2 className="h-4.5 w-4.5 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Refund Behavior &amp; Rules Settings</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          <div className="space-y-2.5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
            <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Enabled Modules</p>
            {["FOOD", "GROCERY", "PHARMACY", "AUTO_PARTS", "RIDING"].map((m) => (
              <label key={m} className="flex items-center gap-2 text-slate-700 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={refundSettings?.enabledModules?.[m] !== false}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  onChange={(e) =>
                    setRefundSettings((prev: any) => ({
                      ...(prev || {}),
                      enabledModules: { ...(prev?.enabledModules || {}), [m]: e.target.checked },
                    }))
                  }
                />
                {m.replace("_", " ")}
              </label>
            ))}
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Delivery Fee Bearer</p>
              <select
                value={refundSettings?.deliveryFeeBearer || "CUSTOMER"}
                onChange={(e) =>
                  setRefundSettings((prev: any) => ({ ...(prev || {}), deliveryFeeBearer: e.target.value }))
                }
                className="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none w-full cursor-pointer shadow-sm"
              >
                <option value="CUSTOMER">Customer bears delivery fee</option>
                <option value="VENDOR">Vendor bears delivery fee</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-slate-700 font-bold cursor-pointer bg-slate-50/50 p-2.5 rounded-lg border border-slate-100">
              <input
                type="checkbox"
                checked={refundSettings?.refundPlatformCommission !== false}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                onChange={(e) =>
                  setRefundSettings((prev: any) => ({
                    ...(prev || {}),
                    refundPlatformCommission: e.target.checked,
                  }))
                }
              />
              Refund platform commission
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Trusted customer — Min Orders</p>
                <input
                  type="number"
                  min={1}
                  value={Number(refundSettings?.loyalCompletedOrdersMin ?? 50)}
                  onChange={(e) =>
                    setRefundSettings((prev: any) => ({
                      ...(prev || {}),
                      loyalCompletedOrdersMin: Number(e.target.value) || 50,
                    }))
                  }
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold w-full focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Trusted customer — Min Rides</p>
                <input
                  type="number"
                  min={0}
                  value={Number(refundSettings?.loyalCompletedRidesMin ?? 15)}
                  onChange={(e) =>
                    setRefundSettings((prev: any) => ({
                      ...(prev || {}),
                      loyalCompletedRidesMin: Number(e.target.value) || 0,
                    }))
                  }
                  className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold w-full focus:ring-1 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400 leading-normal font-medium italic">Ride bookings with status DELIVERED or COMPLETED count toward verified metrics.</p>
          </div>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:border-amber-100 transition-colors flex flex-col justify-between">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 bg-amber-50 rounded-lg flex items-center justify-center border border-amber-100">
              <Clock className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div className="flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
              {pendingRows.length} Pending
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pending Requests</p>
            <p className="text-xl font-black text-slate-900 tracking-tight">{pendingRows.length}</p>
            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Vol: {cur}{pendingVolume.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:border-emerald-100 transition-colors flex flex-col justify-between">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 bg-emerald-50 rounded-lg flex items-center justify-center border border-emerald-100">
              <Undo2 className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            <div className="flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
              <ArrowUpRight className="h-3 w-3 mr-0.5" />
              12%
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Processed (7d)</p>
            <p className="text-xl font-black text-slate-900 tracking-tight">{cur}{processedVolume.toFixed(2)}</p>
            <div className="mt-1 flex items-center text-[10px] font-bold text-emerald-700 leading-none">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1 shrink-0" />
              <span>{processedRows.length} requests approved</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:border-rose-100 transition-colors flex flex-col justify-between">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 bg-rose-50 rounded-lg flex items-center justify-center border border-rose-100">
              <ShieldAlert className="h-4.5 w-4.5 text-rose-600" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Rejected / Disputed</p>
            <p className="text-xl font-black text-slate-900 tracking-tight">{rejectedRows.length}</p>
            <div className="mt-1 flex items-center text-[10px] text-rose-600 font-bold leading-none">
              <span>8.5% rejection rate</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 group hover:border-blue-100 transition-colors flex flex-col justify-between">
          <div className="flex items-start justify-between mb-3">
            <div className="h-9 w-9 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100">
              <RefreshCw className="h-4.5 w-4.5 text-blue-600" />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Avg Resolution Time</p>
            <p className="text-xl font-black text-slate-900 tracking-tight">{avgResolutionHours.toFixed(1)}<span className="text-sm text-slate-400 font-bold ml-0.5">h</span></p>
            <div className="mt-1 flex items-center text-[10px] text-blue-600 font-bold leading-none">
              <span>SLA Target: 24h</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full">
        
        {/* Tabs */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-1.5">
          <div className="flex space-x-1 w-full overflow-x-auto scrollbar-none">
            {[
              { id: "pending", label: "Pending Requests" },
              { id: "history", label: "Processed History" },
              { id: "analytics", label: "Refund Analytics" }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 flex items-center gap-2 ${
                  activeTab === t.id
                    ? "bg-white text-slate-900 shadow-sm border border-slate-150"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {t.label}
                {t.id === "pending" && <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{refunds.filter((r) => r.status === "PENDING").length}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="p-0">
          
          {/* TAB: PENDING & HISTORY */}
          {(activeTab === "pending" || activeTab === "history") && (
            <div className="space-y-0 animate-in fade-in">
              <div className="flex flex-col md:flex-row gap-3 items-center justify-between p-4">
                <div className="relative w-full md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                  <input
                    type="text"
                    placeholder="Search ID, order, customer..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-3 py-1.5 w-full border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-indigo-500 text-xs outline-none transition-all placeholder:text-slate-400 h-9"
                  />
                </div>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 h-9 w-full md:w-auto cursor-pointer shadow-sm"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="amount_desc">Amount high to low</option>
                  <option value="amount_asc">Amount low to high</option>
                </select>
              </div>

              <div className="overflow-x-auto w-full border-t border-slate-100">
                <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[22%]">Reference Info</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[22%]">Customer</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[28%]">Reason & Amount</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[12%]">Status</th>
                      <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right w-[16%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white text-xs">
                    {filteredRefunds.length > 0 ? (
                      filteredRefunds.map((req) => (
                        <tr key={req.id} className="hover:bg-slate-50/40 transition-colors group">
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="font-mono text-[11px] font-bold text-indigo-600 mb-0.5">{req.id}</div>
                            <div className="text-[10px] text-slate-500 font-semibold">Ord: {req.orderId}</div>
                            <div className="text-[9px] text-slate-400 mt-0.5">{new Date(req.requestedAt).toLocaleDateString()}</div>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <p className="font-bold text-slate-900 leading-tight">{req.customerName}</p>
                            <p className="text-[10px] text-slate-400 font-semibold max-w-[150px] truncate" title={req.customerEmail}>{req.customerEmail}</p>
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="font-extrabold text-slate-900 text-sm">{req.currency}{req.amount.toFixed(2)}</span>
                              <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[9px] uppercase font-bold text-slate-500 flex items-center gap-0.5 border border-slate-200/60 shrink-0">
                                {req.method === "WALLET" ? <Wallet size={9} /> : <CreditCard size={9} />}
                                {req.method === "WALLET" ? "Wallet" : "Card"}
                              </span>
                            </div>
                            <div className="text-[10px] font-bold text-rose-600 line-clamp-1">{req.reason}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${getStatusColor(req.status)}`}>
                              {req.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1 flex-nowrap">
                              <button onClick={() => setSelectedRefund(req)} className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-slate-150 border border-slate-200 text-slate-500 hover:text-slate-700 transition-colors shrink-0" title="Review Details">
                                <Eye size={12} />
                              </button>
                              {req.status === "PENDING" && (
                                <>
                                  <button onClick={() => void handleAction(req, "approve")} className="h-7 w-7 flex items-center justify-center rounded-lg bg-emerald-50 border border-emerald-150 hover:bg-emerald-100 hover:border-emerald-200 text-emerald-600 transition-colors shrink-0" title="Approve">
                                    <CheckCircle size={12} />
                                  </button>
                                  <button onClick={() => void handleAction(req, "reject")} className="h-7 w-7 flex items-center justify-center rounded-lg bg-rose-50 border border-rose-150 hover:bg-rose-100 hover:border-rose-200 text-rose-600 transition-colors shrink-0" title="Reject">
                                    <Ban size={12} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-center text-slate-400 text-xs font-semibold">
                          <div className="flex flex-col items-center">
                            <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200 mb-3">
                              <Search className="h-5 w-5 text-slate-400" />
                            </div>
                            No refund requests found in this view.
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page <span className="text-slate-800">{page}</span> of <span className="text-slate-800">{totalPages}</span></p>
                <div className="flex gap-1.5">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-40 transition-colors shadow-sm">
                    <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 disabled:opacity-40 transition-colors shadow-sm">
                    Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="p-4 space-y-4 animate-in fade-in">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                
                {/* Volume Chart */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <BarChart2 className="h-4.5 w-4.5 text-indigo-500" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Refund Volume Trend (7d)</h3>
                  </div>
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={timelineData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${cur}${v >= 1000 ? v/1000+'k' : v}`}/>
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold'}} />
                        <Legend wrapperStyle={{paddingTop: '15px', fontSize: '11px'}}/>
                        <Bar dataKey="volume" name="Refunded Value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Reason Distribution */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="h-4.5 w-4.5 text-rose-500" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Top Refund Reasons</h3>
                  </div>
                  <div className="h-[260px] w-full">
                    {reasonChartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={reasonChartData} layout="vertical" margin={{ top: 0, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="reason" type="category" width={110} tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold'}} />
                          <Bar dataKey="count" name="Tickets" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={16} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 font-semibold text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">No volume reason datasets.</div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* DETAIL MODAL */}
      {selectedRefund && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Review Refund Request</h3>
                <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{selectedRefund.id} • {selectedRefund.orderId}</p>
              </div>
              <button onClick={() => setSelectedRefund(null)} className="h-8 w-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="p-5 space-y-4 overflow-y-auto bg-white text-xs">
              
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${getStatusColor(selectedRefund.status)}`}>
                  {selectedRefund.status}
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  Requested: {new Date(selectedRefund.requestedAt).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Details</p>
                  <p className="font-bold text-slate-900 mt-1">{selectedRefund.customerName}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-medium">{selectedRefund.customerEmail}</p>
                </div>
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Refund Amount</p>
                  <div className="flex items-end gap-1.5 mt-1">
                    <p className="text-xl font-black text-indigo-950 leading-none">{cur}{selectedRefund.amount.toFixed(2)}</p>
                    <p className="text-[10px] text-indigo-600 font-bold">via {selectedRefund.method === "WALLET" ? "Wallet" : "Original Card"}</p>
                  </div>
                </div>
              </div>

              <div className="bg-rose-50/50 border border-rose-100 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
                  <p className="font-bold text-rose-900">Reason: {selectedRefund.reason}</p>
                </div>
                <div className="bg-white p-3 rounded-lg border border-rose-100/50 text-slate-700 font-semibold leading-relaxed">
                  &quot;{selectedRefund.customerNote}&quot;
                </div>
              </div>

              {selectedRefund.adminNote && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1"><MessageSquare size={12}/> Admin Notes</p>
                  <p className="font-semibold text-slate-700 leading-relaxed">{selectedRefund.adminNote}</p>
                  {selectedRefund.processedAt && (
                    <p className="text-[9px] text-slate-400 mt-2 font-medium">Processed at: {new Date(selectedRefund.processedAt).toLocaleString()}</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {selectedRefund.status === "PENDING" && (
              <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
                <button 
                  onClick={() => void handleAction(selectedRefund, "reject")} 
                  className="px-4 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold text-xs rounded-lg transition-colors shadow-sm"
                >
                  Reject Request
                </button>
                <button 
                  onClick={() => void handleAction(selectedRefund, "approve")} 
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
                >
                  Approve Refund
                </button>
                <button
                  onClick={() => void handleRebroadcast(selectedRefund)}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm"
                >
                  Rebroadcast Pickup
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}