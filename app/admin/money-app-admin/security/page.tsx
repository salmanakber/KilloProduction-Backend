"use client"

import { useCallback, useEffect, useState } from "react"
import {
  AlertTriangle,
  Shield,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Flag,
  UserX,
  Fingerprint,
  RefreshCw,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

type RiskLog = {
  id: string
  userId: string
  user: { name: string | null; email: string | null; phone: string | null }
  action: string
  riskScore: number
  signals: string[]
  blocked: boolean
  stepUpRequired: boolean
  ipAddress: string | null
  countryCode: string | null
  deviceFingerprint: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

type AtRiskUser = {
  userId: string
  recentBlocks15m: number
  user: { name: string | null; email: string | null; phone: string | null } | null
}

type ApiResponse = {
  success: boolean
  thresholds: {
    stepUpScore: number
    blockScore: number
    frequentRetriesWindowMinutes: number
    frequentRetriesSignalAt: number
    frequentRetriesBlockAt: number
  }
  summary: {
    hours: number
    totalInWindow: number
    blockedCount: number
    stepUpCount: number
    atRiskUserCount: number
    signalBreakdown: Record<string, number>
  }
  atRisk: AtRiskUser[]
  logs: RiskLog[]
  pagination: { total: number; limit: number; page?: number; hasMore: boolean }
  availableSignals: string[]
  availableActions: string[]
}

const SIGNAL_COLORS: Record<string, string> = {
  DEVELOPER_MODE: "bg-purple-50 text-purple-700 border-purple-100",
  SIMULATOR: "bg-purple-50 text-purple-700 border-purple-100",
  FREQUENT_RETRIES: "bg-rose-50 text-rose-700 border-rose-100",
  VPN_DETECTED: "bg-orange-50 text-orange-700 border-orange-100",
  NEW_DEVICE: "bg-amber-50 text-amber-700 border-amber-100",
  IP_COUNTRY_CHANGE: "bg-amber-50 text-amber-700 border-amber-100",
  LARGE_AMOUNT_SPIKE: "bg-red-50 text-red-700 border-red-100",
  NEW_BENEFICIARY: "bg-blue-50 text-blue-700 border-blue-100",
  UNUSUAL_TIME: "bg-slate-50 text-slate-600 border-slate-100",
}

export default function MoneyTransferSecurityPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearingId, setClearingId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [hours, setHours] = useState(24)
  const [blockedOnly, setBlockedOnly] = useState(false)
  const [stepUpOnly, setStepUpOnly] = useState(false)
  const [signalFilter, setSignalFilter] = useState("")
  const [actionFilter, setActionFilter] = useState("")
  const [userIdFilter, setUserIdFilter] = useState("")
  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(limit),
        hours: String(hours),
      })
      if (blockedOnly) params.set("blocked", "true")
      if (stepUpOnly) params.set("stepUp", "true")
      if (signalFilter) params.set("signal", signalFilter)
      if (actionFilter) params.set("action", actionFilter)
      if (userIdFilter.trim()) params.set("userId", userIdFilter.trim())

      const res = await fetch(`/api/admin/money-app-admin/security-risks?${params}`)
      const json = await res.json()
      if (json.success) setData(json as ApiResponse)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [currentPage, hours, blockedOnly, stepUpOnly, signalFilter, actionFilter, userIdFilter])

  useEffect(() => {
    void load()
  }, [load])

  const totalPages = Math.max(1, Math.ceil((data?.pagination?.total || 0) / limit))

  const clearUserLogs = async (userId: string) => {
    if (!confirm("Clear all risk logs for this user? They can retry money actions immediately.")) return
    setClearingId(userId)
    try {
      const res = await fetch("/api/admin/money-app-admin/security-risks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Clear failed")
    } finally {
      setClearingId(null)
    }
  }

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-rose-600 font-black"
    if (score >= 40) return "text-amber-600 font-bold"
    return "text-slate-600 font-semibold"
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex gap-4 items-center">
          <div className="h-14 w-14 bg-rose-50 rounded-2xl flex items-center justify-center border border-rose-100">
            <Flag className="h-8 w-8 text-rose-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Security red flags</h1>
            <p className="text-sm text-slate-500 font-medium max-w-lg">
              Live risk assessments from the money app. Blocks are not permanent — they use a rolling
              15-minute window and clear automatically when old events expire.
            </p>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {data?.thresholds && (
        <Card className="p-4 border-slate-200 bg-slate-50/80">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
            Engine thresholds (code)
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-semibold text-slate-600">
            <span>Step-up ≥ {data.thresholds.stepUpScore} pts</span>
            <span>Block ≥ {data.thresholds.blockScore} pts</span>
            <span>
              Frequent retries: {data.thresholds.frequentRetriesSignalAt}+ events in{" "}
              {data.thresholds.frequentRetriesWindowMinutes}m → signal
            </span>
            <span>Auto-block at {data.thresholds.frequentRetriesBlockAt}+ blocked events / 15m (then self-heals)</span>
          </div>
        </Card>
      )}

      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-4 border-slate-200">
            <p className="text-[10px] font-black uppercase text-slate-400">Events ({data.summary.hours}h)</p>
            <p className="text-2xl font-black text-slate-900">{data.summary.totalInWindow}</p>
          </Card>
          <Card className="p-4 border-rose-100 bg-rose-50/30">
            <p className="text-[10px] font-black uppercase text-rose-400">Blocked</p>
            <p className="text-2xl font-black text-rose-700">{data.summary.blockedCount}</p>
          </Card>
          <Card className="p-4 border-amber-100 bg-amber-50/30">
            <p className="text-[10px] font-black uppercase text-amber-600">Step-up required</p>
            <p className="text-2xl font-black text-amber-700">{data.summary.stepUpCount}</p>
          </Card>
          <Card className="p-4 border-orange-100 bg-orange-50/30">
            <p className="text-[10px] font-black uppercase text-orange-600">At-risk users (15m)</p>
            <p className="text-2xl font-black text-orange-700">{data.summary.atRiskUserCount}</p>
          </Card>
        </div>
      )}

      {data?.atRisk && data.atRisk.length > 0 && (
        <Card className="border-rose-200 overflow-hidden">
          <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-rose-600" />
            <h2 className="text-sm font-black text-rose-800 uppercase tracking-wide">
              Users with repeated blocks (last 15 minutes)
            </h2>
          </div>
          <div className="divide-y divide-rose-100">
            {data.atRisk.map((row) => (
              <div
                key={row.userId}
                className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-rose-50/50"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {row.user?.name || row.user?.email || row.userId}
                  </p>
                  <p className="text-xs text-slate-500">
                    {row.user?.email} · {row.recentBlocks15m} blocked events in 15m
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-rose-200 text-rose-700 hover:bg-rose-100"
                  disabled={clearingId === row.userId}
                  onClick={() => void clearUserLogs(row.userId)}
                >
                  {clearingId === row.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <UserX className="h-4 w-4 mr-1" />
                      Clear logs
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data?.summary?.signalBreakdown && Object.keys(data.summary.signalBreakdown).length > 0 && (
        <Card className="p-4 border-slate-200">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">
            Signal breakdown (blocked events)
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(data.summary.signalBreakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([sig, count]) => (
                <button
                  key={sig}
                  type="button"
                  onClick={() => {
                    setSignalFilter(sig === signalFilter ? "" : sig)
                    setCurrentPage(1)
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-bold uppercase ${
                    SIGNAL_COLORS[sig] || "bg-slate-50 text-slate-600 border-slate-100"
                  } ${signalFilter === sig ? "ring-2 ring-teal-500" : ""}`}
                >
                  {sig} <span className="opacity-70">({count})</span>
                </button>
              ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase">Window</label>
          <select
            value={hours}
            onChange={(e) => {
              setHours(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value={1}>Last 1 hour</option>
            <option value={6}>Last 6 hours</option>
            <option value={24}>Last 24 hours</option>
            <option value={72}>Last 3 days</option>
            <option value={168}>Last 7 days</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase">Action</label>
          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All actions</option>
            {(data?.availableActions || []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 items-center pt-5">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={blockedOnly}
              onChange={(e) => {
                setBlockedOnly(e.target.checked)
                setCurrentPage(1)
              }}
            />
            Blocked only
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={stepUpOnly}
              onChange={(e) => {
                setStepUpOnly(e.target.checked)
                setCurrentPage(1)
              }}
            />
            Step-up only
          </label>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="text-[10px] font-bold text-slate-400 uppercase">User ID</label>
          <input
            type="text"
            placeholder="Filter by user id…"
            value={userIdFilter}
            onChange={(e) => setUserIdFilter(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-mono"
          />
        </div>
        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => {
            setCurrentPage(1)
            void load()
          }}
        >
          Apply
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto min-h-[320px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <Loader2 className="animate-spin text-teal-600 h-10 w-10" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Loading risk events…
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="hover:bg-transparent border-b border-slate-200">
                  <TableHead className="py-4 pl-6 text-[10px] font-black uppercase text-slate-500">Time</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500">User</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500">Action</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500">Score</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500">Signals</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500">Status</TableHead>
                  <TableHead className="text-[10px] font-black uppercase text-slate-500">Context</TableHead>
                  <TableHead className="pr-6 text-right text-[10px] font-black uppercase text-slate-500">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!data?.logs?.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center text-slate-400 font-medium">
                      No risk events in this window
                    </TableCell>
                  </TableRow>
                ) : (
                  data.logs.map((log) => (
                    <TableRow key={log.id} className="border-b border-slate-100 last:border-0">
                      <TableCell className="pl-6 py-3 text-xs font-medium text-slate-600">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <p className="text-xs font-bold text-slate-900">{log.user?.name || "—"}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate max-w-[140px]">
                          {log.user?.email || log.userId}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{log.action}</Badge>
                      </TableCell>
                      <TableCell className={scoreColor(log.riskScore)}>{log.riskScore}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {log.signals.map((sig) => (
                            <span
                              key={sig}
                              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                SIGNAL_COLORS[sig] || "bg-slate-50 text-slate-500 border-slate-100"
                              }`}
                            >
                              {sig}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.blocked ? (
                          <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">Blocked</Badge>
                        ) : log.stepUpRequired ? (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Step-up</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500">OK</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[10px] text-slate-500 font-mono max-w-[160px]">
                        <div>{log.countryCode || "—"} · {log.ipAddress?.slice(0, 12) || "—"}</div>
                        {log.deviceFingerprint && (
                          <div className="flex items-center gap-1 mt-0.5 text-slate-400">
                            <Fingerprint className="h-3 w-3" />
                            {log.deviceFingerprint.slice(0, 14)}…
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-slate-500"
                          disabled={clearingId === log.userId}
                          onClick={() => void clearUserLogs(log.userId)}
                        >
                          Clear user
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Shield className="h-3 w-3" />
            Page {currentPage} of {totalPages} · {data?.pagination?.total ?? 0} events
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
