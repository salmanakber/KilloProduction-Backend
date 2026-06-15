"use client"

import { useEffect, useState } from "react"
import { 
  Loader2, 
  BarChart3, 
  TrendingUp, 
  AlertCircle, 
  RefreshCcw, 
  DollarSign, 
  ArrowUpRight, 
  ShieldAlert,
  Calendar,
  Layers,
  Globe,
  Wallet,
  Building2,
  ArrowDownToLine,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Report = {
  periodDays: number
  reportingCurrency: string
  summary: {
    transferCount: number
    volumeBase: number
    platformRevenueBase: number
    feeBase: number
    fxMarginBase: number
    failedCount: number
    refundCount: number
    openCases: number
    payoutCount: number
    payoutVolumeNgn: number
    walletTopUpCount: number
    walletTopUpVolume: number
  }
  byStatus: Array<{ status: string; count: number }>
  bySendCurrency: Array<{ currency: string; count: number; volume: number }>
  byReceiveCurrency: Array<{ currency: string; count: number; volume: number }>
  bySettlementMode: Array<{ mode: string; count: number; volume: number }>
  payouts: Array<{ status: string; count: number; volumeNgn: number }>
  walletCredits: Array<{ currency: string; count: number; volume: number }>
  walletDebits: Array<{ currency: string; count: number; volume: number }>
  walletFundedTransfers: number
}

export default function MoneyTransferReportsPage() {
  const [days, setDays] = useState("30")
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/reports?days=${days}`)
      const json = await res.json()
      if (json.success) setReport(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  const s = report?.summary

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5">
           <BarChart3 className="h-32 w-32 text-teal-900" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-teal-600 mb-1">
            <TrendingUp className="h-5 w-5" />
            <span className="text-xs font-black uppercase tracking-widest">Financial Intelligence</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Executive Summary</h1>
          <p className="text-slate-500 font-medium">Transfers, wallet flows, payouts, and revenue by currency.</p>
        </div>
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-2xl">
            <Calendar className="h-4 w-4 text-slate-400" />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-32 border-none bg-transparent focus:ring-0 font-bold text-slate-700 h-auto p-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last quarter</SelectItem>
                <SelectItem value="365">Full year</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={load} className="rounded-2xl border-slate-200 bg-white">
            <RefreshCcw className={`h-4 w-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="animate-spin text-teal-600 h-10 w-10" />
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Compiling Data...</p>
        </div>
      ) : s ? (
        <>
          {/* HERO METRICS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none bg-teal-600 text-white shadow-xl shadow-teal-900/10 overflow-hidden relative">
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <Layers className="h-40 w-40" />
              </div>
              <CardContent className="p-8">
                <p className="text-teal-100/70 text-xs font-black uppercase tracking-[0.2em] mb-2">Total Transaction Volume</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-5xl font-black tracking-tighter">
                    {s.volumeBase.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </h2>
                  <span className="text-xl font-bold text-teal-200">{report?.reportingCurrency}</span>
                </div>
                <div className="mt-6 flex items-center gap-2 bg-white/10 w-fit px-3 py-1.5 rounded-full border border-white/10">
                  <ArrowUpRight className="h-4 w-4 text-teal-300" />
                  <span className="text-xs font-bold tracking-tight text-teal-50">Processed {s.transferCount} transfers</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none bg-slate-900 text-white shadow-xl shadow-slate-900/10 overflow-hidden relative">
              <div className="absolute -right-4 -bottom-4 opacity-10">
                <DollarSign className="h-40 w-40" />
              </div>
              <CardContent className="p-8">
                <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em] mb-2">Platform Revenue</p>
                <div className="flex items-baseline gap-2">
                  <h2 className="text-5xl font-black tracking-tighter text-teal-400">
                    {s.platformRevenueBase.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </h2>
                  <span className="text-xl font-bold text-slate-500">{report?.reportingCurrency}</span>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-8 border-t border-white/5 pt-6">
                   <div>
                     <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Transfer Fees</p>
                     <p className="text-sm font-bold">{s.feeBase.toFixed(2)}</p>
                   </div>
                   <div>
                     <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">FX Spread Margin</p>
                     <p className="text-sm font-bold text-teal-500">+{s.fxMarginBase.toFixed(2)}</p>
                   </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* WALLET & PAYOUT METRICS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Metric 
              label="Bank Payouts" 
              value={String(s.payoutCount)} 
              icon={<Building2 className="h-4 w-4" />}
              variant="default" 
              sub={`₦${s.payoutVolumeNgn.toLocaleString(undefined, { maximumFractionDigits: 0 })} sent`}
            />
            <Metric 
              label="Wallet Top-ups" 
              value={String(s.walletTopUpCount)} 
              icon={<ArrowDownToLine className="h-4 w-4" />}
              variant="default" 
              sub={`Vol ${s.walletTopUpVolume.toFixed(0)}`}
            />
            <Metric 
              label="Wallet-funded Sends" 
              value={String(report?.walletFundedTransfers ?? 0)} 
              icon={<Wallet className="h-4 w-4" />}
              variant="default" 
              sub="Paid from balance"
            />
            <Metric 
              label="Pending Issues" 
              value={String(s.openCases)} 
              icon={<ShieldAlert className="h-4 w-4" />}
              variant={s.openCases > 0 ? "warn" : "default"} 
              sub="Open cases"
            />
          </div>

          {/* SECONDARY METRICS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Metric 
              label="System Failures" 
              value={String(s.failedCount)} 
              icon={<AlertCircle className="h-4 w-4" />}
              variant={s.failedCount > 5 ? "danger" : "default"} 
              sub="Failed transfers"
            />
            <Metric 
              label="Refunds" 
              value={String(s.refundCount)} 
              icon={<RefreshCcw className="h-4 w-4" />}
              variant="default" 
              sub="Reversed"
            />
            <Metric 
              label="Report Period" 
              value={days} 
              icon={<Calendar className="h-4 w-4" />}
              variant="default" 
              sub="Active days"
            />
            <Metric 
              label="Receive currencies" 
              value={String(report?.byReceiveCurrency?.length ?? 0)} 
              icon={<Globe className="h-4 w-4" />}
              variant="default" 
              sub="Distinct pairs"
            />
          </div>

          {/* DATA BREAKDOWNS */}
          <div className="grid md:grid-cols-3 gap-6">
            <TableCard 
              title="Transaction Status" 
              icon={<Layers className="h-4 w-4" />}
              total={s.transferCount}
              rows={(report?.byStatus ?? []).map((r) => ({
                label: r.status,
                value: String(r.count),
                count: r.count
              }))} 
            />
            <TableCard
              title="Send Currency"
              icon={<Globe className="h-4 w-4" />}
              total={s.transferCount}
              rows={(report?.bySendCurrency ?? []).map((r) => ({
                label: r.currency,
                value: `Vol ${r.volume.toFixed(0)}`,
                count: r.count
              }))}
            />
            <TableCard
              title="Receive Currency"
              icon={<Globe className="h-4 w-4" />}
              total={s.transferCount}
              rows={(report?.byReceiveCurrency ?? []).map((r) => ({
                label: r.currency,
                value: `Vol ${r.volume.toFixed(0)}`,
                count: r.count
              }))}
            />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <TableCard
              title="Settlement Mode"
              icon={<TrendingUp className="h-4 w-4" />}
              total={s.transferCount}
              rows={(report?.bySettlementMode ?? []).map((r) => ({
                label: r.mode,
                value: `Vol ${r.volume.toFixed(0)}`,
                count: r.count
              }))}
            />
            <TableCard
              title="Paystack Payouts"
              icon={<Building2 className="h-4 w-4" />}
              total={s.payoutCount || 1}
              rows={(report?.payouts ?? []).map((r) => ({
                label: r.status,
                value: `₦${r.volumeNgn.toFixed(0)}`,
                count: r.count
              }))}
            />
            <TableCard
              title="Wallet Credits"
              icon={<Wallet className="h-4 w-4" />}
              total={(report?.walletCredits ?? []).reduce((n, r) => n + r.count, 0) || 1}
              rows={(report?.walletCredits ?? []).map((r) => ({
                label: r.currency,
                value: `Vol ${r.volume.toFixed(0)}`,
                count: r.count
              }))}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <TableCard
              title="Wallet Debits & Withdrawals"
              icon={<ArrowUpRight className="h-4 w-4" />}
              total={(report?.walletDebits ?? []).reduce((n, r) => n + r.count, 0) || 1}
              rows={(report?.walletDebits ?? []).map((r) => ({
                label: r.currency,
                value: `Vol ${r.volume.toFixed(0)}`,
                count: r.count
              }))}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}

function Metric({ label, value, icon, variant, sub }: { label: string; value: string; icon: React.ReactNode; variant: 'default' | 'warn' | 'danger'; sub: string }) {
  const styles = {
    default: "bg-white border-slate-200 text-slate-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900 shadow-sm shadow-amber-900/5",
    danger: "bg-rose-50 border-rose-200 text-rose-900 shadow-sm shadow-rose-900/5"
  }
  
  const iconColors = {
    default: "text-slate-400 bg-slate-50",
    warn: "text-amber-600 bg-white/50",
    danger: "text-rose-600 bg-white/50"
  }

  return (
    <Card className={`border-none shadow-sm ${styles[variant]}`}>
      <CardContent className="p-6">
        <div className={`p-2 rounded-xl w-fit mb-4 ${iconColors[variant]}`}>
          {icon}
        </div>
        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</p>
        <h3 className="text-3xl font-black mt-1 tracking-tighter">{value}</h3>
        <p className="text-[10px] font-bold mt-2 opacity-50 uppercase tracking-tighter">{sub}</p>
      </CardContent>
    </Card>
  )
}

function TableCard({ title, icon, rows, total }: { title: string; icon: React.ReactNode; total: number; rows: Array<{ label: string; value: string; count: number }> }) {
  return (
    <Card className="border-slate-200 shadow-sm bg-white overflow-hidden">
      <CardHeader className="border-b border-slate-50 py-4 bg-slate-50/50">
        <CardTitle className="text-xs font-black uppercase tracking-[0.15em] text-slate-500 flex items-center gap-2">
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-slate-50">
          {rows.map((row) => {
            const percentage = total > 0 ? (row.count / total) * 100 : 0;
            return (
              <div key={row.label} className="relative group">
                <div 
                  className="absolute inset-y-0 left-0 bg-teal-500/5 transition-all duration-1000" 
                  style={{ width: `${percentage}%` }}
                />
                
                <div className="relative p-4 flex justify-between items-center text-sm">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-900 uppercase text-xs">{row.label}</span>
                    <span className="text-[10px] font-bold text-slate-400">{Math.round(percentage)}% of total</span>
                  </div>
                  <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-lg border border-teal-100/50">
                    {row.value}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {rows.length === 0 && (
          <div className="p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-widest italic">
            No data recorded
          </div>
        )}
      </CardContent>
    </Card>
  )
}
