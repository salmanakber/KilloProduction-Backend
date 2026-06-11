"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

type OwnerType = "all" | "vendor" | "rider"
type StatusFilter = "all" | "verified" | "pending" | "rejected" | "requires_documents"
type ReviewAction = "reject" | "require_documents"

interface PayoutBankAccount {
  id: string
  accountName: string
  accountNumber: string
  bankName: string
  bankCode: string
  currency: string
  isPrimary: boolean
  isVerified: boolean
  verificationStatus: string
  verificationNotes: string | null
  verifiedAt: string | null
  createdAt: string
  owner: {
    id: string
    name: string
    email: string
    phone: string
    role: string
    ownerType: "rider" | "vendor"
  }
}

export default function PayoutBankAccountsPage() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<PayoutBankAccount[]>([])
  const [ownerType, setOwnerType] = useState<OwnerType>("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [stats, setStats] = useState({ total: 0, verified: 0, pending: 0, riders: 0, vendors: 0 })
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewAccount, setReviewAccount] = useState<PayoutBankAccount | null>(null)
  const [reviewAction, setReviewAction] = useState<ReviewAction>("require_documents")
  const [reviewReason, setReviewReason] = useState("")
  const [requestedDocuments, setRequestedDocuments] = useState("")
  const [sendEmail, setSendEmail] = useState(true)
  const [submittingReview, setSubmittingReview] = useState(false)

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        ownerType,
        status: statusFilter,
        page: String(page),
        limit: "20",
      })
      if (search.trim()) params.set("search", search.trim())

      const res = await fetch(`/api/admin/payments/payout-bank-accounts?${params}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to load accounts")

      setAccounts(data.accounts || [])
      setStats(data.stats || { total: 0, verified: 0, pending: 0, riders: 0, vendors: 0 })
      setTotalPages(data.pagination?.totalPages || 1)
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to load bank accounts", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [ownerType, statusFilter, search, page, toast])

  useEffect(() => {
    void fetchAccounts()
  }, [fetchAccounts])

  const openReviewDialog = (account: PayoutBankAccount, action: ReviewAction) => {
    setReviewAccount(account)
    setReviewAction(action)
    setReviewReason("")
    setRequestedDocuments(
      action === "require_documents"
        ? "• Government-issued ID matching the account name\n• Recent bank statement showing account name and number\n• Proof of business registration (vendors only, if applicable)"
        : ""
    )
    setSendEmail(true)
    setReviewOpen(true)
  }

  const handleReverify = async (accountId: string) => {
    try {
      setActionLoadingId(accountId)
      const res = await fetch(`/api/admin/payments/payout-bank-accounts/${accountId}/reverify`, {
        method: "POST",
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Re-verification failed")
      toast({ title: "Verified", description: "Account re-verified via Paystack." })
      void fetchAccounts()
    } catch (e: any) {
      toast({ title: "Verification failed", description: e.message, variant: "destructive" })
      void fetchAccounts()
    } finally {
      setActionLoadingId(null)
    }
  }

  const submitReview = async () => {
    if (!reviewAccount) return
    if (!reviewReason.trim()) {
      toast({ title: "Message required", description: "Please explain the issue to the user.", variant: "destructive" })
      return
    }
    if (reviewAction === "require_documents" && !requestedDocuments.trim()) {
      toast({ title: "Documents required", description: "List the documents the user must submit.", variant: "destructive" })
      return
    }

    try {
      setSubmittingReview(true)
      const res = await fetch(
        `/api/admin/payments/payout-bank-accounts/${reviewAccount.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: reviewAction,
            reason: reviewReason.trim(),
            requestedDocuments: requestedDocuments.trim(),
            sendEmail,
          }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Review action failed")

      toast({
        title: reviewAction === "reject" ? "Account rejected" : "Documents requested",
        description: `Ticket ${data.ticket?.ticketNumber} opened and user notified.`,
      })
      setReviewOpen(false)
      setReviewAccount(null)
      void fetchAccounts()
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" })
    } finally {
      setSubmittingReview(false)
    }
  }

  const statusBadge = (acc: PayoutBankAccount) => {
    if (acc.isVerified || acc.verificationStatus === "VERIFIED") {
      return (
        <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200/50 gap-1 text-[10px] font-bold py-0.5 px-2">
          <ShieldCheck className="h-3 w-3 animate-in fade-in" /> Verified
        </Badge>
      )
    }
    if (acc.verificationStatus === "REQUIRES_DOCUMENTS") {
      return (
        <Badge className="bg-amber-50 text-amber-800 hover:bg-amber-50 border-amber-200/50 gap-1 text-[10px] font-bold py-0.5 px-2">
          <FileWarning className="h-3 w-3" /> Docs required
        </Badge>
      )
    }
    if (acc.verificationStatus === "REJECTED") {
      return (
        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200/50 gap-1 text-[10px] font-bold py-0.5 px-2">
          <Ban className="h-3 w-3" /> Rejected
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="bg-slate-50 text-slate-600 border-slate-200/50 gap-1 text-[10px] font-bold py-0.5 px-2">
        <Clock className="h-3 w-3" /> Pending
      </Badge>
    )
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 px-4 md:px-0 max-w-full overflow-hidden">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-semibold">
            <Link href="/admin/payments" className="hover:text-emerald-600 transition-colors">Payments</Link>
            <span>/</span>
            <span className="text-slate-600 font-bold">Payout bank accounts</span>
          </div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Vendor &amp; Rider Bank Accounts</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl font-medium leading-relaxed">
            Auto-verify via Paystack on save. Reject or request documents — we email the user and open a support ticket.
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => void fetchAccounts()} 
          disabled={loading}
          className="h-9 text-xs font-bold shrink-0 self-start md:self-auto shadow-sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 text-slate-500 ${loading ? "animate-spin text-emerald-600" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total linked" value={stats.total} icon={Building2} loading={loading} />
        <StatCard label="Paystack verified" value={stats.verified} icon={CheckCircle2} tone="success" loading={loading} />
        <StatCard label="Pending / failed" value={stats.pending} icon={Clock} tone="warning" loading={loading} />
        <StatCard label="Riders / Vendors" value={`${stats.riders} / ${stats.vendors}`} icon={Users} loading={loading} />
      </div>

      {/* FILTER & TABLE SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        
        {/* FILTERS */}
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {(["all", "vendor", "rider"] as OwnerType[]).map((t) => (
              <Button
                key={t}
                size="sm"
                variant={ownerType === t ? "default" : "outline"}
                onClick={() => { setOwnerType(t); setPage(1) }}
                className="h-8 text-xs font-bold px-3 py-1 shadow-sm"
              >
                {t === "all" ? "All Accounts" : t === "vendor" ? "Vendors Only" : "Riders Only"}
                {t === "rider" && <Truck className="h-3.5 w-3.5 ml-1.5 opacity-70" />}
                {t === "vendor" && <Building2 className="h-3.5 w-3.5 ml-1.5 opacity-70" />}
              </Button>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-2 flex-1 lg:max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="pl-9 text-xs h-9 bg-white border-slate-200 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-emerald-500"
                placeholder="Search name, account, bank, email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (setPage(1), void fetchAccounts())}
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1) }}>
              <SelectTrigger className="w-full sm:w-[170px] text-xs h-9 bg-white border-slate-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                <SelectItem value="verified" className="text-xs">Verified</SelectItem>
                <SelectItem value="pending" className="text-xs">Pending</SelectItem>
                <SelectItem value="requires_documents" className="text-xs">Requires docs</SelectItem>
                <SelectItem value="rejected" className="text-xs">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              size="sm"
              onClick={() => { setPage(1); void fetchAccounts() }}
              className="h-9 text-xs font-bold px-4"
            >
              Search
            </Button>
          </div>
        </div>

        {/* ACCOUNT LIST TABLE */}
        <div className="rounded-xl border border-slate-100 overflow-hidden max-w-full">
          <div className="overflow-x-auto w-full">
            <Table className="min-w-[960px] table-fixed">
              <TableHeader>
                <TableRow className="bg-slate-50/85 hover:bg-slate-50/85">
                  <TableHead className="w-[20%] text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3 px-4">Owner Info</TableHead>
                  <TableHead className="w-[20%] text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3 px-4">Bank Registry</TableHead>
                  <TableHead className="w-[18%] text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3 px-4">Account Metadata</TableHead>
                  <TableHead className="w-[12%] text-[10px] font-bold text-slate-400 uppercase tracking-wider py-3 px-4">Status</TableHead>
                  <TableHead className="w-[30%] text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right py-3 px-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, idx) => (
                    <TableRow key={idx} className="animate-pulse">
                      <TableCell className="py-3 px-4">
                        <div className="space-y-1.5">
                          <div className="h-3.5 bg-slate-100 rounded w-4/5" />
                          <div className="h-3 bg-slate-50 rounded w-3/5" />
                          <div className="h-4 bg-slate-50 rounded w-1/3" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="space-y-1.5">
                          <div className="h-3.5 bg-slate-100 rounded w-2/3" />
                          <div className="h-3 bg-slate-50 rounded w-2/5" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="space-y-1.5">
                          <div className="h-3.5 bg-slate-100 rounded w-1/2" />
                          <div className="h-3 bg-slate-50 rounded w-4/5" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-4">
                        <div className="h-5 bg-slate-100 rounded-md w-16" />
                      </TableCell>
                      <TableCell className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <div className="h-7 w-16 bg-slate-100 rounded shrink-0" />
                          <div className="h-7 w-20 bg-slate-100 rounded shrink-0" />
                          <div className="h-7 w-16 bg-slate-100 rounded shrink-0" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-slate-400 text-xs font-semibold">
                      <div className="flex flex-col items-center">
                        <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200 mb-3">
                          <Search className="h-5 w-5 text-slate-400" />
                        </div>
                        No bank accounts found for this filter.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => (
                    <TableRow key={acc.id} className="hover:bg-slate-50/40 transition-colors">
                      <TableCell className="py-2.5 px-4">
                        <div className="font-bold text-slate-900 text-xs leading-snug">{acc.owner.name}</div>
                        <div className="text-[10px] text-slate-400 font-semibold max-w-[180px] truncate" title={acc.owner.email}>{acc.owner.email}</div>
                        <Badge variant="outline" className="mt-1 text-[9px] font-bold uppercase tracking-wider py-0 px-1 bg-slate-50 text-slate-600 border-slate-200/60">
                          {acc.owner.ownerType === "rider" ? "Rider" : acc.owner.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <div className="font-bold text-slate-800 text-xs leading-snug">{acc.bankName}</div>
                        <div className="text-[10px] text-slate-400 font-semibold mt-0.5">Code: {acc.bankCode || "—"}</div>
                        {acc.isPrimary && (
                          <Badge className="mt-1 bg-amber-50 text-amber-800 border-amber-200/50 hover:bg-amber-50 text-[9px] font-bold py-0 px-1">Default</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-4">
                        <div className="font-mono text-xs font-black text-slate-900 tracking-tight">{acc.accountNumber}</div>
                        <div className="text-[10px] text-slate-500 font-semibold uppercase mt-0.5 max-w-[150px] truncate" title={acc.accountName}>{acc.accountName}</div>
                        {acc.verificationNotes && (
                          <p className="text-[9px] text-slate-400 mt-1 max-w-[180px] line-clamp-1 leading-normal font-semibold" title={acc.verificationNotes}>
                            {acc.verificationNotes}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="py-2.5 px-4">{statusBadge(acc)}</TableCell>
                      <TableCell className="py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] font-bold px-2.5 shrink-0 shadow-sm"
                            disabled={actionLoadingId === acc.id}
                            onClick={() => void handleReverify(acc.id)}
                          >
                            {actionLoadingId === acc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-3 w-3 mr-1 text-slate-500" />
                                Verify
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] font-bold px-2.5 shrink-0 border-amber-150 bg-amber-50/30 text-amber-800 hover:bg-amber-50 hover:border-amber-200 shadow-sm"
                            onClick={() => openReviewDialog(acc, "require_documents")}
                          >
                            <FileWarning className="h-3 w-3 mr-1 text-amber-600" />
                            Req Docs
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] font-bold px-2.5 shrink-0 border-rose-150 bg-rose-50/30 text-rose-700 hover:bg-rose-50 hover:border-rose-200 shadow-sm"
                            onClick={() => openReviewDialog(acc, "reject")}
                          >
                            <XCircle className="h-3 w-3 mr-1 text-rose-500" />
                            Reject
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Page <span className="text-slate-800">{page}</span> of <span className="text-slate-800">{totalPages}</span></span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-lg shadow-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4 text-slate-500" />
              </Button>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-lg shadow-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4 text-slate-500" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* DIALOG DETAILS */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-5 border border-slate-200">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-base font-extrabold text-slate-900 leading-tight">
              {reviewAction === "reject" ? "Reject Bank Account" : "Request Additional Documents"}
            </DialogTitle>
            <DialogDescription className="text-xs font-medium text-slate-500 leading-relaxed">
              {reviewAccount
                ? `${reviewAccount.bankName} · ****${reviewAccount.accountNumber.slice(-4)} · ${reviewAccount.owner.name}`
                : ""}
              <span className="block mt-1 font-semibold text-indigo-600">
                A support ticket will be opened and the user will be emailed to reply in Help &amp; Support.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-1 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="review-reason" className="text-slate-600 font-bold">
                {reviewAction === "reject" ? "Rejection Reason" : "Message to User"}
              </Label>
              <Textarea
                id="review-reason"
                rows={3}
                className="text-xs border-slate-200 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-emerald-500"
                placeholder={
                  reviewAction === "reject"
                    ? "Explain why this account cannot be used for payouts…"
                    : "Explain what we found and why documents are needed…"
                }
                value={reviewReason}
                onChange={(e) => setReviewReason(e.target.value)}
              />
            </div>

            {reviewAction === "require_documents" && (
              <div className="space-y-1.5">
                <Label htmlFor="requested-docs" className="text-slate-600 font-bold">Documents to submit</Label>
                <Textarea
                  id="requested-docs"
                  rows={4}
                  className="text-xs font-mono border-slate-200 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-emerald-500"
                  placeholder="List each document on its own line…"
                  value={requestedDocuments}
                  onChange={(e) => setRequestedDocuments(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1.5">
              <Checkbox
                id="send-email"
                checked={sendEmail}
                onCheckedChange={(v) => setSendEmail(Boolean(v))}
              />
              <Label htmlFor="send-email" className="text-xs font-semibold text-slate-600 cursor-pointer">
                Send email notification to <span className="font-bold text-slate-850">{reviewAccount?.owner.email || "user"}</span>
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-slate-100">
            <Button variant="outline" size="sm" className="h-9 text-xs font-bold" onClick={() => setReviewOpen(false)} disabled={submittingReview}>
              Cancel
            </Button>
            <Button
              variant={reviewAction === "reject" ? "destructive" : "default"}
              size="sm"
              className="h-9 text-xs font-bold"
              onClick={() => void submitReview()}
              disabled={submittingReview}
            >
              {submittingReview ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : null}
              {reviewAction === "reject" ? "Reject Account" : "Request Docs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
  loading = false,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone?: "default" | "success" | "warning"
  loading?: boolean
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 bg-emerald-50 border-emerald-100/50"
      : tone === "warning"
        ? "text-amber-600 bg-amber-50 border-amber-100/50"
        : "text-slate-600 bg-slate-50 border-slate-200/60"

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border mb-2.5 ${toneClass}`}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        {loading ? (
          <div className="h-6 bg-slate-100 rounded w-16 mt-1 animate-pulse" />
        ) : (
          <p className="text-lg font-black text-slate-900 mt-0.5 tracking-tight">{value}</p>
        )}
      </div>
    </div>
  )
}