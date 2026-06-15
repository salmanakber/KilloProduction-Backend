"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  Search, 
  RefreshCw, 
  Loader2, 
  AlertCircle, 
  Filter, 
  ChevronLeft, 
  ChevronRight, 
  Activity, 
  Landmark, 
  Wallet,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  Copy
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Payout {
  id: string
  kind: "TRANSFER_PAYOUT" | "WALLET_WITHDRAWAL"
  transfer: {
    id: string
    reference: string
    status?: string
    sender: { id: string; name: string }
    receiver: { id: string; name: string }
  } | null
  user?: { id: string; name: string } | null
  rawStatus?: string
  amount: number
  currency: string
  status: string
  bankName: string
  accountNumber: string
  accountName: string
  paystackTransferCode: string | null
  paystackReference: string | null
  failureReason: string | null
  retryCount: number
  payoutQueued?: boolean
  needsManualProcessing?: boolean
  confirmToken?: string
  createdAt: string
  processedAt: string | null
  completedAt: string | null
  failedAt: string | null
}

type TreasurySnapshot = {
  paystack?: { balances: Array<{ currency: string; balanceMajor: number }> } | null
  paystackError?: string | null
  stripe?: {
    configured: boolean
    balances: Array<{ currency: string; available: number; pending: number }>
    error?: string
  } | null
  liquidity?: {
    pendingWalletWithdrawalsAmount: number
    pendingWalletWithdrawalsCount: number
    pendingPayoutsAmount: number
    ngnPaystackAvailable: number | null
  }
  withdrawalSmart?: {
    autoApproveEnabled: boolean
    paystackLiquidityUnknown: boolean
    showWarning: boolean
  }
}

