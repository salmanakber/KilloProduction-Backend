"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  CreditCard,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertTriangle,
  Download,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Ban,
  User,
  Building,
  ChevronLeft,
  ChevronRight,
  Wallet,
  Settings,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  CheckCircle2,
  XCircle,
  Info
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ComposedChart, Cell } from "recharts"

// --- Interfaces (Kept Exactly as Original) ---
interface Payment {
  id: string
  transactionId: string
  amount: number
  currency: string
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED" | "DISPUTED"
  type: "ORDER_PAYMENT" | "VENDOR_PAYOUT" | "REFUND" | "COMMISSION"
  method: "CARD" | "BANK_TRANSFER" | "WALLET" | "MOBILE_MONEY"
  userId: string
  userName: string
  userType: "CUSTOMER" | "VENDOR" | "RIDER"
  vendorId?: string
  vendorName?: string
  orderId?: string
  description: string
  createdAt: string
  processedAt?: string
  failureReason?: string
  fees: {
    platformFee: number
    processingFee: number
    total: number
  }
}

interface WithdrawalRequest {
  id: string
  vendorId: string
  vendorName: string
  amount: number
  currency?: string
  vendorWalletBalance?: number
  vendorWalletCurrency?: string
  bankDetails: {
    accountName: string
    accountNumber: string
    bankName: string
    routingNumber?: string
  } | null
  status: "PENDING" | "APPROVED" | "PROCESSING" | "COMPLETED" | "REJECTED"
  requestedAt: string
  processedAt?: string
  processedBy?: string
  rejectionReason?: string
  notes?: string | null
}

interface PaymentStats {
  currencySymbol?: string
  totalVolume: number
  totalTransactions: number
  successRate: number
  pendingPayments: number
  failedPayments: number
  totalRefunds: number
  pendingWithdrawals: number
  totalCommission: number
  volumeChangePercent?: number
  cancelledWalletTx?: number
  gatewayPaidVolume?: number
  gatewayPaidCount?: number
  gatewayPendingCount?: number
  gatewayFailedCount?: number
  walletByType?: { type: string; count: number; volume: number }[]
  walletByStatus?: { status: string; count: number }[]
  timeSeries?: { label: string; walletVolume: number; gatewayVolume: number }[]
}

function parseWithdrawalNotes(notes: string | null | undefined): {
  scheduledProcessDate?: string
  clearingBusinessDays?: number
  message?: string
} {
  if (!notes) return {}
  try {
    const o = JSON.parse(notes) as Record<string, unknown>
    return {
      scheduledProcessDate:
        typeof o.scheduledProcessDate === "string" ? o.scheduledProcessDate : undefined,
      clearingBusinessDays:
        typeof o.clearingBusinessDays === "number" ? o.clearingBusinessDays : undefined,
      message: typeof o.message === "string" ? o.message : undefined,
    }
  } catch {
    return { message: notes }
  }
}

interface GatewayPaymentRow {
  id: string
  userName: string | null
  userEmail: string | null
  userRole: string
  amount: number
  currency: string
  status: string
  gateway: string
  gatewayTransactionId: string | null
  orderId: string | null
  orderNumber: string | null
  description: string | null
  createdAt: string
  paymentMethod: {
    type: string
    provider: string
    brand?: string | null
    lastFour?: string | null
  } | null
}

