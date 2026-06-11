"use client"

import { useCallback, useEffect, useState } from "react"
import { Shield, RefreshCw, Unlock, Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface LockedRiderRow {
  riderId: string
  user: {
    id: string
    name: string | null
    phone: string | null
    email: string | null
  }
  vehicleType: string
  licensePlate: string
  commissionLockedAt: string | null
  commissionLockReason: string | null
  totalOwed: number
  outstandingItems: Array<{
    amount: number
    status: string
    dueAt: string
    bookingNumber?: string
  }>
}

export default function LockedRidersPage() {
  const [rows, setRows] = useState<LockedRiderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/modules/rider/locked-accounts?limit=50")
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to load")
      setRows(json.data || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load locked riders")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const reactivate = async (riderId: string) => {
    setReactivatingId(riderId)
    try {
      const res = await fetch(`/api/admin/modules/rider/locked-accounts/${riderId}/reactivate`, {
        method: "POST",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Reactivation failed")
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reactivation failed")
    } finally {
      setReactivatingId(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Shield className="h-7 w-7 text-red-500" />
            Locked rider accounts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Riders temporarily locked for unpaid Pay-on-Arrival platform commission after the 3-day grace period.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
          No locked rider accounts right now.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Rider</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Vehicle</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Locked at</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Owed</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.riderId} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{row.user.name || "—"}</div>
                    <div className="text-xs text-slate-500">{row.user.phone || row.user.email || row.user.id}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.vehicleType} · {row.licensePlate}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.commissionLockedAt
                      ? new Date(row.commissionLockedAt).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-red-600">${row.totalOwed.toFixed(2)}</span>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {row.outstandingItems.length} item(s)
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      size="sm"
                      onClick={() => void reactivate(row.riderId)}
                      disabled={reactivatingId === row.riderId}
                    >
                      {reactivatingId === row.riderId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Unlock className="h-4 w-4 mr-1" />
                          Reactivate
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