export default function MoneyTransferPayouts() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [retrying, setRetrying] = useState<string | null>(null)
  
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 10 

  const { toast } = useToast()
  const [treasury, setTreasury] = useState<TreasurySnapshot | null>(null)
  const [treasuryLoading, setTreasuryLoading] = useState(true)

  const fetchTreasury = async () => {
    try {
      setTreasuryLoading(true)
      const res = await fetch("/api/admin/money-app-admin/paystack-balance")
      const data = await res.json()
      if (data.success) {
        setTreasury({
          paystack: data.paystack,
          paystackError: data.paystackError,
          stripe: data.stripe,
          liquidity: data.liquidity,
          withdrawalSmart: data.withdrawalSmart,
        })
      }
    } catch (e) {
      console.error("treasury fetch", e)
    } finally {
      setTreasuryLoading(false)
    }
  }

  useEffect(() => { fetchTreasury() }, [])
  useEffect(() => { fetchPayouts() }, [statusFilter, currentPage])

  const fetchPayouts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (search) params.append("search", search)
      params.append("page", currentPage.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/admin/money-app-admin/payouts?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setPayouts(data.payouts)
        setTotalPages(data.pagination?.totalPages || data.totalPages || 1)
        setTotalItems(data.pagination?.total || data.total || data.payouts?.length || 0)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleApproveWallet = async (id: string) => {
    const reason = window.prompt("Reason for approving withdrawal (required):")
    if (!reason?.trim()) return
    const confirmToken = window.prompt(`Type exactly:\nCONFIRM:WD-${id.slice(0, 8)}`)
    if (confirmToken !== `CONFIRM:WD-${id.slice(0, 8)}`) {
      toast({ title: "Confirmation failed", variant: "destructive" })
      return
    }
    try {
      setRetrying(id)
      const res = await fetch(`/api/admin/money-app-admin/wallet-withdrawals/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", reason, confirmToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: "Withdrawal sent to bank" })
        fetchPayouts()
      } else throw new Error(data.error)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setRetrying(null)
    }
  }

  const payoutConfirm = (payoutId: string) => `CONFIRM:PO-${payoutId.slice(0, 8)}`

  const handleRetryPayout = async (payoutId: string) => {
    const token = payoutConfirm(payoutId)
    const reason = window.prompt("Reason for payout retry (required):")
    if (!reason?.trim()) return
    const typed = window.prompt(`Type exactly to confirm:\n${token}`)
    if (typed?.trim() !== token) {
      toast({ title: "Confirmation failed", description: `Expected: ${token}`, variant: "destructive" })
      return
    }
    try {
      setRetrying(payoutId)
      const response = await fetch("/api/admin/money-app-admin/retry-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId, reason: reason.trim(), confirmToken: token }),
      })
      const data = await response.json()
      if (data.success) {
        toast({ title: "Success", description: "Payout retry initiated" })
        fetchPayouts()
      } else throw new Error(data.error)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setRetrying(null)
    }
  }

  const handleTransferPayoutAction = async (
    payoutId: string,
    action: "process" | "mark_completed" | "mark_failed",
    label: string,
  ) => {
    const token = payoutConfirm(payoutId)
    const reason = window.prompt(`Reason for ${label} (required):`)
    if (!reason?.trim()) return
    const typed = window.prompt(`Type exactly to confirm:\n${token}`)
    if (typed?.trim() !== token) {
      toast({ title: "Confirmation failed", description: `Expected: ${token}`, variant: "destructive" })
      return
    }
    try {
      setRetrying(payoutId)
      const res = await fetch(`/api/admin/money-app-admin/payouts/${payoutId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim(), confirmToken: token }),
      })
      const data = await res.json()
      if (data.success) {
        toast({ title: "Success", description: `${label} applied` })
        fetchPayouts()
        fetchTreasury()
      } else throw new Error(data.error)
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" })
    } finally {
      setRetrying(null)
    }
  }

  const pendingManualCount = payouts.filter(
    (p) => p.kind === "TRANSFER_PAYOUT" && p.needsManualProcessing && p.status !== "SUCCESS",
  ).length

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      PENDING: "bg-amber-50 text-amber-700 border-amber-200",
      PROCESSING: "bg-blue-50 text-blue-700 border-blue-200", 
      SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
      FAILED: "bg-rose-50 text-rose-700 border-rose-200",
      REVERSED: "bg-slate-100 text-slate-700 border-slate-200",
    }
    return variants[status] || "bg-slate-100 text-slate-700 border-slate-200"
  }

  const handleSearch = () => { setCurrentPage(1); fetchPayouts(); }
  const handleReset = () => { setSearch(""); setStatusFilter("all"); setCurrentPage(1); fetchPayouts(); }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Payout & Withdrawal Hub</h1>
            <p className="text-slate-500 font-medium max-w-2xl">
              Unified ledger for multi-currency payouts. NGN bank rails via Paystack — with manual processing when API payouts fail or are queued.
            </p>
            <div className="flex gap-4 pt-3">
              <Link href="/admin/money-app-admin/config" className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                <Landmark className="h-3.5 w-3.5" /> Network Config
              </Link>
              <Link href="/admin/settings?tab=notifications&moneyReceipts=1" className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> Receipt Logic
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => fetchTreasury()} disabled={treasuryLoading} className="bg-white shadow-sm h-11 px-5 border-slate-200">
              {treasuryLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2 font-bold">Treasury Sync</span>
            </Button>
            <div className="flex items-center space-x-3 bg-slate-900 text-white px-5 py-2.5 rounded-2xl shadow-lg">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
              </div>
              <span className="text-xs font-bold tracking-tight">Payouts</span>
            </div>
          </div>
        </div>
      </div>

      {/* SMART ALERT */}
      {pendingManualCount > 0 && (
        <Alert className="border-amber-200 bg-amber-50 rounded-2xl shadow-sm border-l-4 border-l-amber-500">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <div className="ml-2">
            <AlertTitle className="text-amber-900 font-black uppercase text-xs tracking-wider">
              {pendingManualCount} payout(s) need manual action
            </AlertTitle>
            <AlertDescription className="text-amber-800 text-sm mt-1 font-medium">
              Payment was collected but Paystack could not auto-send to the bank (e.g. starter account limits).
              Use <strong>Send via Paystack</strong> after upgrading, or <strong>Mark completed (manual)</strong> if you paid the recipient outside the API.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {treasury?.withdrawalSmart?.showWarning && (
        <Alert className="border-amber-200 bg-amber-50 rounded-2xl shadow-sm border-l-4 border-l-amber-500">
          <AlertCircle className="h-5 w-5 text-amber-600" />
          <div className="ml-2">
            <AlertTitle className="text-amber-900 font-black uppercase text-xs tracking-wider">Auto-Approve Disabled</AlertTitle>
            <AlertDescription className="text-amber-800 text-sm mt-1 font-medium">
              {treasury.paystackError ? `Paystack: ${treasury.paystackError}` : "System cannot determine NGN balance for automatic approval."}
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* TREASURY SNAPSHOT GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-teal-50 rounded-xl group-hover:bg-teal-600 group-hover:text-white transition-all">
                <Landmark className="h-6 w-6" />
              </div>
              <Badge variant="secondary" className="bg-teal-50 text-teal-700 font-bold border-none">PAYSTACK</Badge>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NGN Balance</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              ₦{(treasury?.paystack?.balances?.find(b => b.currency === "NGN")?.balanceMajor ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </h3>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-all">
                <ArrowUpRight className="h-6 w-6" />
              </div>
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 font-bold border-none">STRIPE</Badge>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Available Funds</p>
            <div className="mt-2 space-y-1">
              {treasury?.stripe?.balances?.slice(0, 2).map(b => (
                <div key={b.currency} className="flex justify-between text-xs font-bold">
                  <span className="text-slate-500">{b.currency}</span>
                  <span className="text-slate-900">{b.available.toFixed(2)}</span>
                </div>
              ))}
              {(!treasury?.stripe?.balances || treasury.stripe.balances.length === 0) && <p className="text-xs text-slate-400 italic">No available rows</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white overflow-hidden group">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-all">
                <Wallet className="h-6 w-6" />
              </div>
              <Badge variant="secondary" className="bg-amber-50 text-amber-700 font-bold border-none">PENDING WD</Badge>
            </div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Outstanding Claims</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              ₦{(treasury?.liquidity?.pendingWalletWithdrawalsAmount ?? 0).toLocaleString()}
            </h3>
            <p className="text-[10px] font-bold text-slate-400 mt-1">Across {treasury?.liquidity?.pendingWalletWithdrawalsCount ?? 0} Requests</p>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-teal-900 text-white overflow-hidden">
          <CardContent className="p-6 relative">
            <AlertCircle className="absolute -right-4 -bottom-4 h-24 w-24 text-white/5" />
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-teal-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">Liquidity Hint</span>
            </div>
            <p className="text-[10px] font-bold text-teal-100/60 uppercase tracking-widest">Safe Payout Cap</p>
            <h3 className="text-2xl font-black mt-1">
              ₦{(treasury?.liquidity?.ngnPaystackAvailable ?? 0).toLocaleString()}
            </h3>
            <p className="text-[10px] text-teal-100/50 mt-1 font-medium leading-tight">After deducting buffer vs. NGN queue</p>
          </CardContent>
        </Card>
      </div>

      {/* FILTER & TABLE SECTION */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 bg-slate-50/50 border-b border-slate-200 flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Reference, account, or name..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 bg-white border-slate-200 focus-visible:ring-teal-600 h-11"
            />
          </div>
          <div className="flex w-full md:w-auto gap-2">
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full md:w-[180px] h-11 bg-white">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="PROCESSING">Processing</SelectItem>
                <SelectItem value="SUCCESS">Success</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} className="h-11 bg-teal-600 hover:bg-teal-700 px-6 font-bold shadow-sm">Search</Button>
            <Button variant="ghost" onClick={handleReset} className="h-11 text-slate-500 hover:text-slate-900 font-bold">Reset</Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-b border-slate-200">
                <TableHead className="w-[180px] text-[10px] font-bold uppercase tracking-wider pl-6 py-4">Transaction / Type</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider py-4">Recipient</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider py-4">Financials</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider py-4">Bank Destination</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider py-4">Status & Logic</TableHead>
                <TableHead className="text-[10px] font-bold uppercase tracking-wider py-4 text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-64 text-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600 mx-auto" /></TableCell></TableRow>
              ) : payouts.map((payout) => (
                <TableRow key={payout.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                  <TableCell className="pl-6">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                         {payout.kind === "WALLET_WITHDRAWAL" ? (
                           <div className="p-1.5 bg-amber-50 rounded-lg"><Wallet className="h-3 w-3 text-amber-600" /></div>
                         ) : (
                           <div className="p-1.5 bg-teal-50 rounded-lg"><ArrowUpRight className="h-3 w-3 text-teal-600" /></div>
                         )}
                         <span className="font-mono text-[11px] font-black text-slate-900 tracking-tighter">
                           {payout.kind === "WALLET_WITHDRAWAL" ? `WD-${payout.id.slice(0, 8)}` : payout.transfer?.reference}
                         </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase pl-7">{payout.kind.replace("_", " ")}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="font-bold text-slate-900 text-sm truncate max-w-[150px]">
                      {payout.kind === "WALLET_WITHDRAWAL" ? payout.user?.name : payout.transfer?.receiver?.name}
                    </p>
                    <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">{new Date(payout.createdAt).toLocaleDateString()} &bull; {new Date(payout.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-black text-slate-900">
                          {payout.currency === "NGN" ? "₦" : payout.currency} {payout.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase">Retries: {payout.retryCount}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-slate-400" />
                        <span className="text-xs font-bold text-slate-900">{payout.bankName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{payout.accountNumber}</span>
                        <span className="text-[10px] font-bold text-slate-400 truncate max-w-[100px]">{payout.accountName}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Badge variant="outline" className={`font-bold border text-[10px] px-2 py-0 h-5 ${getStatusBadge(payout.status)}`}>
                        {payout.status}
                      </Badge>
                      {payout.payoutQueued && payout.status === "PENDING" && (
                        <Badge variant="outline" className="font-bold border text-[10px] px-2 py-0 h-5 bg-violet-50 text-violet-700 border-violet-200">
                          QUEUED
                        </Badge>
                      )}
                      {payout.failureReason && (
                        <div className="bg-rose-50 border border-rose-100 p-2 rounded-lg max-w-[180px]">
                           <p className="text-[10px] font-bold text-rose-700 leading-tight italic">"{payout.failureReason}"</p>
                        </div>
                      )}
                      {payout.paystackReference && (
                        <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                          <Copy className="h-2.5 w-2.5" /> {payout.paystackReference}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <div className="flex flex-col items-end gap-1.5">
                    {payout.kind === "WALLET_WITHDRAWAL" && (payout.rawStatus === "PENDING" || payout.rawStatus === "FAILED") && (
                      <Button size="sm" onClick={() => handleApproveWallet(payout.id)} disabled={retrying === payout.id} className="bg-teal-600 hover:bg-teal-700 font-bold h-8 rounded-lg shadow-sm">
                        {retrying === payout.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Approve WD"}
                      </Button>
                    )}
                    {payout.kind === "TRANSFER_PAYOUT" && payout.transfer && payout.status === "PENDING" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleTransferPayoutAction(payout.id, "process", "Paystack send")}
                          disabled={retrying === payout.id}
                          className="bg-teal-600 hover:bg-teal-700 font-bold h-8 rounded-lg shadow-sm w-full"
                        >
                          {retrying === payout.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send via Paystack"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTransferPayoutAction(payout.id, "mark_completed", "manual completion")}
                          disabled={retrying === payout.id}
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold h-8 rounded-lg w-full"
                        >
                          Mark completed (manual)
                        </Button>
                      </>
                    )}
                    {payout.kind === "TRANSFER_PAYOUT" && payout.transfer && payout.status === "PROCESSING" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTransferPayoutAction(payout.id, "mark_completed", "manual completion")}
                        disabled={retrying === payout.id}
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold h-8 rounded-lg"
                      >
                        Mark completed (manual)
                      </Button>
                    )}
                    {payout.kind === "TRANSFER_PAYOUT" && payout.status === "FAILED" && payout.transfer && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => handleRetryPayout(payout.id)} disabled={retrying === payout.id} className="border-slate-200 text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 font-bold h-8 rounded-lg shadow-sm w-full">
                          {retrying === payout.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RefreshCw className="h-3 w-3 mr-1.5" /> Retry Paystack</>}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTransferPayoutAction(payout.id, "mark_completed", "manual completion")}
                          disabled={retrying === payout.id}
                          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold h-8 rounded-lg w-full"
                        >
                          Mark completed (manual)
                        </Button>
                      </>
                    )}
                    {payout.kind === "TRANSFER_PAYOUT" && payout.transfer && (
                      <Link
                        href={`/admin/money-app-admin/transactions/${payout.transfer.id}`}
                        className="text-[10px] font-bold text-teal-600 hover:text-teal-700"
                      >
                        View transfer →
                      </Link>
                    )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* PAGINATION */}
        {!loading && payouts.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 bg-white border-slate-200">
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 bg-white border-slate-200">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}