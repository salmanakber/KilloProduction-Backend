"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Search, CalendarClock, ShieldAlert, CheckCircle, Clock } from "lucide-react"

type DeletionLog = {
  id: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  details?: any
  performer?: { name?: string | null; email?: string | null } | null
}

type WebDeletionRequest = {
  id: string
  email?: string | null
  phone?: string | null
  fullName?: string | null
  reason?: string | null
  matchedUserId?: string | null
  status: string
  createdAt: string
}

export default function AccountDeletionLogsPage() {
  const [logs, setLogs] = useState<DeletionLog[]>([])
  const [webRequests, setWebRequests] = useState<WebDeletionRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [actingByLogId, setActingByLogId] = useState<string | null>(null)
  const [actingWebId, setActingWebId] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const [auditRes, webRes] = await Promise.all([
        fetch("/api/admin/audit-logs?actionPrefix=ACCOUNT_&entityType=User&limit=200"),
        fetch("/api/admin/account-deletion-web-requests?limit=100"),
      ])
      const data = await auditRes.json()
      const webData = await webRes.json().catch(() => ({}))
      setLogs(Array.isArray(data?.logs) ? data.logs : [])
      setWebRequests(Array.isArray(webData?.requests) ? webData.requests : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchLogs()
  }, [])

  const filtered = useMemo(() => {
    const resolvesByUser = new Map<string, Set<string>>()
    for (const l of logs) {
      const key = String(l.entityId || "")
      if (!key) continue
      const action = String(l.action || "")
      if (!resolvesByUser.has(key)) resolvesByUser.set(key, new Set<string>())
      if (
        action === "ACTIVATE_ACCOUNT" ||
        action === "RESTORE_ACCOUNT" ||
        action === "ACCOUNT_DELETE_CANCELLED" ||
        action === "ACCOUNT_SECURITY_PURGED"
      ) {
        resolvesByUser.get(key)!.add(action)
      }
    }

    const visibleLogs = logs.filter((l) => {
      const action = String(l.action || "")
      const resolved = resolvesByUser.get(String(l.entityId || "")) || new Set<string>()
      if (action === "ACCOUNT_DEACTIVATION_REQUESTED" && resolved.has("ACTIVATE_ACCOUNT")) return false
      if (
        action === "ACCOUNT_DELETE_REQUESTED" &&
        (resolved.has("RESTORE_ACCOUNT") || resolved.has("ACCOUNT_DELETE_CANCELLED") || resolved.has("ACCOUNT_SECURITY_PURGED"))
      ) {
        return false
      }
      return true
    })

    const q = search.trim().toLowerCase()
    if (!q) return visibleLogs
    return visibleLogs.filter((l) => {
      const action = String(l.action || "").toLowerCase()
      const entityId = String(l.entityId || "").toLowerCase()
      const actor = `${l.performer?.name || ""} ${l.performer?.email || ""}`.toLowerCase()
      return action.includes(q) || entityId.includes(q) || actor.includes(q)
    })
  }, [logs, search])

  const runAdminAction = async (log: DeletionLog, accountAction: "ACTIVATE_ACCOUNT" | "DEACTIVATE_ACCOUNT" | "RESTORE_ACCOUNT") => {
    try {
      setActingByLogId(log.id)
      const res = await fetch(`/api/admin/users/${encodeURIComponent(log.entityId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountAction }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || "Action failed")
      }
      await fetchLogs()
    } catch (error: any) {
      alert(error?.message || "Unable to perform action")
    } finally {
      setActingByLogId(null)
    }
  }

  const updateWebRequest = async (
    id: string,
    status: "PROCESSED" | "REJECTED",
    scheduleDeletion = false,
  ) => {
    try {
      setActingWebId(id)
      const res = await fetch("/api/admin/account-deletion-web-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, scheduleDeletion }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || "Update failed")
      }
      await fetchLogs()
    } catch (error: any) {
      alert(error?.message || "Unable to update web request")
    } finally {
      setActingWebId(null)
    }
  }

  const pendingWeb = webRequests.filter((r) => r.status === "PENDING")

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Account Deletion Logs</h1>
          <p className="text-sm text-slate-500 mt-1">Track web form requests, in-app deletions, and 30-day security purges.</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-50 p-2 px-4 rounded-xl border border-slate-200 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-all text-sm font-bold text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <RefreshCw className={`h-4 w-4 text-slate-500 group-hover:text-teal-600 ${loading ? "animate-spin text-teal-600" : ""}`} />
          {loading ? "Refreshing..." : "Refresh Logs"}
        </button>
      </div>

      {/* PUBLIC WEB REQUESTS */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Public web deletion requests</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              From /account-deletion (no login). {pendingWeb.length} pending.
            </p>
          </div>
        </div>
        {webRequests.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
            No web deletion requests yet.
          </div>
        ) : (
          <div className="space-y-2">
            {webRequests.map((req) => (
              <div
                key={req.id}
                className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-100 bg-slate-50/50 text-sm"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
                        req.status === "PENDING"
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : req.status === "PROCESSED"
                            ? "bg-teal-50 text-teal-700 border border-teal-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {req.status}
                    </span>
                    <span className="font-mono text-xs text-slate-500 truncate">{req.id}</span>
                  </div>
                  <p className="font-semibold text-slate-800">
                    {req.fullName || "—"} · {req.email || "—"} · {req.phone || "—"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Matched user:{" "}
                    <span className="font-mono">{req.matchedUserId || "none"}</span>
                    {" · "}
                    {new Date(req.createdAt).toLocaleString()}
                  </p>
                  {req.reason ? (
                    <p className="text-xs text-slate-600 line-clamp-2">{req.reason}</p>
                  ) : null}
                </div>
                {req.status === "PENDING" ? (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {req.matchedUserId ? (
                      <button
                        disabled={actingWebId === req.id}
                        onClick={() => {
                          if (
                            confirm(
                              "Disable this matched user and mark the web request as processed?",
                            )
                          ) {
                            void updateWebRequest(req.id, "PROCESSED", true)
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-xs font-bold disabled:opacity-50"
                      >
                        {actingWebId === req.id ? "Working…" : "Process + disable user"}
                      </button>
                    ) : null}
                    <button
                      disabled={actingWebId === req.id}
                      onClick={() => void updateWebRequest(req.id, "PROCESSED", false)}
                      className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 text-xs font-bold disabled:opacity-50"
                    >
                      Mark processed
                    </button>
                    <button
                      disabled={actingWebId === req.id}
                      onClick={() => void updateWebRequest(req.id, "REJECTED", false)}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 text-xs font-bold disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MAIN CONTENT CARD */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        
        {/* CARD HEADER & SEARCH */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
          <h3 className="text-lg font-bold text-slate-900">Audit Trail</h3>
          
          <div className="flex items-center space-x-3 bg-slate-50 p-1.5 px-3 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition-all w-full md:w-80">
            <Search className="h-4 w-4 text-teal-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, user ID, actor..."
              className="bg-transparent text-sm font-semibold text-slate-700 outline-none w-full placeholder:text-slate-400 placeholder:font-medium py-1"
            />
          </div>
        </div>

        {/* TABLE DATA */}
        <div className="overflow-x-auto">
          <div className="min-w-[900px]">
            {/* TABLE HEADER */}
            <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 rounded-xl border border-slate-100 mb-2">
              <div className="col-span-3">Action Type</div>
              <div className="col-span-2">User ID</div>
              <div className="col-span-3">Performed By</div>
              <div className="col-span-2">Timestamp</div>
              <div className="col-span-1">Retention</div>
              <div className="col-span-1 text-right">Admin Action</div>
            </div>

            {/* TABLE BODY */}
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-slate-400 text-sm font-medium border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                  <ShieldAlert className="h-6 w-6 text-slate-300 mb-2" />
                  No account-deletion logs found.
                </div>
              ) : (
                filtered.map((log) => {
                  const details = log?.details || {}
                  const retention = details?.retentionDays ? `${details.retentionDays}d` : "-"
                  const purgeAt = details?.scheduledPurgeAt ? new Date(details.scheduledPurgeAt).toLocaleString() : "-"
                  const isPurged = String(log.action).includes("PURGED")

                  return (
                    <div 
                      key={log.id} 
                      className="group grid grid-cols-12 gap-3 items-center px-4 py-3 border border-transparent border-b-slate-100 hover:border-slate-100 hover:bg-slate-50 rounded-xl transition-all text-sm"
                    >
                      {/* Action Column */}
                      <div className="col-span-3 flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center border shrink-0 ${
                          isPurged 
                            ? "bg-rose-50 text-rose-600 border-rose-100" 
                            : "bg-teal-50 text-teal-600 border-teal-100"
                        }`}>
                          {isPurged ? <ShieldAlert className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                        </div>
                        <span className="font-bold text-slate-800 text-xs truncate" title={log.action}>
                          {log.action.replace(/_/g, ' ')}
                        </span>
                      </div>

                      {/* User ID Column */}
                      <div className="col-span-2">
                        <span className="bg-slate-100 px-2 py-1 rounded text-xs font-semibold text-slate-600 font-mono truncate block" title={log.entityId}>
                          {log.entityId}
                        </span>
                      </div>

                      {/* Performed By Column */}
                      <div className="col-span-3 text-slate-600 text-xs font-medium truncate" title={`${log.performer?.name || "-"} ${log.performer?.email ? `(${log.performer.email})` : ""}`}>
                        {log.performer?.name || "-"} 
                        {log.performer?.email && <span className="text-slate-400 block mt-0.5">{log.performer.email}</span>}
                      </div>

                      {/* Created Column */}
                      <div className="col-span-2 text-slate-600 text-xs font-medium">
                        {new Date(log.createdAt).toLocaleDateString()}
                        <span className="block text-slate-400 mt-0.5">{new Date(log.createdAt).toLocaleTimeString()}</span>
                      </div>

                      {/* Retention Column */}
                      <div className="col-span-1">
                        <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {retention}
                        </div>
                        <div className="text-[10px] font-medium text-slate-400 truncate mt-1" title={`Purges at: ${purgeAt}`}>
                          {purgeAt !== "-" ? "Target:" : ""} {purgeAt.split(',')[0]}
                        </div>
                      </div>

                      {/* Admin Action Column */}
                      <div className="col-span-1 flex justify-end">
                        {log.action === "ACCOUNT_DEACTIVATION_REQUESTED" && (
                          <button
                            disabled={actingByLogId === log.id}
                            onClick={() => runAdminAction(log, "ACTIVATE_ACCOUNT")}
                            className="px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {actingByLogId === log.id ? "Working..." : "Activate"}
                          </button>
                        )}
                        {log.action === "ACCOUNT_DELETE_REQUESTED" && (
                          <button
                            disabled={actingByLogId === log.id}
                            onClick={() => runAdminAction(log, "RESTORE_ACCOUNT")}
                            className="px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {actingByLogId === log.id ? "Working..." : "Recover"}
                          </button>
                        )}
                        {(log.action === "ACCOUNT_SECURITY_PURGED" || log.action === "ACCOUNT_DELETE_CANCELLED") && (
                          <div className="flex items-center gap-1 text-xs font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Done
                          </div>
                        )}
                      </div>

                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}