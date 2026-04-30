"use client"

import { useCallback, useEffect, useState, useMemo } from "react"
import {
  Trophy,
  Clock,
  Users,
  Zap,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Calendar,
  DollarSign,
  TrendingUp,
  Target,
  ArrowRight
} from "lucide-react"
import { cn } from "@/lib/utils"

type AnalyticsPayload = {
  generatedAt: string
  worker: string
  activeChallengeId: string | null
  focus: {
    challenge: {
      id: string
      windowStart: string
      windowEnd: string
      peakScore: number
      peakThreshold: number
      targetRides: number
      bonusCapAmount: number
      commissionDiscountPct: number
      activeRidersSnapshot: number
      openRequestsSnapshot: number
      profitPerRideSnapshot: number
      baselineRidesExpected: number
      incrementalRidesCap: number
      status: string
    }
    counts: {
      invited: number
      accepted: number
      completed: number
      totalRidesProgress: number
    }
    leaderboard: Array<{
      participationId: string
      riderUserId: string
      riderName: string
      riderEmail: string | null
      riderPhone: string | null
      status: string
      ridesCompleted: number
      bonusPaid: number
      acceptedAt: string | null
      minutesFromAcceptToFirstPaid: number | null
      targetRides: number
    }>
  } | null
  recentChallenges: Array<{
    id: string
    createdAt: string
    windowStart: string
    windowEnd: string
    peakScore: number
    peakThreshold: number
    targetRides: number
    bonusCapAmount: number
    status: string
    activeRidersSnapshot: number
    openRequestsSnapshot: number
    participationsTotal: number
    acceptedCount: number
    completedCount: number
    ridesCompletedSum: number
    bonusPaidSum: number
  }>
}

