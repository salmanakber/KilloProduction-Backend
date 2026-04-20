"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Pill, RefreshCw, CheckCircle, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Suggestion = {
  id: string
  name: string
  category: string
  form: string
  status: string
  suggestedByType: string
  createdAt: string
  suggesterInfo: {
    type: string
    companyName?: string
    pharmacyName?: string
    email?: string | null
    phone?: string | null
  } | null
}

export default function WholesalerMedicineSuggestionsPage() {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const highlightId = searchParams.get("suggestion")
  const [status, setStatus] = useState<string>("PENDING")
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Suggestion[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [selected, setSelected] = useState<Suggestion | null>(null)
  const [adminNotes, setAdminNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = status === "ALL" ? "" : `&status=${encodeURIComponent(status)}`
      const res = await fetch(`/api/admin/medicine-suggestions?page=1&limit=50${q}`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error("Failed to load")
      const data = await res.json()
      setRows(data.suggestions || [])
    } catch {
      toast({ title: "Error", description: "Could not load suggestions", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [status, toast])

  useEffect(() => {
    load()
  }, [load])

  const openReview = (s: Suggestion) => {
    setSelected(s)
    setAdminNotes("")
    setReviewOpen(true)
  }

  const submitReview = async (action: "APPROVE" | "REJECT") => {
    if (!selected) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/admin/medicine-suggestions/${selected.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, adminNotes: adminNotes.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((data as { error?: string }).error || "Review failed")
      }
      toast({
        title: action === "APPROVE" ? "Approved" : "Rejected",
        description: `Suggestion for "${selected.name}" updated.`,
      })
      setReviewOpen(false)
      setSelected(null)
      load()
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Review failed",
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const suggesterLabel = (s: Suggestion) => {
    const info = s.suggesterInfo
    if (!info) return "—"
    if (info.type === "WHOLESALER" || s.suggestedByType === "WHOLESALER") {
      return info.companyName || info.email || "Wholesaler"
    }
    return info.pharmacyName || info.email || "Pharmacy"
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Pill className="h-7 w-7 text-emerald-600" />
            Catalog suggestions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Wholesalers and pharmacies can suggest medicines to add to the central catalog.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Status</span>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Medicine</TableHead>
              <TableHead>Category / form</TableHead>
              <TableHead>Suggested by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                  No suggestions.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((s) => (
                <TableRow
                  key={s.id}
                  className={highlightId === s.id ? "bg-emerald-50/80" : undefined}
                >
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {s.category} · {s.form}
                  </TableCell>
                  <TableCell className="text-sm">{suggesterLabel(s)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        s.status === "PENDING"
                          ? "destructive"
                          : s.status === "APPROVED"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.status === "PENDING" ? (
                      <Button size="sm" variant="outline" onClick={() => openReview(s)}>
                        Review
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review suggestion</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">{selected.name}</span> · {selected.category} ·{" "}
                {selected.form}
              </p>
              <p className="text-muted-foreground">From: {suggesterLabel(selected)}</p>
              <Textarea
                placeholder="Optional notes (visible internally)"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
              />
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => submitReview("REJECT")}
              disabled={submitting || !selected}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => submitReview("APPROVE")}
              disabled={submitting || !selected}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve & add to catalog
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
