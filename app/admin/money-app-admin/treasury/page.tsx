"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Wallet,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Shield,
  TrendingUp,
  TrendingDown,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  treasuryTrendPercent,
  type TreasurySnapshotPoint,
} from "@/lib/treasury-balance-history-types"

type TreasuryData = {
  paystack: {
    balances: Array<{ currency: string; balanceMajor: number }>
    fetchedAt: string
  } | null
  paystackError: string | null
  stripe: {
    configured: boolean
    balances: Array<{ currency: string; available: number; pending: number }>
    fetchedAt: string
    error?: string
  } | null
  vtpass: {
    configured: boolean
    balance: number | null
    currency: string
    sandbox?: boolean
    error?: string
  } | null
  balanceHistory?: TreasurySnapshotPoint[]
  topUpLinks?: {
    paystack: string
    stripe: string
    vtpass: string
  }
  liquidity: {
    walletLiabilities: Array<{ currency: string; totalBalance: number; walletCount: number }>
    pendingPayoutsAmount: number
    pendingPayoutsCount: number
    pendingWalletWithdrawalsCount?: number
    openRefundCases: number
    refundCoverageOk: boolean | null
  }
}

function formatChartDate(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
}

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-xs text-white/60">—</span>
  const up = pct >= 0
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
        up ? "bg-emerald-500/20 text-emerald-100" : "bg-red-500/20 text-red-100"
      }`}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {pct.toFixed(1)}%
    </span>
  )
}

function BalanceChart({
  title,
  data,
  dataKey,
  color,
  formatValue,
}: {
  title: string
  data: Array<Record<string, string | number>>
  dataKey: string
  color: string
  formatValue?: (v: number) => string
}) {
  if (data.length < 2) {
    return (
      <p className="text-sm text-slate-500 py-8 text-center">
        Refresh a few times to build balance history for the chart.
      </p>
    )
  }
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 10 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#64748b", fontSize: 10 }}
            tickFormatter={(v) =>
              formatValue ? formatValue(Number(v)) : Number(v).toLocaleString()
            }
          />
          <Tooltip
            formatter={(v: number) =>
              formatValue ? formatValue(v) : v.toLocaleString(undefined, { minimumFractionDigits: 2 })
            }
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${dataKey})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function MoneyTransferTreasuryPage() {
  const [data, setData] = useState<TreasuryData | null>(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/money-app-admin/paystack-balance")
      const json = await res.json()
      if (json.success) setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const history = data?.balanceHistory ?? []
  const paystackTrend = treasuryTrendPercent(history, "paystackNgn")
  const vtpassTrend = treasuryTrendPercent(history, "vtpassNgn")
  const stripeUsdTrend = treasuryTrendPercent(history, "stripeUsd")

  const paystackChart = useMemo(
    () =>
      history
        .filter((p) => p.paystackNgn != null)
        .map((p) => ({
          label: formatChartDate(p.at),
          paystackNgn: p.paystackNgn as number,
        })),
    [history],
  )

  const vtpassChart = useMemo(
    () =>
      history
        .filter((p) => p.vtpassNgn != null)
        .map((p) => ({
          label: formatChartDate(p.at),
          vtpassNgn: p.vtpassNgn as number,
        })),
    [history],
  )

  const stripeChart = useMemo(
    () =>
      history
        .filter((p) => p.stripeUsd != null)
        .map((p) => ({
          label: formatChartDate(p.at),
          stripeUsd: p.stripeUsd as number,
        })),
    [history],
  )

  const pendingMajor = (data?.liquidity.pendingPayoutsAmount ?? 0) / 100
  const topUp = data?.topUpLinks ?? {
    paystack: "https://dashboard.paystack.com/",
    stripe: "https://dashboard.stripe.com/balance/overview",
    vtpass: "https://www.vtpass.com/vendor",
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Treasury & payout wallets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Paystack, Stripe, and VTpass balances used for payouts, cards, and bill payments.
          </p>
        </div>
        <Button onClick={load} variant="outline" disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ProviderCard
              gradient="from-[#0f766e] to-[#1A2433]"
              title="Paystack integration balance"
              error={data?.paystackError ?? (data?.paystack ? null : "Paystack secret key not configured")}
              trend={paystackTrend}
              topUpHref={topUp.paystack}
              topUpLabel="Top up Paystack"
            >
              {(data?.paystack?.balances ?? []).length === 0 && !data?.paystackError ? (
                <p className="text-teal-100/80 text-sm">No Paystack balance data returned.</p>
              ) : (
                (data?.paystack?.balances ?? []).map((b) => (
                <div
                  key={b.currency}
                  className="flex justify-between items-end border-b border-white/10 pb-2"
                >
                  <span className="text-teal-100 text-sm font-medium">{b.currency}</span>
                  <span className="text-3xl font-black">
                    {b.balanceMajor.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                ))
              )}
              <p className="text-xs text-teal-100/60 mt-4">
                Fetched:{" "}
                {data?.paystack?.fetchedAt
                  ? new Date(data.paystack.fetchedAt).toLocaleString()
                  : "—"}
              </p>
              <div className="mt-4">
                <p className="text-xs text-teal-100/80 mb-2 font-semibold">Balance trend</p>
                <BalanceChart
                  title="Paystack NGN"
                  data={paystackChart}
                  dataKey="paystackNgn"
                  color="#2dd4bf"
                  formatValue={(v) => `₦${v.toLocaleString()}`}
                />
              </div>
            </ProviderCard>

            <ProviderCard
              gradient="from-[#4f46e5] to-[#1e1b4b]"
              title="Stripe balance"
              error={
                !data?.stripe?.configured
                  ? "Stripe not configured for money transfer."
                  : data.stripe.error
              }
              trend={stripeUsdTrend}
              topUpHref={topUp.stripe}
              topUpLabel="Top up Stripe"
            >
              {(data?.stripe?.balances ?? []).length === 0 && !data?.stripe?.error ? (
                <p className="text-indigo-100/80 text-sm">No Stripe balance data returned.</p>
              ) : (
                (data?.stripe?.balances ?? []).map((b) => (
                <div
                  key={b.currency}
                  className="flex justify-between items-end border-b border-white/10 pb-2"
                >
                  <span className="text-indigo-100 text-sm font-medium">{b.currency}</span>
                  <div className="text-right">
                    <span className="text-2xl font-black block">
                      {b.available.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    {b.pending > 0 && (
                      <span className="text-xs text-indigo-200">
                        pending{" "}
                        {b.pending.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
                ))
              )}
              <p className="text-xs text-indigo-100/60 mt-4">
                Fetched:{" "}
                {data?.stripe?.fetchedAt
                  ? new Date(data.stripe.fetchedAt).toLocaleString()
                  : "—"}
              </p>
              <div className="mt-4">
                <p className="text-xs text-indigo-100/80 mb-2 font-semibold">USD trend</p>
                <BalanceChart
                  title="Stripe USD"
                  data={stripeChart}
                  dataKey="stripeUsd"
                  color="#a5b4fc"
                  formatValue={(v) => `$${v.toLocaleString()}`}
                />
              </div>
            </ProviderCard>
          </div>

          <ProviderCard
            gradient="from-[#b45309] to-[#78350f]"
            title="VTpass wallet (bills & airtime)"
            error={
              !data?.vtpass?.configured
                ? "Configure VTpass API key, public key, and secret key in admin settings."
                : data.vtpass.error
            }
            trend={vtpassTrend}
            topUpHref={topUp.vtpass}
            topUpLabel="Top up VTpass"
            fullWidth
            envBadge={
              data?.vtpass?.configured
                ? data.vtpass.sandbox
                  ? "Sandbox"
                  : "Live"
                : undefined
            }
          >
            <p className="text-4xl font-black">
              ₦{(data?.vtpass?.balance ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </p>
            <div className="mt-6">
              <p className="text-xs text-amber-100/80 mb-2 font-semibold">Balance trend</p>
              <BalanceChart
                title="VTpass"
                data={vtpassChart}
                dataKey="vtpassNgn"
                color="#fcd34d"
                formatValue={(v) => `₦${v.toLocaleString()}`}
              />
            </div>
          </ProviderCard>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Shield className="h-5 w-5 text-teal-600" />
                Liquidity snapshot
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <Stat
                  label="Open refund cases"
                  value={String(data?.liquidity.openRefundCases ?? 0)}
                  warn={(data?.liquidity.openRefundCases ?? 0) > 0}
                />
                <Stat label="Pending payouts" value={String(data?.liquidity.pendingPayoutsCount ?? 0)} />
                <Stat
                  label="Wallet withdrawals queued"
                  value={String(data?.liquidity.pendingWalletWithdrawalsCount ?? 0)}
                />
                <Stat
                  label="Pending payout (NGN)"
                  value={pendingMajor.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                />
                <Stat
                  label="Coverage"
                  value={
                    data?.liquidity.refundCoverageOk === true
                      ? "OK"
                      : data?.liquidity.refundCoverageOk === false
                        ? "LOW"
                        : "—"
                  }
                  warn={data?.liquidity.refundCoverageOk === false}
                />
              </div>
              {data?.liquidity.refundCoverageOk === false && (
                <div className="flex gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  Paystack NGN may be insufficient vs pending outbound transfers.
                </div>
              )}
              {data?.liquidity.refundCoverageOk === true && (
                <div className="flex gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  NGN balance appears to cover pending Paystack payouts.
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">User wallet liabilities</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2">Currency</th>
                  <th className="py-2">Total balance</th>
                  <th className="py-2">Wallets</th>
                </tr>
              </thead>
              <tbody>
                {(data?.liquidity.walletLiabilities ?? []).map((w) => (
                  <tr key={w.currency} className="border-b border-slate-100">
                    <td className="py-3 font-semibold">{w.currency}</td>
                    <td className="py-3">
                      {w.totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3">{w.walletCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function ProviderCard({
  gradient,
  title,
  error,
  trend,
  topUpHref,
  topUpLabel,
  children,
  fullWidth,
  envBadge,
}: {
  gradient: string
  title: string
  error?: string | null
  trend: number | null
  topUpHref: string
  topUpLabel: string
  children: React.ReactNode
  fullWidth?: boolean
  envBadge?: string
}) {
  return (
    <div
      className={`bg-gradient-to-br ${gradient} p-6 rounded-2xl text-white shadow-lg ${
        fullWidth ? "col-span-full" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <Wallet className="h-6 w-6 text-white/80" />
          <h2 className="text-lg font-bold">{title}</h2>
          {envBadge ? (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 border border-white/20">
              {envBadge}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <TrendBadge pct={trend} />
          <Button
            size="sm"
            variant="secondary"
            className="bg-white/15 text-white border-white/20 hover:bg-white/25 gap-1"
            asChild
          >
            <a href={topUpHref} target="_blank" rel="noopener noreferrer">
              {topUpLabel}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
      {error ? (
        <p className="text-amber-200 text-sm">{error}</p>
      ) : (
        children
      )}
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div
      className={`p-3 rounded-xl border ${warn ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100"}`}
    >
      <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold mt-1 ${warn ? "text-amber-800" : "text-slate-900"}`}>{value}</p>
    </div>
  )
}