export default function RiderBonusAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | "active">("active")

  // Search & Pagination State
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const q = challengeId === "active" || !challengeId
          ? ""
          : `?challengeId=${encodeURIComponent(challengeId)}`
      const res = await fetch(`/api/admin/rider-bonus-analytics${q}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as { error?: string }).error || "Failed to load")
      }
      const json = (await res.json()) as AnalyticsPayload
      setData(json)
      setCurrentPage(1) // Reset page on data load
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }, [challengeId])

  useEffect(() => {
    void load()
  }, [load])

  // Filtered Leaderboard Logic
  const filteredLeaderboard = useMemo(() => {
    if (!data?.focus?.leaderboard) return []
    return data.focus.leaderboard.filter(item => 
      item.riderName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.riderEmail && item.riderEmail.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [data, searchTerm])

  const totalPages = Math.ceil(filteredLeaderboard.length / pageSize)
  const paginatedLeaderboard = filteredLeaderboard.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200"

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-6 pt-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <Trophy className="h-8 w-8 text-amber-500" />
            Peak Bonus Analytics
          </h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Live challenge metrics and engagement leaderboards for rider performance windows.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
             <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
             <select
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                className="pl-9 pr-8 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm transition-all appearance-none min-w-[240px]"
              >
                <option value="active">Current / Active Window</option>
                {data?.recentChallenges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {new Date(c.windowStart).toLocaleDateString()} — {c.status} ({c.peakScore.toFixed(2)})
                  </option>
                ))}
              </select>
          </div>
          <button 
            onClick={() => void load()} 
            disabled={loading}
            className="p-2.5 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("h-5 w-5 text-slate-600", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700">
           <Zap className="h-5 w-5" />
           <p className="font-medium">{error}</p>
        </div>
      )}

      {/* Primary Focus Stats */}
      {data?.focus?.challenge && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 px-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Peak Ratio</p>
                <p className="text-3xl font-black text-slate-900 mt-1">{data.focus.challenge.peakScore.toFixed(2)}</p>
                <p className="text-[10px] text-slate-500 mt-1 font-medium italic">Threshold: {data.focus.challenge.peakThreshold}</p>
              </div>
              <div className="h-14 w-14 bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl flex items-center justify-center shadow-inner">
                <Zap className="h-7 w-7 text-amber-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Snapshot Metrics</p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {data.focus.challenge.openRequestsSnapshot} Jobs
                </p>
                <p className="text-xs font-medium text-slate-500 mt-1">{data.focus.challenge.activeRidersSnapshot} Online Riders</p>
              </div>
              <div className="h-14 w-14 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl flex items-center justify-center shadow-inner">
                <Users className="h-7 w-7 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Target & Bonus</p>
                <p className="text-2xl font-black text-slate-900 mt-1">
                  {data.focus.challenge.targetRides} Rides
                </p>
                <p className="text-xs font-medium text-emerald-600 mt-1">Cap: ₦{data.focus.challenge.bonusCapAmount.toLocaleString()}</p>
              </div>
              <div className="h-14 w-14 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl flex items-center justify-center shadow-inner">
                <Target className="h-7 w-7 text-emerald-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Window Status</p>
                <p className="text-xl font-black text-slate-900 mt-1 uppercase">
                  {data.focus.challenge.status}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-mono">{new Date(data.focus.challenge.windowEnd).toLocaleTimeString()} Expiry</p>
              </div>
              <div className="h-14 w-14 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl flex items-center justify-center shadow-inner">
                <Clock className="h-7 w-7 text-purple-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Leaderboard Section */}
      {data?.focus?.challenge && (
        <div className="px-6 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                   <TrendingUp className="h-5 w-5 text-emerald-500" /> Rider Leaderboard
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5 uppercase tracking-wider">Top participating earners for this window</p>
              </div>
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  placeholder="Search by rider name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full lg:w-72 transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto relative">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rank</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rider Profile</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Progress</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Speed (1st Paid)</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Bonus Accrued</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {paginatedLeaderboard.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-slate-400 italic">No participation records found matching your search.</td>
                    </tr>
                  ) : (
                    paginatedLeaderboard.map((row, i) => (
                      <tr key={row.participationId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-5">
                          <span className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-lg font-black text-xs",
                            (i + (currentPage-1)*pageSize) === 0 ? "bg-amber-100 text-amber-700 shadow-sm" : 
                            (i + (currentPage-1)*pageSize) === 1 ? "bg-slate-200 text-slate-700" : 
                            (i + (currentPage-1)*pageSize) === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"
                          )}>
                            {(i + 1) + (currentPage - 1) * pageSize}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <div className="text-sm font-bold text-slate-900">{row.riderName}</div>
                          <div className="text-[11px] text-slate-500 font-medium">{row.riderEmail || "No contact"}</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border",
                            row.status === 'COMPLETED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"
                          )}>
                            {row.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="text-sm font-black text-slate-900">{row.ridesCompleted} <span className="text-slate-400 font-medium">/ {row.targetRides}</span></div>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-2 ml-auto overflow-hidden">
                             <div 
                                className="h-full bg-emerald-500 rounded-full" 
                                style={{ width: `${Math.min(100, (row.ridesCompleted / row.targetRides) * 100)}%` }} 
                             />
                          </div>
                        </td>
                        <td className="px-6 py-5 text-right text-xs font-bold text-slate-600">
                          {row.minutesFromAcceptToFirstPaid != null ? (
                            <div className="flex items-center justify-end gap-1.5">
                               <Clock className="h-3 w-3 text-slate-400" />
                               {row.minutesFromAcceptToFirstPaid}m
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-emerald-600">
                          {row.bonusPaid > 0 ? `₦${row.bonusPaid.toLocaleString()}` : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Leaderboard Pagination */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
              <div className="text-sm text-slate-500 font-medium">
                Showing <span className="text-slate-900">{paginatedLeaderboard.length}</span> of <span className="text-slate-900">{filteredLeaderboard.length}</span> participants
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-slate-300 rounded-lg bg-white disabled:opacity-50 transition-colors hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-bold text-slate-600 px-2">Page {currentPage} of {totalPages || 1}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-2 border border-slate-300 rounded-lg bg-white disabled:opacity-50 transition-colors hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Section */}
      <div className="px-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
             <div className="h-9 w-9 bg-slate-100 rounded-lg flex items-center justify-center text-slate-500">
                <ArrowRight className="h-5 w-5" />
             </div>
             <div>
                <h3 className="text-lg font-bold text-slate-900">Recent Peak Windows</h3>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Historical engagement and aggregate bonus payout</p>
             </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase">Window Period</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase">Peak</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase">Accepted / Total</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase">Σ Rides</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase">Total Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.recentChallenges.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => setChallengeId(c.id)}>
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{new Date(c.windowStart).toLocaleDateString()}</div>
                      <div className="text-[10px] font-mono text-slate-500">{new Date(c.windowStart).toLocaleTimeString()} → {new Date(c.windowEnd).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-black text-amber-600">{c.peakScore.toFixed(2)}</td>
                    <td className="px-6 py-4">
                       <span className={cn(
                         "px-2 py-0.5 rounded text-[10px] font-black border uppercase",
                         c.status === 'ACTIVE' ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-slate-100 text-slate-500 border-slate-200"
                       )}>{c.status}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">
                      {c.acceptedCount} <span className="text-slate-400 text-xs">/ {c.participationsTotal}</span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-bold text-slate-700">{c.ridesCompletedSum}</td>
                    <td className="px-6 py-4 text-right text-sm font-black text-emerald-600">₦{c.bonusPaidSum.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex flex-col items-center justify-center gap-2 py-6 px-6 border-t border-slate-200 bg-white">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Zap className="h-3 w-3" /> Data Generated At {new Date(data?.generatedAt || "").toLocaleString()}
          </p>
          <p className="text-[10px] text-slate-400 font-mono italic">{data?.worker}</p>
      </div>
    </div>
  )
}