export default function PaymentManagement() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [gatewayPayments, setGatewayPayments] = useState<GatewayPaymentRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("payments")
  const [paymentSource, setPaymentSource] = useState<"wallet" | "gateway">("wallet")
  const [selectedStatus, setSelectedStatus] = useState("ALL")
  const [selectedType, setSelectedType] = useState("ALL")
  const [gatewayStatus, setGatewayStatus] = useState("ALL")
  const [gatewaySearch, setGatewaySearch] = useState("")
  const [gatewayLoading, setGatewayLoading] = useState(false)
  const [dateRange, setDateRange] = useState("7d")
  const [walletPage, setWalletPage] = useState(1)
  const [walletPageSize] = useState(15)
  const [walletTotalPages, setWalletTotalPages] = useState(1)
  const [walletSearch, setWalletSearch] = useState("")
  const [withdrawPage, setWithdrawPage] = useState(1)
  const [withdrawTotalPages, setWithdrawTotalPages] = useState(1)
  const [gatewayPage, setGatewayPage] = useState(1)
  const [gatewayPageSize] = useState(15)
  const [gatewayTotalPages, setGatewayTotalPages] = useState(1)
  const [actionBanner, setActionBanner] = useState<{ type: "ok" | "err"; text: string } | null>(null)
  const [walletDetail, setWalletDetail] = useState<Payment | null>(null)
  const [withdrawalDetail, setWithdrawalDetail] = useState<WithdrawalRequest | null>(null)
  const [riderClearanceDays, setRiderClearanceDays] = useState(4)
  const [savingClearance, setSavingClearance] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/payments/rider-wallet-clearance")
        if (!res.ok) return
        const data = await res.json()
        if (typeof data.riderWalletClearanceDays === "number") {
          setRiderClearanceDays(data.riderWalletClearanceDays)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const saveRiderClearanceDays = async () => {
    setSavingClearance(true)
    try {
      const res = await fetch("/api/admin/payments/rider-wallet-clearance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riderWalletClearanceDays: riderClearanceDays }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Save failed")
      setActionBanner({
        type: "ok",
        text: `Rider wallet clearance set to ${data.riderWalletClearanceDays} calendar day(s).`,
      })
    } catch (e) {
      setActionBanner({ type: "err", text: String(e) })
    } finally {
      setSavingClearance(false)
    }
  }

  const fetchPaymentData = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        range: dateRange,
        status: selectedStatus,
        type: selectedType,
        page: String(walletPage),
        limit: String(walletPageSize),
      })
      if (walletSearch.trim()) qs.set("q", walletSearch.trim())

      const wqs = new URLSearchParams({
        range: dateRange,
        page: String(withdrawPage),
        limit: "10",
      })

      const [paymentsResponse, withdrawalsResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/payments?${qs.toString()}`),
        fetch(`/api/admin/payments/withdrawals?${wqs.toString()}`),
        fetch(`/api/admin/payments/stats?range=${dateRange}`),
      ])

      const [paymentsData, withdrawalsData, statsData] = await Promise.all([
        paymentsResponse.json(),
        withdrawalsResponse.json(),
        statsResponse.json(),
      ])

      setPayments(paymentsData.payments || [])
      setWalletTotalPages(Math.max(1, paymentsData.pagination?.pages ?? 1))
      setWithdrawals(withdrawalsData.withdrawals || [])
      setWithdrawTotalPages(Math.max(1, withdrawalsData.pagination?.pages ?? 1))
      setStats(statsData.error ? null : statsData)
    } catch (error) {
      console.error("Failed to fetch payment data:", error)
    } finally {
      setLoading(false)
    }
  }, [dateRange, selectedStatus, selectedType, walletPage, walletPageSize, walletSearch, withdrawPage])

  useEffect(() => {
    void fetchPaymentData()
  }, [fetchPaymentData])

  const fetchGatewayPayments = useCallback(async () => {
    setGatewayLoading(true)
    try {
      const qs = new URLSearchParams()
      qs.set("range", dateRange)
      if (gatewayStatus !== "ALL") qs.set("status", gatewayStatus)
      if (gatewaySearch.trim()) qs.set("q", gatewaySearch.trim())
      qs.set("limit", String(gatewayPageSize))
      qs.set("page", String(gatewayPage))
      const res = await fetch(`/api/admin/payment-records?${qs.toString()}`)
      const data = await res.json()
      setGatewayPayments(data.payments || [])
      setGatewayTotalPages(Math.max(1, data.pagination?.pages ?? 1))
    } catch (e) {
      console.error("Gateway payments fetch:", e)
      setGatewayPayments([])
    } finally {
      setGatewayLoading(false)
    }
  }, [dateRange, gatewayStatus, gatewaySearch, gatewayPage, gatewayPageSize])

  useEffect(() => {
    if (activeTab !== "payments" || paymentSource !== "gateway") return
    void fetchGatewayPayments()
  }, [activeTab, paymentSource, fetchGatewayPayments])

  useEffect(() => {
    setWalletPage(1)
  }, [dateRange, selectedStatus, selectedType, walletSearch])

  useEffect(() => {
    setGatewayPage(1)
  }, [dateRange, gatewayStatus, gatewaySearch])

  useEffect(() => {
    setWithdrawPage(1)
  }, [dateRange])

  const exportRowsToCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const esc = (c: string | number) => {
      const s = String(c ?? "")
      if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`
      return s
    }
    const lines = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))]
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExport = () => {
    const sym = stats?.currencySymbol ?? "$"
    if (activeTab === "payments" && paymentSource === "wallet") {
      exportRowsToCsv(
        `wallet-ledger-${dateRange}.csv`,
        ["transactionId", "type", "amount", "currency", "status", "user", "role", "orderId", "createdAt"],
        payments.map((p) => [
          p.transactionId,
          p.type,
          p.amount,
          p.currency,
          p.status,
          p.userName,
          p.userType,
          p.orderId ?? "",
          p.createdAt,
        ]),
      )
      setActionBanner({ type: "ok", text: `Exported ${payments.length} wallet row(s) from this page.` })
    } else if (activeTab === "payments" && paymentSource === "gateway") {
      exportRowsToCsv(
        `gateway-payments-${dateRange}.csv`,
        ["id", "amount", "currency", "status", "gateway", "user", "email", "orderNumber", "createdAt"],
        gatewayPayments.map((p) => [
          p.id,
          p.amount,
          p.currency,
          p.status,
          p.gateway,
          p.userName ?? "",
          p.userEmail ?? "",
          p.orderNumber ?? "",
          p.createdAt,
        ]),
      )
      setActionBanner({ type: "ok", text: `Exported ${gatewayPayments.length} gateway row(s) from this page.` })
    } else if (activeTab === "withdrawals") {
      exportRowsToCsv(
        `vendor-withdrawals-${dateRange}.csv`,
        ["id", "vendor", "amount", "currency", "status", "requestedAt", "bank"],
        withdrawals.map((w) => [
          w.id,
          w.vendorName,
          w.amount,
          "USD",
          w.status,
          w.requestedAt,
          w.bankDetails?.bankName ?? "",
        ]),
      )
      setActionBanner({ type: "ok", text: `Exported ${withdrawals.length} withdrawal row(s) from this page.` })
    }
  }

  const handlePaymentAction = async (paymentId: string, action: "refund" | "retry" | "cancel") => {
    try {
      const body =
        action === "cancel"
          ? JSON.stringify({ reason: "Cancelled by admin" })
          : action === "refund"
            ? JSON.stringify({ reason: "Admin refund review" })
            : JSON.stringify({})
      const response = await fetch(`/api/admin/payments/${paymentId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })
      const j = await response.json().catch(() => ({}))
      if (response.ok) {
        setActionBanner({ type: "ok", text: j.message || "Updated successfully" })
        void fetchPaymentData()
      } else {
        setActionBanner({ type: "err", text: j.error || "Action failed" })
      }
    } catch (error) {
      console.error(`Failed to ${action} payment:`, error)
      setActionBanner({ type: "err", text: String(error) })
    }
  }

  const handleWithdrawalAction = async (withdrawalId: string, action: "approve" | "reject", reason?: string) => {
    try {
      const response = await fetch(`/api/admin/payments/withdrawals/${withdrawalId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      })
      const j = await response.json().catch(() => ({}))
      if (response.ok) {
        setActionBanner({ type: "ok", text: j.message || "Withdrawal updated" })
        void fetchPaymentData()
      } else {
        setActionBanner({ type: "err", text: j.error || "Withdrawal action failed" })
      }
    } catch (error) {
      console.error(`Failed to ${action} withdrawal:`, error)
      setActionBanner({ type: "err", text: String(error) })
    }
  }

  // --- Enhanced UI Helpers ---
  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "PAID":
      case "APPROVED":
        return "bg-emerald-100 text-emerald-700 border-emerald-200"
      case "PENDING":
      case "PROCESSING":
        return "bg-amber-100 text-amber-700 border-amber-200"
      case "FAILED":
      case "REJECTED":
        return "bg-rose-100 text-rose-700 border-rose-200"
      case "REFUNDED":
      case "PARTIALLY_REFUNDED":
        return "bg-blue-100 text-blue-700 border-blue-200"
      case "DISPUTED":
        return "bg-purple-100 text-purple-700 border-purple-200"
      case "CANCELLED":
        return "bg-slate-100 text-slate-700 border-slate-200"
      default:
        return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "CARD":
        return <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center"><CreditCard className="h-4 w-4" /></div>
      case "BANK_TRANSFER":
        return <div className="h-8 w-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center"><Building className="h-4 w-4" /></div>
      case "WALLET":
        return <div className="h-8 w-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><Wallet className="h-4 w-4" /></div>
      case "MOBILE_MONEY":
        return <div className="h-8 w-8 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center"><CreditCard className="h-4 w-4" /></div>
      default:
        return <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"><DollarSign className="h-4 w-4" /></div>
    }
  }

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse p-4">
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="h-8 w-64 bg-slate-200 rounded-lg mb-2"></div>
            <div className="h-4 w-96 bg-slate-200 rounded-lg"></div>
          </div>
          <div className="h-10 w-40 bg-slate-200 rounded-xl"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-36 bg-white border border-slate-100 rounded-2xl shadow-sm"></div>
          ))}
        </div>
        <div className="h-14 bg-slate-200 rounded-xl w-1/3 mt-6"></div>
        <div className="h-96 bg-white border border-slate-100 rounded-2xl shadow-sm mt-6"></div>
      </div>
    )
  }

  const cur = stats?.currencySymbol ?? "₦"
  const volDelta = stats?.volumeChangePercent ?? 0
  const isPositiveVol = volDelta >= 0

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-16">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Center</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor transactions, process withdrawals, and manage system liquidity.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-10 text-xs border border-slate-300 bg-slate-50 rounded-xl px-3 focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-slate-700 cursor-pointer"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            type="button"
            onClick={() => handleExport()}
            className="flex items-center h-10 px-4 text-white text-sm font-semibold rounded-xl bg-gradient-to-tr from-green-500 to-emerald-600 shadow-md shadow-green-200 hover:shadow-green-300 transition-all"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ACTION BANNER */}
      {actionBanner && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border animate-in slide-in-from-top-4 shadow-sm ${
            actionBanner.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-3">
            {actionBanner.type === "ok" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-rose-600" />}
            <span className="text-sm font-semibold">{actionBanner.text}</span>
          </div>
          <button type="button" className="p-1 rounded-lg hover:bg-black/5 transition-colors" onClick={() => setActionBanner(null)}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* RIDER CLEARANCE SETTING */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-6 group hover:border-emerald-200 transition-colors">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-emerald-50 group-hover:text-emerald-600 group-hover:border-emerald-100 transition-colors">
            <Settings className="h-6 w-6 text-slate-600 group-hover:text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Rider/Vendor Wallet Clearance Window</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-xl">
              Set the number of calendar days before a rider/vendor&apos;s delivery earnings transition into their available, withdrawable balance.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-100">
          <label htmlFor="riderClearanceDays" className="text-sm font-semibold text-slate-600 pl-2">
            Days
          </label>
          <input
            id="riderClearanceDays"
            type="number"
            min={1}
            max={14}
            value={riderClearanceDays}
            onChange={(e) => setRiderClearanceDays(Math.min(14, Math.max(1, Number(e.target.value) || 4)))}
            className="w-16 text-center border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
          />
          <button
            type="button"
            disabled={savingClearance}
            onClick={() => void saveRiderClearanceDays()}
            className="px-5 py-2 text-white text-sm font-bold rounded-lg bg-gradient-to-tr from-green-500 to-emerald-600 shadow-md shadow-green-200 hover:shadow-green-300 transition-colors disabled:opacity-50"
          >
            {savingClearance ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 group-hover:bg-emerald-100 transition-colors">
              <Wallet className="h-6 w-6 text-emerald-600" />
            </div>
            <div className={`flex items-center px-2 py-1 rounded-full text-xs font-bold ${isPositiveVol ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {isPositiveVol ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              {Math.abs(volDelta)}%
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Wallet Volume</p>
            <p className="text-3xl font-black text-slate-900">
              {cur}{(stats?.totalVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Gateway Paid: {cur}{(stats?.gatewayPaidVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 group-hover:bg-blue-100 transition-colors">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Transactions</p>
            <p className="text-3xl font-black text-slate-900">{stats?.totalTransactions?.toLocaleString() ?? "0"}</p>
            <div className="mt-2 flex items-center">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
              <span className="text-xs text-emerald-600 font-bold">{stats?.successRate ?? 0}% success rate</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100 group-hover:bg-amber-100 transition-colors">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Pending / Failed</p>
            <p className="text-3xl font-black text-slate-900">{stats?.pendingPayments ?? 0}</p>
            <div className="mt-2 flex items-center">
              <span className="text-xs text-rose-600 font-bold">{stats?.failedPayments ?? 0} wallet failed</span>
              <span className="mx-2 text-slate-300">•</span>
              <span className="text-xs text-slate-500 font-medium">GW: {stats?.gatewayFailedCount ?? 0} fail</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 group hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100 group-hover:bg-purple-100 transition-colors">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Paid Commission</p>
            <p className="text-3xl font-black text-slate-900">
              {cur}{(stats?.totalCommission ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <div className="mt-2 flex items-center justify-between text-xs font-medium">
              <span className="text-amber-600 font-bold">{stats?.pendingWithdrawals ?? 0} pending w/d</span>
              <span className="text-slate-500">Ref: {cur}{(stats?.totalRefunds ?? 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Sleek Tabs */}
        <div className="border-b border-slate-100 bg-slate-50/50 p-4">
          <div className="flex space-x-2 bg-slate-200/50 p-1.5 rounded-xl w-max overflow-x-auto">
            {[
              { id: "payments", label: "Payments Ledger" },
              { id: "withdrawals", label: "Withdrawal Requests" },
              { id: "disputes", label: "Disputes" },
              { id: "analytics", label: "Financial Analytics" }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-5 py-2.5 rounded-lg text-sm font-bold capitalize transition-all duration-200 ${
                  activeTab === t.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-200/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 min-h-[500px]">
          
          {/* TAB: PAYMENTS */}
          {activeTab === "payments" && (
            <div className="space-y-6 animate-in fade-in">
              {/* Payment Type Pill Toggle */}
              <div className="flex flex-wrap gap-2 pb-4">
                <button
                  type="button"
                  onClick={() => setPaymentSource("wallet")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    paymentSource === "wallet" ? "bg-gradient-to-tr from-green-500 to-emerald-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  Internal Wallet Ledger
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource("gateway")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    paymentSource === "gateway" ? "bg-gradient-to-tr from-green-500 to-emerald-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  External Gateway Records
                </button>
              </div>

              {/* Wallet Ledger View */}
              {paymentSource === "wallet" && (
                <div className="space-y-4">
                  <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full max-w-md">
                      <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                      <input
                        type="text"
                        placeholder="Search ref, user, order id..."
                        value={walletSearch}
                        onChange={(e) => setWalletSearch(e.target.value)}
                        className="pl-10 pr-4 py-2.5 w-full border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-medium outline-none transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="border border-slate-300 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 flex-1 lg:flex-none cursor-pointer"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="FAILED">Failed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                      <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="border border-slate-300 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 flex-1 lg:flex-none cursor-pointer"
                      >
                        <option value="ALL">All Types</option>
                        <option value="CREDIT">Credit</option>
                        <option value="DEBIT">Debit</option>
                        <option value="REFUND">Refund</option>
                        <option value="BONUS">Bonus</option>
                        <option value="CASHBACK">Cashback</option>
                        <option value="WITHDRAWAL">Withdrawal</option>
                        <option value="DEPOSIT">Deposit</option>
                      </select>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-200">
                          <tr>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Transaction Info</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Entity Involved</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Financials</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status & Method</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Timestamp</th>
                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {payments.length > 0 ? (
                            payments.map((payment) => (
                              <tr key={payment.id} className="hover:bg-slate-50 transition-colors group">
                                <td className="px-6 py-4">
                                  <div className="font-mono text-sm font-bold text-indigo-600 mb-1">{payment.transactionId}</div>
                                  <div className="text-xs font-semibold text-slate-500 bg-slate-100 w-max px-2 py-0.5 rounded uppercase tracking-wider">
                                    {String(payment.type).replace(/_/g, " ")}
                                  </div>
                                  {payment.orderId && <div className="text-xs text-slate-400 mt-1 font-medium">Ord: {payment.orderId}</div>}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200">
                                      <User className="h-5 w-5 text-slate-500" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-900">{payment.userName || "Unknown User"}</p>
                                      <p className="text-xs font-medium text-slate-500">{payment.userType}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-black text-slate-900">{payment.currency} {payment.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                  <div className="text-xs font-medium text-slate-500 mt-0.5">Fee: {payment.fees.total.toFixed(2)}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col gap-2 items-start">
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${getStatusColor(payment.status)}`}>
                                      {payment.status}
                                    </span>
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                      {getPaymentMethodIcon(payment.method)} {payment.method.replace("_", " ")}
                                    </div>
                                    {payment.failureReason && <div className="text-[10px] text-rose-600 font-semibold max-w-[150px] truncate" title={payment.failureReason}>{payment.failureReason}</div>}
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="text-sm font-bold text-slate-700">{new Date(payment.createdAt).toLocaleDateString()}</div>
                                  <div className="text-xs font-medium text-slate-500">{new Date(payment.createdAt).toLocaleTimeString()}</div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center justify-end gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => setWalletDetail(payment)} className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-indigo-100 text-slate-600 hover:text-indigo-700 transition-colors" title="View Detail">
                                      <Eye size={16} />
                                    </button>
                                    {payment.status === "FAILED" && (
                                      <button onClick={() => handlePaymentAction(payment.id, "retry")} className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 transition-colors" title="Retry">
                                        <RefreshCw size={16} />
                                      </button>
                                    )}
                                    {payment.status === "COMPLETED" && (
                                      <button onClick={() => handlePaymentAction(payment.id, "refund")} className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 transition-colors" title="Refund">
                                        <RefreshCw size={16} />
                                      </button>
                                    )}
                                    {payment.status === "PENDING" && (
                                      <button onClick={() => handlePaymentAction(payment.id, "cancel")} className="h-8 w-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 transition-colors" title="Cancel">
                                        <Ban size={16} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">
                                No wallet transactions match your current filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                      <p className="text-sm font-medium text-slate-500">Page <span className="font-bold text-slate-900">{walletPage}</span> of <span className="font-bold text-slate-900">{walletTotalPages}</span></p>
                      <div className="flex gap-2">
                        <button disabled={walletPage <= 1} onClick={() => setWalletPage((p) => Math.max(1, p - 1))} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                          <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                        </button>
                        <button disabled={walletPage >= walletTotalPages} onClick={() => setWalletPage((p) => p + 1)} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                          Next <ChevronRight className="h-4 w-4 ml-1" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Gateway View */}
              {paymentSource === "gateway" && (
                <div className="space-y-4">
                  <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    <div className="relative w-full max-w-md">
                      <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                      <input
                        type="text"
                        placeholder="Search gateway ref, email, order..."
                        value={gatewaySearch}
                        onChange={(e) => setGatewaySearch(e.target.value)}
                        className="pl-10 pr-4 py-2.5 w-full border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm font-medium outline-none transition-all"
                      />
                    </div>
                    <select
                      value={gatewayStatus}
                      onChange={(e) => setGatewayStatus(e.target.value)}
                      className="border border-slate-300 bg-slate-50 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 w-full lg:w-auto cursor-pointer"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="PENDING">Pending</option>
                      <option value="PAID">Paid</option>
                      <option value="FAILED">Failed</option>
                      <option value="REFUNDED">Refunded</option>
                      <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
                    </select>
                  </div>

                  <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    {gatewayLoading ? (
                      <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
                        <RefreshCw className="h-6 w-6 animate-spin text-emerald-500" />
                        <p className="font-medium">Fetching gateway ledgers...</p>
                      </div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Gateway Ref & Order</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer Details</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount Paid</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Method</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Processed On</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {gatewayPayments.length > 0 ? gatewayPayments.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                  <td className="px-6 py-4">
                                    <div className="font-mono text-sm font-bold text-slate-900 mb-1" title={p.id}>{p.id.slice(0, 10)}...</div>
                                    {p.gatewayTransactionId && <div className="text-xs font-semibold text-slate-500 flex items-center gap-1"><Building size={12}/> {p.gatewayTransactionId}</div>}
                                    {p.orderNumber && <div className="text-xs font-semibold text-indigo-600 mt-1">Ord: #{p.orderNumber}</div>}
                                  </td>
                                  <td className="px-6 py-4">
                                    <p className="font-bold text-sm text-slate-900">{p.userName || "Guest"}</p>
                                    <p className="text-xs font-medium text-slate-500">{p.userEmail}</p>
                                  </td>
                                  <td className="px-6 py-4 font-black text-sm text-slate-900">
                                    {p.currency} {p.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="font-bold text-sm text-slate-900">{p.gateway}</div>
                                    {p.paymentMethod && (
                                      <div className="text-xs font-medium text-slate-500 mt-0.5">
                                        {p.paymentMethod.provider} {p.paymentMethod.brand ? `· ${p.paymentMethod.brand}` : ""}
                                        {p.paymentMethod.lastFour ? ` · ***${p.paymentMethod.lastFour}` : ""}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${getStatusColor(p.status)}`}>
                                      {p.status}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 text-sm font-medium text-slate-600">
                                    {new Date(p.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                                  </td>
                                </tr>
                              )) : (
                                <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500 font-medium">No gateway records found.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                          <p className="text-sm font-medium text-slate-500">Page <span className="font-bold text-slate-900">{gatewayPage}</span> of <span className="font-bold text-slate-900">{gatewayTotalPages}</span></p>
                          <div className="flex gap-2">
                            <button disabled={gatewayPage <= 1} onClick={() => setGatewayPage((p) => Math.max(1, p - 1))} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                            </button>
                            <button disabled={gatewayPage >= gatewayTotalPages} onClick={() => setGatewayPage((p) => p + 1)} className="flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">
                              Next <ChevronRight className="h-4 w-4 ml-1" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: WITHDRAWALS */}
          {activeTab === "withdrawals" && (
            <div className="space-y-4 animate-in fade-in">
              {withdrawals.length > 0 ? withdrawals.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWithdrawalDetail(w)}
                  className={`w-full text-left bg-white p-6 rounded-2xl border shadow-sm flex flex-col md:flex-row md:items-start justify-between gap-6 transition-all hover:shadow-md ${w.status === "PENDING" ? "border-amber-200 border-l-4" : "border-slate-200"}`}
                >
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-3">
                      <h4 className="text-xl font-bold text-slate-900">{w.vendorName}</h4>
                      <span className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md border ${getStatusColor(w.status)}`}>
                        {w.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Amount Requested</p>
                        <p className="text-xl font-black text-slate-900">{cur}{w.amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Destination Bank</p>
                        {w.bankDetails ? (
                          <>
                            <p className="text-sm font-bold text-slate-900">{w.bankDetails.accountName}</p>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">{w.bankDetails.bankName} •••• {w.bankDetails.accountNumber?.slice(-4) ?? ""}</p>
                          </>
                        ) : (
                          <p className="text-sm text-slate-400 italic">No bank provided</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Date Requested</p>
                        <p className="text-sm font-bold text-slate-900">{new Date(w.requestedAt).toLocaleDateString()}</p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">{new Date(w.requestedAt).toLocaleTimeString()}</p>
                      </div>
                    </div>

                    {w.rejectionReason && (
                      <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl flex items-start gap-2 text-rose-800 text-sm">
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                        <p><strong>Rejected:</strong> {w.rejectionReason}</p>
                      </div>
                    )}

                    {(() => {
                      const meta = parseWithdrawalNotes(w.notes)
                      if (!meta.scheduledProcessDate && !meta.clearingBusinessDays && !meta.message) return null
                      return (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start gap-2">
                          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-amber-900">Clearing & Schedule</p>
                            {meta.clearingBusinessDays != null && <p className="text-xs font-medium text-amber-800 mt-1">Clearing window: {meta.clearingBusinessDays} business days.</p>}
                            {meta.scheduledProcessDate && <p className="text-xs font-medium text-amber-800 mt-0.5">Est. Payout Date: {new Date(meta.scheduledProcessDate).toLocaleString()}</p>}
                            {meta.message && <p className="text-xs font-medium text-amber-800 mt-1 italic">{meta.message}</p>}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  
                  {w.status === "PENDING" && (
                    <div className="flex md:flex-col items-center justify-end gap-3 shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, "approve") }} className="w-full flex items-center justify-center px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors shadow-sm">
                        Approve
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, "reject", "Insufficient documentation or invalid banking detail.") }} className="w-full flex items-center justify-center px-6 py-2.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold text-sm rounded-xl transition-colors shadow-sm">
                        Reject
                      </button>
                    </div>
                  )}
                </button>
              )) : (
                <div className="py-24 text-center">
                  <Wallet className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium text-lg">No withdrawals to process in this range.</p>
                </div>
              )}
              
              {withdrawals.length > 0 && (
                <div className="flex items-center justify-between pt-4 mt-6">
                  <p className="text-sm font-medium text-slate-500">Page <span className="font-bold">{withdrawPage}</span> of <span className="font-bold">{withdrawTotalPages}</span></p>
                  <div className="flex gap-2">
                    <button disabled={withdrawPage <= 1} onClick={() => setWithdrawPage(p => Math.max(1, p - 1))} className="flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4 mr-1" /> Prev
                    </button>
                    <button disabled={withdrawPage >= withdrawTotalPages} onClick={() => setWithdrawPage(p => p + 1)} className="flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold hover:bg-slate-50 disabled:opacity-40">
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: DISPUTES */}
          {activeTab === "disputes" && (
            <div className="py-24 flex flex-col items-center justify-center text-center animate-in fade-in">
              <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 border border-slate-200">
                <AlertTriangle className="h-10 w-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Dispute Resolution Center</h3>
              <p className="text-slate-500 mb-8 max-w-md">Manage chargebacks, frozen funds, and user transaction disputes centrally.</p>
              <button className="px-6 py-3 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 shadow-sm transition-all">
                Access Dispute Dashboard
              </button>
            </div>
          )}

          {/* TAB: ANALYTICS */}
          {activeTab === "analytics" && (
            <div className="space-y-8 animate-in fade-in">
              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex items-start gap-3">
                <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
                <p className="text-sm text-indigo-900 font-medium">Financial analytics are strictly bound to the globally selected date range ({dateRange}) mapping to live system data.</p>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Volume Trend: Wallet vs Gateway</h3>
                <div className="h-80 w-full">
                  {stats?.timeSeries && stats.timeSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stats.timeSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                        <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${cur}${v >= 1000 ? v/1000+'k' : v}`}/>
                        <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                        <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px'}}/>
                        <Bar dataKey="walletVolume" name="Wallet Volume" fill="#10b981" stackId="a" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="gatewayVolume" name="Gateway Volume" fill="#6366f1" stackId="a" radius={[4, 4, 0, 0]} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">No time-series data available.</div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Transactions Count by Ledger Type</h3>
                  <div className="h-[250px] w-full">
                    {stats?.walletByType && stats.walletByType.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.walletByType} layout="vertical" margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="type" type="category" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                          <Bar dataKey="count" name="Count" fill="#0ea5e9" radius={[0, 6, 6, 0]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">No transaction count data.</div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-900 mb-6">Financial Volume by Ledger Type</h3>
                  <div className="h-[250px] w-full">
                    {stats?.walletByType && stats.walletByType.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.walletByType} layout="vertical" margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                          <XAxis type="number" hide />
                          <YAxis dataKey="type" type="category" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f8fafc'}} formatter={(v: number) => `${cur}${v.toLocaleString()}`} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                          <Bar dataKey="volume" name="Volume" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={24} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">No volume data.</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Status Distribution (Wallet Matrix)</h3>
                <div className="flex flex-wrap gap-4">
                  {(stats?.walletByStatus ?? []).map((s) => (
                    <div key={s.status} className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl border border-slate-200 shadow-sm">
                      <div className={`h-3 w-3 rounded-full ${s.status === 'COMPLETED' ? 'bg-emerald-500' : s.status === 'FAILED' ? 'bg-rose-500' : s.status === 'PENDING' ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
                      <span className="font-bold text-slate-700 text-sm">{s.status}</span>
                      <span className="bg-white px-2 py-0.5 rounded text-xs font-black text-slate-500 border border-slate-200">{s.count.toLocaleString()}</span>
                    </div>
                  ))}
                  {!stats?.walletByStatus?.length && <p className="text-slate-500 text-sm font-medium">No state matrices generated for this range.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* JSON MODAL (WALLET DETAIL) */}
      {walletDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Transaction Raw Data</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{walletDetail.transactionId}</p>
              </div>
              <button onClick={() => setWalletDetail(null)} className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-50">
              <div className="bg-slate-900 rounded-xl p-4 shadow-inner overflow-x-auto custom-scrollbar">
                <pre className="text-xs text-emerald-400 font-mono">
                  {JSON.stringify(walletDetail, null, 2)}
                </pre>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-start gap-3">
              <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Use the quick action buttons (Retry / Cancel / Refund) directly on the transaction ledger table. Submitting a refund applies an administrative flag for review and freezes automated payouts for that specific transaction.
              </p>
            </div>
          </div>
        </div>
      )}

      {withdrawalDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Withdrawal Request Details</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{withdrawalDetail.id}</p>
              </div>
              <button onClick={() => setWithdrawalDetail(null)} className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vendor</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{withdrawalDetail.vendorName}</p>
                  <p className="text-sm text-slate-500 mt-1">{withdrawalDetail.vendorId}</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Requested Withdrawal</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">
                    {cur}
                    {withdrawalDetail.amount.toLocaleString()}
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Current Wallet Balance</p>
                  <p className="text-xl font-black text-emerald-900 mt-1">
                    {withdrawalDetail.vendorWalletCurrency || cur}
                    {(withdrawalDetail.vendorWalletBalance ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Request Date</p>
                  <p className="text-base font-bold text-slate-900 mt-1">{new Date(withdrawalDetail.requestedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Bank Details</p>
                {withdrawalDetail.bankDetails ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-slate-900 font-semibold">{withdrawalDetail.bankDetails.accountName}</p>
                    <p className="text-slate-700">Bank: {withdrawalDetail.bankDetails.bankName}</p>
                    <p className="text-slate-700">Account: {withdrawalDetail.bankDetails.accountNumber}</p>
                    {withdrawalDetail.bankDetails.routingNumber && (
                      <p className="text-slate-700">Routing: {withdrawalDetail.bankDetails.routingNumber}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No bank details provided.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}