"use client"

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  RefreshCw,
  Key,
  ShoppingBag,
  Utensils,
  Ban,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Copy,
  CheckCircle2,
  BarChart3,
  ExternalLink,
  Search,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

type Cred = {
  id: string
  tokenPrefix: string
  label: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

type IntegrationRow = {
  id: string
  module: "FOOD" | "GROCERY"
  name: string
  providerSlug: string
  isActive: boolean
  createdAt: string
  restaurant: { id: string; name: string; userId: string } | null
  groceryStore: { id: string; name: string; userId: string } | null
  credentials: Cred[]
}

type Stats = {
  totalIntegrations: number
  food: number
  grocery: number
  activeCredentials: number
  revokedCredentials: number
  byProvider: Record<string, number>
  lastApiUseGlob: string | null
}

export default function AdminPosPartnerApisPage() {
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [moduleFilter, setModuleFilter] = useState<"ALL" | "FOOD" | "GROCERY">("ALL")
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [secretModal, setSecretModal] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/pos-integrations", { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      setIntegrations(data.integrations || [])
      setStats(data.stats || null)
    } catch {
      toast({ title: "Error", description: "Could not load POS integrations", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    let rows = integrations
    if (moduleFilter !== "ALL") {
      rows = rows.filter((r) => r.module === moduleFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const blob = [
        r.name,
        r.providerSlug,
        r.id,
        r.restaurant?.name,
        r.groceryStore?.name,
        ...r.credentials.map((c) => c.tokenPrefix),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return blob.includes(q)
    })
  }, [integrations, moduleFilter, search])

  const apiBase =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/pos/v1`
      : "/api/pos/v1"

  const revokeAll = async (integrationId: string) => {
    if (!confirm("Revoke ALL active API keys for this integration? POS calls will fail until a new key is issued.")) return
    setBusyId(integrationId)
    try {
      const res = await fetch(`/api/admin/pos-integrations/${integrationId}/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error("revoke failed")
      toast({ title: "Keys revoked" })
      await load()
    } catch {
      toast({ title: "Revoke failed", variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  const revokeOne = async (integrationId: string, credentialId: string) => {
    if (!confirm("Revoke this API key?")) return
    setBusyId(credentialId)
    try {
      const res = await fetch(`/api/admin/pos-integrations/${integrationId}/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentialId }),
      })
      if (!res.ok) throw new Error("revoke failed")
      toast({ title: "Key revoked" })
      await load()
    } catch {
      toast({ title: "Revoke failed", variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  const rotate = async (integrationId: string, revokeOthers: boolean) => {
    setBusyId(integrationId)
    try {
      const res = await fetch(`/api/admin/pos-integrations/${integrationId}/rotate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeOthers, label: "admin-rotate" }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "rotate failed")
      setSecretModal(data.apiSecret as string)
      toast({ title: "New key created", description: "Copy it now — it will not be shown again." })
      await load()
    } catch {
      toast({ title: "Rotate failed", variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  const copySecret = async (s: string) => {
    try {
      await navigator.clipboard.writeText(s)
      toast({ title: "Copied" })
    } catch {
      toast({ title: "Copy failed", variant: "destructive" })
    }
  }

  if (loading && !integrations.length) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">POS &amp; partner APIs</h1>
          <p className="text-slate-600 text-sm mt-1 max-w-3xl leading-relaxed">
            Partner POS providers integrate with <code className="text-xs bg-slate-100 px-1 rounded">/api/pos/v1</code> using{" "}
            <code className="text-xs bg-slate-100 px-1 rounded">Authorization: Bearer pos_sk_…</code>. Each linked{" "}
            <strong>restaurant</strong> or <strong>grocery store</strong> has its own integration record (often created by the vendor or
            onboarding). Use this screen to audit connections, revoke compromised keys, and rotate secrets for partners.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-emerald-50/40 p-4 text-sm text-slate-700">
        <div className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
          <ExternalLink className="h-4 w-4 text-emerald-700" />
          External API base URL
        </div>
        <code className="break-all text-xs bg-white/80 px-2 py-1 rounded border border-emerald-100">{apiBase}</code>
        <span className="block mt-2 text-xs text-slate-600">
          Health check: <code className="bg-white/80 px-1 rounded">GET {apiBase}/health</code> with a valid Bearer token.
        </span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Integrations" value={stats.totalIntegrations} icon={<BarChart3 className="h-4 w-4" />} />
          <StatCard label="Active API keys" value={stats.activeCredentials} icon={<Key className="h-4 w-4" />} sub={`${stats.revokedCredentials} revoked`} />
          <StatCard
            label="Food / Grocery"
            value={`${stats.food} / ${stats.grocery}`}
            icon={<Utensils className="h-4 w-4" />}
          />
          <StatCard
            label="Last API use (any key)"
            value={stats.lastApiUseGlob ? new Date(stats.lastApiUseGlob).toLocaleString() : "—"}
            icon={<CheckCircle2 className="h-4 w-4" />}
            small
          />
        </div>
      )}

      {stats && Object.keys(stats.byProvider).length > 0 && (
        <div className="rounded-xl border border-slate-100 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-800 mb-2">By provider slug</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byProvider)
              .sort((a, b) => b[1] - a[1])
              .map(([slug, n]) => (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700"
                >
                  <span className="font-mono">{slug}</span>
                  <span className="text-slate-500">({n})</span>
                </span>
              ))}
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm"
            placeholder="Search name, store, provider, key prefix…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm bg-white"
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value as typeof moduleFilter)}
        >
          <option value="ALL">All modules</option>
          <option value="FOOD">Food only</option>
          <option value="GROCERY">Grocery only</option>
        </select>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="p-3 w-8" />
                <th className="p-3">Integration</th>
                <th className="p-3">Store</th>
                <th className="p-3">Provider</th>
                <th className="p-3">Keys</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => {
                const storeLabel =
                  row.module === "FOOD"
                    ? row.restaurant?.name ?? "—"
                    : row.groceryStore?.name ?? "—"
                const active = row.credentials.filter((c) => !c.revokedAt).length
                const open = expanded[row.id]
                return (
                  <Fragment key={row.id}>
                    <tr className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="p-2 align-middle">
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-slate-100"
                          onClick={() => setExpanded((e) => ({ ...e, [row.id]: !open }))}
                          aria-expanded={open}
                        >
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">{row.id}</div>
                        <span
                          className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            row.module === "FOOD"
                              ? "bg-orange-100 text-orange-800"
                              : "bg-purple-100 text-purple-800"
                          }`}
                        >
                          {row.module}
                        </span>
                        {!row.isActive && (
                          <span className="ml-2 text-[10px] font-bold text-red-600">inactive</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5 text-slate-800">
                          {row.module === "FOOD" ? (
                            <Utensils className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          ) : (
                            <ShoppingBag className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          )}
                          {storeLabel}
                        </div>
                      </td>
                      <td className="p-3 font-mono text-xs text-slate-600">{row.providerSlug}</td>
                      <td className="p-3">
                        <span className="text-slate-800">{active} active</span>
                        <span className="text-slate-400"> / {row.credentials.length} total</span>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          className="mr-1"
                          disabled={busyId === row.id}
                          onClick={() => rotate(row.id, false)}
                        >
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          New key
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mr-1 text-amber-700 border-amber-200"
                          disabled={busyId === row.id}
                          onClick={() => rotate(row.id, true)}
                        >
                          Rotate all
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-700 border-red-200"
                          disabled={busyId === row.id}
                          onClick={() => revokeAll(row.id)}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Revoke all
                        </Button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={6} className="p-4 pt-0">
                          <div className="rounded-lg border border-slate-100 bg-white p-3 mt-1">
                            <div className="text-xs font-semibold text-slate-500 mb-2">Credentials</div>
                            <div className="space-y-2">
                              {row.credentials.map((c) => (
                                <div
                                  key={c.id}
                                  className="flex flex-wrap items-center justify-between gap-2 text-xs border-b border-slate-50 pb-2 last:border-0"
                                >
                                  <div>
                                    <span className="font-mono text-slate-800">{c.tokenPrefix}…</span>
                                    <span className="text-slate-500 ml-2">{c.label || "—"}</span>
                                    {c.revokedAt ? (
                                      <span className="ml-2 text-red-600">revoked {new Date(c.revokedAt).toLocaleString()}</span>
                                    ) : (
                                      <span className="ml-2 text-emerald-600">active</span>
                                    )}
                                  </div>
                                  <div className="text-slate-400">
                                    last use: {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "never"}
                                  </div>
                                  {!c.revokedAt && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-red-600"
                                      disabled={busyId === c.id}
                                      onClick={() => revokeOne(row.id, c.id)}
                                    >
                                      Revoke
                                    </Button>
                                  )}
                                </div>
                              ))}
                              {row.credentials.length === 0 && (
                                <div className="text-slate-400">No credentials</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-slate-500 text-sm">No integrations match your filters.</div>
        )}
      </div>

      {secretModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">New API secret</h3>
            <p className="text-sm text-slate-600">Copy now. This value cannot be retrieved again.</p>
            <div className="rounded-lg bg-slate-900 text-emerald-400 p-3 font-mono text-xs break-all select-all">
              {secretModal}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSecretModal(null)}>
                Close
              </Button>
              <Button onClick={() => copySecret(secretModal)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  icon,
  sub,
  small,
}: {
  label: string
  value: string | number
  icon: ReactNode
  sub?: string
  small?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-slate-500 text-xs font-medium mb-1">
        {icon}
        {label}
      </div>
      <div className={`font-bold text-slate-900 ${small ? "text-xs leading-snug" : "text-xl"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}
