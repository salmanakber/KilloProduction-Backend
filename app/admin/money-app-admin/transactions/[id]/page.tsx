"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  Loader2, 
  ArrowLeft, 
  ShieldAlert, 
  User, 
  ArrowRight, 
  CreditCard, 
  History, 
  ExternalLink, 
  AlertTriangle,
  FileText,
  Clock
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useToast } from "@/hooks/use-toast"

export default function MoneyTransferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const id = params?.id as string

  const [loading, setLoading] = useState(true)
  const [transfer, setTransfer] = useState<any>(null)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [reason, setReason] = useState("")
  const [confirmToken, setConfirmToken] = useState("")
  const [payoutReason, setPayoutReason] = useState("")
  const [payoutConfirmToken, setPayoutConfirmToken] = useState("")
  const [acting, setActing] = useState(false)

  const transferConfirmCandidates = (ref: string, transferId: string) => [
    `CONFIRM:${ref}`,
    `CONFIRM:${transferId}`,
  ]

  const payoutConfirmFor = (payoutId: string) => `CONFIRM:PO-${payoutId.slice(0, 8)}`

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/transactions/${encodeURIComponent(id)}`)
      const json = await res.json()
      if (json.success) {
        setTransfer(json.transfer)
        setAuditLogs(json.auditLogs ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
  }, [id])

  const runPayoutAction = async (action: "process" | "mark_completed" | "mark_failed") => {
    if (!transfer?.payout?.id) return
    if (!payoutReason.trim()) {
      toast({ title: "Reason required", variant: "destructive" })
      return
    }
    const expected = payoutConfirmFor(transfer.payout.id)
    if (payoutConfirmToken.trim() !== expected) {
      toast({
        title: "Confirmation mismatch",
        description: `Type exactly: ${expected}`,
        variant: "destructive",
      })
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/payouts/${transfer.payout.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: payoutReason.trim(), confirmToken: expected }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: "Payout updated", description: `Payout action ${action} applied.` })
      setPayoutConfirmToken("")
      setPayoutReason("")
      load()
    } catch (e: unknown) {
      toast({
        title: "Payout action failed",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive",
      })
    } finally {
      setActing(false)
    }
  }

  const payoutNeedsManual =
    transfer?.payout &&
    ["PENDING", "PROCESSING", "FAILED"].includes(transfer.payout.status)

  const runAction = async (action: string, superOnly = false) => {
    if (!transfer) return
    if (!reason.trim()) {
      toast({ title: "Reason required", description: "Please state why you are performing this action.", variant: "destructive" })
      return
    }
    const candidates = transferConfirmCandidates(transfer.reference, transfer.id)
    if (!candidates.includes(confirmToken.trim())) {
      toast({
        title: "Confirmation mismatch",
        description: `Type CONFIRM:${transfer.reference} or CONFIRM:${transfer.id}`,
        variant: "destructive",
      })
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/transactions/${encodeURIComponent(id)}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, confirmToken: confirmToken.trim() }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: "Action Success", description: `${action} has been applied.` })
      setConfirmToken(""); setReason("");
      load()
    } catch (e: unknown) {
      toast({ title: "Action Failed", description: e instanceof Error ? e.message : "Error", variant: "destructive" })
    } finally {
      setActing(false)
    }
  }

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
      FAILED: "bg-rose-50 text-rose-700 border-rose-200",
      PENDING: "bg-amber-50 text-amber-700 border-amber-200",
      PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
    }
    return map[status] || "bg-slate-50 text-slate-700 border-slate-200"
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
        <p className="text-slate-500 font-medium animate-pulse">Retrieving transfer details...</p>
      </div>
    )
  }

  if (!transfer) return (
    <div className="p-12 text-center">
      <div className="bg-rose-50 text-rose-600 p-4 rounded-xl inline-block mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold">Transfer not found</h2>
      <Button variant="link" onClick={() => router.back()}>Return to list</Button>
    </div>
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Button 
          variant="ghost" 
          onClick={() => router.back()} 
          className="hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Ledger
        </Button>
        <div className="text-right">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Transaction Date</p>
          <p className="text-sm font-semibold text-slate-700">{new Date(transfer.createdAt).toLocaleString()}</p>
        </div>
      </div>

      {/* Main Header Card */}
      <Card className="border-none shadow-sm overflow-hidden bg-white">
        <div className="h-2 bg-teal-600" />
        <CardContent className="p-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-mono font-black text-slate-900 tracking-tighter">
                  {transfer.reference}
                </h1>
                <Badge variant="outline" className={`font-bold px-3 py-0.5 ${getStatusColor(transfer.status)}`}>
                  {transfer.status}
                </Badge>
              </div>
              <p className="text-slate-500 text-sm font-medium">Settlement Mode: <span className="text-slate-900">{transfer.settlementMode}</span></p>
            </div>
            
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 min-w-[240px]">
              <div className="flex justify-between items-end gap-8">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Amount</p>
                  <p className="text-2xl font-black text-slate-900">
                    {transfer.amount.toLocaleString()} <span className="text-sm font-normal text-slate-500">{transfer.currency}</span>
                  </p>
                </div>
                {transfer.receiveAmount && (
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-teal-600 uppercase">Recipient Gets</p>
                    <p className="text-xl font-bold text-teal-700">
                      {transfer.receiveAmount.toLocaleString()} <span className="text-xs font-normal opacity-70">{transfer.receiveCurrency}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator className="my-8" />

          {/* Transfer Flow */}
          <div className="grid md:grid-cols-3 gap-8 items-center">
            <div className="bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <User className="h-4 w-4 text-slate-500" />
                </div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">Sender</span>
              </div>
              <p className="font-bold text-slate-900">{transfer.sender?.name || "N/A"}</p>
              <p className="text-xs text-slate-500 truncate">{transfer.sender?.email}</p>
              <p className="text-xs text-slate-500 mt-1">{transfer.sender?.phone}</p>
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center mb-2">
                <ArrowRight className="h-5 w-5 text-teal-600" />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase">Network Exchange</p>
              {transfer.exchangeRate && (
                <p className="text-xs font-mono font-bold text-teal-600 mt-1">
                  1 {transfer.currency} = {transfer.exchangeRate} {transfer.receiveCurrency}
                </p>
              )}
            </div>

            <div className="bg-teal-50/30 p-5 rounded-2xl border border-teal-100/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-white rounded-lg shadow-sm">
                  <User className="h-4 w-4 text-teal-600" />
                </div>
                <span className="text-xs font-bold text-teal-600 uppercase tracking-tight">Receiver</span>
              </div>
              <p className="font-bold text-slate-900">{transfer.receiver?.name || "N/A"}</p>
              <p className="text-xs text-slate-500 truncate">{transfer.receiver?.email}</p>
              <p className="text-xs text-slate-500 mt-1">{transfer.receiver?.phone || "No phone provided"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Admin Section */}
          <Card className="border-amber-200 bg-amber-50/30 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <ShieldAlert className="h-24 w-24 text-amber-900" />
            </div>
            <CardHeader className="border-b border-amber-100 bg-amber-50">
              <CardTitle className="text-lg font-bold text-amber-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" /> Admin Security Operations
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-amber-800 uppercase ml-1">Action Reason</label>
                  <Input 
                    placeholder="Enter mandatory reason..." 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)}
                    className="bg-white border-amber-200 focus:ring-amber-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-amber-800 uppercase ml-1">Confirmation Token</label>
                  <Input
                    placeholder={`CONFIRM:${transfer.reference} or CONFIRM:${transfer.id}`}
                    value={confirmToken}
                    onChange={(e) => setConfirmToken(e.target.value)}
                    className="bg-white border-amber-200 font-mono text-xs focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="bg-amber-100/50 p-3 rounded-xl border border-amber-200/50">
                <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  <span className="font-bold uppercase mr-2">Authorization:</span> 
                  Destructive actions (Refunds/Cancellations) are logged permanently. Refund actions require SUPER_ADMIN privileges.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button disabled={acting} variant="outline" className="bg-white border-slate-200 hover:bg-slate-50 font-bold" onClick={() => runAction("CANCEL")}>
                  Cancel
                </Button>
                <Button disabled={acting} variant="outline" className="bg-white border-slate-200 hover:bg-rose-50 hover:text-rose-700 font-bold" onClick={() => runAction("MARK_FAILED")}>
                  Mark Failed
                </Button>
                <Button disabled={acting} variant="outline" className="bg-white border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 font-bold" onClick={() => runAction("MARK_COMPLETED")}>
                  Mark Completed
                </Button>
                <div className="flex-1 min-w-[10px]" />
                <Button disabled={acting} variant="secondary" className="font-bold" onClick={() => runAction("FORCE_WALLET_CREDIT", true)}>
                  Force Credit
                </Button>
                <Button
                  disabled={acting}
                  className="bg-rose-700 hover:bg-rose-800 font-bold text-white shadow-lg shadow-rose-100"
                  onClick={() => runAction("REFUND", true)}
                >
                  Process Refund
                </Button>
              </div>
            </CardContent>
          </Card>

          {payoutNeedsManual && (
            <Card className="border-violet-200 bg-violet-50/30 shadow-sm">
              <CardHeader className="border-b border-violet-100 bg-violet-50 py-4">
                <CardTitle className="text-base font-bold text-violet-900 flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Bank payout — manual management
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <p className="text-sm text-violet-800 font-medium">
                  Sender payment was received. Payout status:{" "}
                  <Badge variant="secondary" className="font-bold uppercase text-[10px]">
                    {transfer.payout.status}
                  </Badge>
                  {transfer.metadata?.payoutQueued && (
                    <span className="ml-2 text-xs text-violet-600 font-bold">(queued — API could not auto-send)</span>
                  )}
                </p>
                {transfer.payout.failureReason && (
                  <p className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-lg p-3 font-medium italic">
                    {transfer.payout.failureReason}
                  </p>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-violet-800 uppercase ml-1">Payout action reason</label>
                    <Input
                      placeholder="Why are you updating this payout?"
                      value={payoutReason}
                      onChange={(e) => setPayoutReason(e.target.value)}
                      className="bg-white border-violet-200 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-violet-800 uppercase ml-1">Payout confirmation</label>
                    <Input
                      placeholder={payoutConfirmFor(transfer.payout.id)}
                      value={payoutConfirmToken}
                      onChange={(e) => setPayoutConfirmToken(e.target.value)}
                      className="bg-white border-violet-200 font-mono text-xs"
                    />
                    <p className="text-[10px] text-violet-600 font-bold ml-1">
                      Type exactly: {payoutConfirmFor(transfer.payout.id)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {transfer.payout.status === "PENDING" && (
                    <Button
                      disabled={acting}
                      className="bg-teal-600 hover:bg-teal-700 font-bold"
                      onClick={() => runPayoutAction("process")}
                    >
                      Send via Paystack
                    </Button>
                  )}
                  {(transfer.payout.status === "PENDING" ||
                    transfer.payout.status === "PROCESSING" ||
                    transfer.payout.status === "FAILED") && (
                    <Button
                      disabled={acting}
                      variant="outline"
                      className="bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold"
                      onClick={() => runPayoutAction("mark_completed")}
                    >
                      Mark payout completed (manual)
                    </Button>
                  )}
                  {transfer.payout.status !== "SUCCESS" && (
                    <Button
                      disabled={acting}
                      variant="outline"
                      className="bg-white border-rose-200 text-rose-700 hover:bg-rose-50 font-bold"
                      onClick={() => runPayoutAction("mark_failed")}
                    >
                      Mark payout failed
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Technical Metadata */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="border-b border-slate-50 py-4">
              <CardTitle className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <FileText className="h-4 w-4" /> Provider Metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-50">
                <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-400">STRIPE PAYMENT INTENT</span>
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] bg-slate-100 px-2 py-1 rounded font-mono text-slate-700">
                      {transfer.stripePaymentIntentId || "no_intent_found"}
                    </code>
                    {transfer.stripePaymentIntentId && <ExternalLink className="h-3 w-3 text-slate-400 cursor-pointer hover:text-teal-600" />}
                  </div>
                </div>
                {transfer.payout && (
                  <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-400">PAYSTACK PAYOUT STATUS</span>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="text-[10px] font-black uppercase">{transfer.payout.status}</Badge>
                      <span className="text-[11px] font-mono text-slate-500">{transfer.payout.paystackReference}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Audit Logs Sidebar */}
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-sm h-full">
            <CardHeader className="border-b border-slate-50 bg-slate-50/50 py-4">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <History className="h-4 w-4 text-teal-600" /> Audit Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="relative space-y-6 before:absolute before:left-[11px] before:top-2 before:h-[calc(100%-16px)] before:w-[2px] before:bg-slate-100">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4 italic">No logs recorded yet</p>
                ) : (
                  auditLogs.map((log) => (
                    <div key={log.id} className="relative pl-8">
                      <div className="absolute left-0 top-1.5 h-6 w-6 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center z-10">
                        <div className="h-2 w-2 rounded-full bg-slate-400" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex justify-between items-start">
                          <span className="text-xs font-bold text-slate-900">{log.action}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono mt-1 break-all">
                          Performer: {log.performer?.email || "System"}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px] font-bold">{new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}