"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Wrench, RefreshCw, Save, Settings2 } from "lucide-react"

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

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  useEffect(() => {
    void loadMechanics()
  }, [loadMechanics])

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
      if (!r.ok) throw new Error(j.error || "Save failed")
      setPickupPricePerKm(String(j.pickupPricePerKm))
      setSettingsUpdatedAt(j.updatedAt || null)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-7 w-7 text-indigo-600" />
            Mechanics (Auto parts)
          </h1>
          <p className="text-muted-foreground mt-1">
            Registered mechanics and pickup pricing used for vendor→customer distance fees.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadMechanics()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh list
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Mechanics</CardTitle>
              <CardDescription>Profiles linked to part-request jobs</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="Search name, email…"
                className="w-[200px]"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
              />
              <Button type="button" variant="secondary" size="sm" onClick={() => applySearch()}>
                Search
              </Button>
              <select
                className="border rounded-md h-9 px-2 text-sm bg-background"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setPage(1)
                }}
              >
                <option value="ALL">All</option>
                <option value="APPROVED">Verified</option>
                <option value="PENDING">Pending KYC</option>
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business / name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Service requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : mechanics.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      No mechanics found
                    </TableCell>
                  </TableRow>
                ) : (
                  mechanics.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <div className="text-sm">{m.email}</div>
                        <div className="text-xs text-muted-foreground">{m.phone}</div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[m.city, m.state].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={m.isVerified ? "default" : "secondary"}>
                          {m.isVerified ? "Verified" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{m.serviceRequestCount ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {totalPages > 1 && (
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className="text-sm self-center px-2">
                  Page {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Settings2 className="h-5 w-5" />
              Pickup pricing
            </CardTitle>
            <CardDescription>
              Per-km rate for mechanic pickup quotes (vendor location → customer address). Used when notifying
              mechanics and when the customer pays the combined vendor + mechanic checkout.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {settingsLoading ? (
              <p className="text-sm text-muted-foreground">Loading settings…</p>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ppk">Price per km</Label>
                  <Input
                    id="ppk"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={pickupPricePerKm}
                    onChange={(e) => setPickupPricePerKm(e.target.value)}
                  />
                </div>
                {settingsUpdatedAt && (
                  <p className="text-xs text-muted-foreground">Last updated: {settingsUpdatedAt}</p>
                )}
                <Button onClick={() => void savePickupSettings()} disabled={savingSettings}>
                  <Save className="h-4 w-4 mr-2" />
                  {savingSettings ? "Saving…" : "Save"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
