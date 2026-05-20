"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { 
  Loader2, 
  Database, 
  Search, 
  Save, 
  ExternalLink, 
  ShieldAlert, 
  History, 
  FileJson, 
  ArrowRightLeft,
  AlertTriangle
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type RecordKind = "transfer" | "payout" | "wallet_tx" | "withdrawal"

const TRANSFER_STATUSES = ["PENDING", "PROCESSING", "SENT", "COMPLETED", "FAILED", "CANCELLED", "REFUNDED"] as const
const PAYOUT_STATUSES = ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "REVERSED"] as const
const WALLET_TX_TYPES = ["CREDIT", "DEBIT", "WITHDRAWAL", "ADJUSTMENT"] as const
const WITHDRAWAL_STATUSES = ["PENDING", "SCHEDULED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "REJECTED"] as const
const SETTLEMENT_MODES = ["WALLET", "DIRECT_BANK"] as const

function jsonPretty(v: unknown): string {
  if (v == null) return "{}"
  try { return JSON.stringify(v, null, 2) } catch { return "{}" }
}

function parseMetadataJson(raw: string | undefined, toast: any): unknown | undefined | null {
  const t = (raw ?? "").trim()
  if (!t) return undefined
  try { return JSON.parse(t) as unknown } catch {
    toast({ title: "Invalid metadata JSON", variant: "destructive" })
    return null
  }
}

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function MoneyTransferRecordsPage() {
  const { toast } = useToast()
  const [recordType, setRecordType] = useState<RecordKind>("transfer")
  const [recordId, setRecordId] = useState("")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [loaded, setLoaded] = useState<{
    kind: RecordKind
    transfer?: Record<string, unknown>
    payout?: Record<string, unknown>
    walletTx?: Record<string, unknown>
    withdrawal?: Record<string, unknown>
  } | null>(null)

  const [fields, setFields] = useState<Record<string, string>>({})
  const setField = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }))
  const resetLoaded = () => { setLoaded(null); setFields({}); }
  const handleTypeChange = (v: RecordKind) => { setRecordType(v); resetLoaded(); }

  const loadRecord = async () => {
    const id = recordId.trim()
    if (!id) { toast({ title: "Enter a record ID", variant: "destructive" }); return; }
    setLoading(true)
    try {
      if (recordType === "transfer") {
        const res = await fetch(`/api/admin/money-app-admin/transactions/${encodeURIComponent(id)}`)
        const data = await res.json()
        if (!res.ok || !data.transfer) throw new Error(data.error || "Not found")
        const t = data.transfer as Record<string, unknown>
        setLoaded({ kind: "transfer", transfer: t })
        setFields({
          status: String(t.status ?? ""),
          amount: String(t.amount ?? ""),
          currency: String(t.currency ?? ""),
          receiveAmount: t.receiveAmount != null ? String(t.receiveAmount) : "",
          receiveCurrency: String(t.receiveCurrency ?? ""),
          description: String(t.description ?? ""),
          settlementMode: String(t.settlementMode ?? "WALLET"),
          metadataJson: jsonPretty(t.metadata),
        })
      } else if (recordType === "payout") {
        const res = await fetch(`/api/admin/money-app-admin/records/payout/${id}`)
        const data = await res.json()
        const p = data.payout as Record<string, unknown>
        setLoaded({ kind: "payout", payout: p })
        setFields({
          status: String(p.status ?? ""),
          amount: String(p.amount ?? ""),
          currency: String(p.currency ?? ""),
          bankName: String(p.bankName ?? ""),
          accountNumber: String(p.accountNumber ?? ""),
          accountName: String(p.accountName ?? ""),
          bankCode: String(p.bankCode ?? ""),
          failureReason: String(p.failureReason ?? ""),
          paystackReference: String(p.paystackReference ?? ""),
          metadataJson: jsonPretty(p.metadata),
        })
      } else if (recordType === "wallet_tx") {
        const res = await fetch(`/api/admin/money-app-admin/records/wallet-transaction/${id}`)
        const data = await res.json()
        const tx = data.transaction as Record<string, unknown>
        setLoaded({ kind: "wallet_tx", walletTx: tx })
        setFields({
          description: String(tx.description ?? ""),
          amount: String(tx.amount ?? ""),
          currency: String(tx.currency ?? ""),
          type: String(tx.type ?? ""),
          reference: String(tx.reference ?? ""),
          metadataJson: jsonPretty(tx.metadata),
        })
      } else {
        const res = await fetch(`/api/admin/money-app-admin/wallet-withdrawals/${id}`)
        const data = await res.json()
        const w = data.withdrawal as Record<string, unknown>
        setLoaded({ kind: "withdrawal", withdrawal: w })
        setFields({
          status: String(w.status ?? ""),
          failureReason: String(w.failureReason ?? ""),
          scheduledLocal: toDatetimeLocalValue(w.scheduledProcessAt as string | undefined),
          metadataJson: jsonPretty(w.metadata),
        })
      }
      toast({ title: "Success", description: "Record loaded from database" })
    } catch (e: any) {
      setLoaded(null); setFields({});
      toast({ title: "Load failed", description: e.message, variant: "destructive" })
    } finally { setLoading(false) }
  }

  const handleSave = async () => {
    const id = recordId.trim()
    if (!id || !reason.trim()) {
      toast({ title: "Missing details", description: "Reason for change is mandatory.", variant: "destructive" })
      return
    }
    const paths: Record<RecordKind, string> = {
      transfer: `/api/admin/money-app-admin/transactions/${encodeURIComponent(id)}`,
      payout: `/api/admin/money-app-admin/records/payout/${encodeURIComponent(id)}`,
      wallet_tx: `/api/admin/money-app-admin/records/wallet-transaction/${encodeURIComponent(id)}`,
      withdrawal: `/api/admin/money-app-admin/wallet-withdrawals/${encodeURIComponent(id)}`,
    }

    let payload: Record<string, unknown> = { reason: reason.trim() }
    const meta = parseMetadataJson(fields.metadataJson, toast)
    if (meta === null) return

    if (recordType === "transfer") {
      payload = { ...payload, status: fields.status, amount: Number(fields.amount), currency: fields.currency, receiveAmount: fields.receiveAmount ? Number(fields.receiveAmount) : null, receiveCurrency: fields.receiveCurrency, description: fields.description, settlementMode: fields.settlementMode, metadata: meta }
    } else if (recordType === "payout") {
      payload = { ...payload, status: fields.status, amount: Number(fields.amount), currency: fields.currency, bankName: fields.bankName, accountNumber: fields.accountNumber, accountName: fields.accountName, bankCode: fields.bankCode, failureReason: fields.failureReason || null, paystackReference: fields.paystackReference || null, metadata: meta }
    } else if (recordType === "wallet_tx") {
      payload = { ...payload, description: fields.description, amount: Number(fields.amount), currency: fields.currency, type: fields.type, reference: fields.reference || null, metadata: meta }
    } else {
      let scheduledProcessAt = fields.scheduledLocal ? new Date(fields.scheduledLocal).toISOString() : undefined
      payload = { ...payload, status: fields.status, failureReason: fields.failureReason || null, scheduledProcessAt, metadata: meta }
    }

    setSaving(true)
    try {
      const res = await fetch(paths[recordType], { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || "Update failed")
      toast({ title: "Update Applied", description: "The database record has been modified." })
      loadRecord()
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" })
    } finally { setSaving(false) }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="bg-slate-900 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
        <Database className="absolute -right-6 -bottom-6 h-48 w-48 text-white/5" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-teal-400">
              <ShieldAlert className="h-5 w-5" />
              <span className="text-xs font-black uppercase tracking-[0.2em]">Administrative Override</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">System Record Editor</h1>
            <p className="text-slate-400 text-sm font-medium max-w-xl">
              Direct database intervention tool. Changes are permanent and recorded in the master audit trail.
            </p>
          </div>
          <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 px-4 py-1.5 rounded-full font-bold">
            SUPER_ADMIN MODE
          </Badge>
        </div>
      </div>

      {/* SEARCH / FINDER */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
            <Search className="h-4 w-4" /> 1. Identify Target Record
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid md:grid-cols-3 gap-6 items-end">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">Collection</Label>
              <Select value={recordType} onValueChange={(v) => handleTypeChange(v as RecordKind)}>
                <SelectTrigger className="rounded-xl border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transfer">Money Transfers</SelectItem>
                  <SelectItem value="payout">Paystack Payouts</SelectItem>
                  <SelectItem value="wallet_tx">Wallet Transactions</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal Queue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400">Database ID / Reference</Label>
              <div className="flex gap-2">
                <Input
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  placeholder="Paste reference or cuid..."
                  className="rounded-xl border-slate-200 font-mono text-sm bg-white"
                />
                <Button 
                  onClick={loadRecord} 
                  disabled={loading} 
                  className="bg-slate-900 hover:bg-slate-800 rounded-xl px-8 font-bold"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Fetch Record"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loaded && (
        <div className="grid lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* LEFT: READ-ONLY CONTEXT */}
          <div className="lg:col-span-1 space-y-6">
            <Card className="border-slate-200 shadow-sm h-fit">
              <CardHeader className="bg-slate-50/80 py-4 border-b border-slate-100">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Database Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {loaded.kind === "transfer" && loaded.transfer && (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Ref</p>
                      <p className="font-mono text-xs font-bold break-all">{String(loaded.transfer.reference)}</p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Stripe ID</p>
                      <p className="font-mono text-[10px] break-all">{String(loaded.transfer.stripePaymentIntentId ?? "N/A")}</p>
                    </div>
                    <Button variant="outline" size="sm" asChild className="w-full rounded-xl text-teal-700 border-teal-100 hover:bg-teal-50">
                      <Link href={`/admin/money-app-admin/transactions/${String(loaded.transfer.id)}`} target="_blank">
                        View Transfer Hub <ExternalLink className="h-3.5 w-3.5 ml-2" />
                      </Link>
                    </Button>
                  </div>
                )}
                {/* Simplified displays for other types follow same pattern... */}
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <p className="text-[10px] font-medium text-amber-900 leading-tight">
                    Review values carefully. Manual changes bypass standard system validation hooks.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RIGHT: THE EDITOR */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200 shadow-md">
              <CardHeader className="bg-slate-50/80 border-b border-slate-100 flex flex-row justify-between items-center py-4">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <History className="h-4 w-4" /> 2. Modifications
                </CardTitle>
              </CardHeader>
              <CardContent className="p-8 space-y-8">
                
                {/* REASON FIELD - PROMINENT */}
                <div className="bg-slate-900 p-5 rounded-2xl space-y-2 shadow-inner">
                  <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                    Mandatory Audit Reason <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe why this manual intervention is required..."
                    className="bg-slate-800 border-slate-700 text-teal-100 placeholder:text-slate-500 rounded-xl h-12"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* DYNAMIC FIELDS BASED ON RECORD KIND */}
                  {loaded.kind === "transfer" && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Status</Label>
                        <Select value={fields.status} onValueChange={(v) => setField("status", v)}>
                          <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TRANSFER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Settlement Mode</Label>
                        <Select value={fields.settlementMode} onValueChange={(v) => setField("settlementMode", v)}>
                          <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SETTLEMENT_MODES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Send Amount ({fields.currency})</Label>
                        <Input type="number" value={fields.amount} onChange={(e) => setField("amount", e.target.value)} className="rounded-xl border-slate-200" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Receive Amount ({fields.receiveCurrency})</Label>
                        <Input type="number" value={fields.receiveAmount} onChange={(e) => setField("receiveAmount", e.target.value)} className="rounded-xl border-slate-200" />
                      </div>
                    </>
                  )}
                  {/* Withdrawal fields */}
                  {loaded.kind === "withdrawal" && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Status</Label>
                        <Select value={fields.status} onValueChange={(v) => setField("status", v)}>
                          <SelectTrigger className="rounded-xl border-slate-200"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {WITHDRAWAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Scheduled Process (Local)</Label>
                        <Input type="datetime-local" value={fields.scheduledLocal} onChange={(e) => setField("scheduledLocal", e.target.value)} className="rounded-xl border-slate-200" />
                      </div>
                    </>
                  )}
                  {/* Shared or other fields can be added here following pattern... */}
                </div>

                {/* METADATA EDITOR */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-teal-600" /> Raw Metadata (JSON)
                    </Label>
                    <span className="text-[10px] font-black text-slate-400">READ/WRITE</span>
                  </div>
                  <textarea
                    className="w-full min-h-[200px] rounded-2xl bg-slate-900 border-slate-800 text-teal-400 p-4 font-mono text-xs leading-relaxed focus:ring-2 focus:ring-teal-500/20 transition-all"
                    value={fields.metadataJson}
                    onChange={(e) => setField("metadataJson", e.target.value)}
                    spellCheck={false}
                  />
                </div>

                <div className="pt-6 border-t border-slate-100">
                  <Button
                    disabled={saving || !loaded}
                    onClick={handleSave}
                    className="w-full h-14 bg-teal-600 hover:bg-teal-700 rounded-2xl shadow-lg shadow-teal-100 flex items-center justify-center gap-3 text-lg font-black transition-all"
                  >
                    {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : <Save className="h-6 w-6" />}
                    Commit Changes to Database
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}