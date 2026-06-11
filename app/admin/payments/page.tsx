"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
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
  Info,
  Terminal,
  Loader2,
  Store
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ComposedChart, Cell } from "recharts"
import { useRouter } from "next/navigation"


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
  paymentMethodId?: string | null
  orderId: string | null
  orderNumber: string | null
  orderSummary?: {
    subtotal: number
    deliveryFee: number
    serviceFee: number
    tax: number
    discount: number
    total: number
  } | null
  description: string | null
  metadata?: Record<string, unknown> | null
  paymentGroupId?: string | null
  paymentType?: string | null
  processingFeeLedger?: {
    id: string
    orderAmount: number
    commissionRate: number
    commissionAmount: number
    currency: string
    gateway: string
    createdAt: string
  } | null
  createdAt: string
  paymentMethod: {
    type: string
    provider: string
    brand?: string | null
    lastFour?: string | null
  } | null
}

interface GatewayPaymentGroup {
  groupKey: string
  isSplitGroup: boolean
  amount: number
  currency: string
  status: string
  gateway: string
  gatewayTransactionId: string | null
  orderNumber: string | null
  userName: string | null
  userEmail: string | null
  createdAt: string
  rows: GatewayPaymentRow[]
  primaryOrderRow: GatewayPaymentRow | null
  processingFeeLedger: GatewayPaymentRow["processingFeeLedger"] | null
}

export default function PaymentManagement() {
  const router = useRouter()
  const [payments, setPayments] = useState<Payment[]>([])
  const [gatewayPayments, setGatewayPayments] = useState<GatewayPaymentRow[]>([])
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([])
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("payments")
  const [paymentSource, setPaymentSource] = useState<"wallet" | "gateway">("wallet")
  const [selectedStatus, setSelectedStatus] = useState("ALL")
  const [selectedType, setSelectedType] = useState("ALL")
  const [selectedModule, setSelectedModule] = useState("ALL")
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
  const [gatewayGroupDetail, setGatewayGroupDetail] = useState<GatewayPaymentGroup | null>(null)
  const [riderClearanceDays, setRiderClearanceDays] = useState(4)
  const [savingClearance, setSavingClearance] = useState(false)

  const groupedGatewayPayments = useMemo<GatewayPaymentGroup[]>(() => {
    const groups = new Map<string, GatewayPaymentRow[]>()
    for (const row of gatewayPayments) {
      const key = row.paymentGroupId || row.id
      const existing = groups.get(key)
      if (existing) existing.push(row)
      else groups.set(key, [row])
    }

    return Array.from(groups.entries())
      .map(([groupKey, rows]) => {
        const sortedRows = [...rows].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        const primary = sortedRows[0]!
        const highestRow = sortedRows.reduce((acc, row) => (row.amount > acc.amount ? row : acc), primary)
        const primaryOrderRow = sortedRows.find((r) => Boolean(r.orderId)) ?? null
        const ledgerRow = sortedRows.find((r) => r.processingFeeLedger) ?? null
        return {
          groupKey,
          isSplitGroup: sortedRows.length > 1,
          amount: highestRow.amount,
          currency: highestRow.currency,
          status: primary.status,
          gateway: primary.gateway,
          gatewayTransactionId: primary.gatewayTransactionId,
          orderNumber: primaryOrderRow?.orderNumber ?? primary.orderNumber,
          userName: primary.userName,
          userEmail: primary.userEmail,
          createdAt: primary.createdAt,
          rows: sortedRows,
          primaryOrderRow,
          processingFeeLedger: ledgerRow?.processingFeeLedger ?? null,
        }
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [gatewayPayments])

  // --- Safe URL Hash Parser and Hydration Syncer ---
  useEffect(() => {
    if (typeof window === "undefined") return

    const parseHash = () => {
      const hash = window.location.hash
      if (!hash) return

      const cleanHash = hash.replace("#", "")

      // Check for deep-linked withdrawal request
      if (cleanHash.startsWith("withdrawals-")) {
        const id = cleanHash.replace("withdrawals-", "")
        setActiveTab("withdrawals")
        
        // Match inside locally loaded state first
        const found = withdrawals.find((w) => w.id === id)
        if (found) {
          setWithdrawalDetail(found)
        } else if (!loading && withdrawals.length > 0) {
          // Fallback direct API lookup if the request exists on another pagination page
          fetch(`/api/admin/payments/withdrawals?id=${id}`)
            .then((res) => res.json())
            .then((data) => {
              if (data?.withdrawal) {
                setWithdrawalDetail(data.withdrawal)
              } else if (data?.withdrawals) {
                const apiFound = data.withdrawals.find((w: any) => w.id === id)
                if (apiFound) setWithdrawalDetail(apiFound)
              }
            })
            .catch((err) => console.error("Error fetching single deep-link withdrawal:", err))
        }
      } else {
        // Standard structural tab mapping
        const validTabs = ["payments", "withdrawals", "disputes", "analytics"]
        if (validTabs.includes(cleanHash)) {
          setActiveTab(cleanHash)
        }
      }
    }

    // Run evaluations immediately on mount & data population
    parseHash()

    window.addEventListener("hashchange", parseHash)
    return () => window.removeEventListener("hashchange", parseHash)
  }, [withdrawals, loading])

  const closeWithdrawalDetail = () => {
    setWithdrawalDetail(null)
    if (typeof window !== "undefined" && window.location.hash.startsWith("#withdrawals-")) {
      window.location.hash = "withdrawals"
    }
  }

  const selectWithdrawalDetail = (w: WithdrawalRequest) => {
    setWithdrawalDetail(w)
    if (typeof window !== "undefined") {
      window.location.hash = `withdrawals-${w.id}`
    }
  }

  const selectTab = (tabId: string) => {
    setActiveTab(tabId)
    if (typeof window !== "undefined") {
      window.location.hash = tabId
    }
  }

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
      if (selectedModule !== "ALL") qs.set("module", selectedModule)

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
  }, [dateRange, selectedStatus, selectedType, selectedModule, walletPage, walletPageSize, walletSearch, withdrawPage])

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
  }, [dateRange, selectedStatus, selectedType, selectedModule, walletSearch])

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
        return "bg-emerald-50 text-emerald-700 border-emerald-200/60"
      case "PENDING":
      case "PROCESSING":
        return "bg-amber-50 text-amber-700 border-amber-200/60"
      case "FAILED":
      case "REJECTED":
        return "bg-rose-50 text-rose-700 border-rose-200/60"
      case "REFUNDED":
      case "PARTIALLY_REFUNDED":
        return "bg-blue-50 text-blue-700 border-blue-200/60"
      case "DISPUTED":
        return "bg-purple-50 text-purple-700 border-purple-200/60"
      case "CANCELLED":
        return "bg-slate-50 text-slate-600 border-slate-200/60"
      default:
        return "bg-slate-50 text-slate-600 border-slate-200/60"
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "CARD":
        return <div className="h-5 w-5 rounded-full bg-blue-50/80 text-blue-600 flex items-center justify-center shrink-0"><CreditCard className="h-3 w-3" /></div>
      case "BANK_TRANSFER":
        return <div className="h-5 w-5 rounded-full bg-amber-50/80 text-amber-600 flex items-center justify-center shrink-0"><Building className="h-3 w-3" /></div>
      case "WALLET":
        return <div className="h-5 w-5 rounded-full bg-emerald-50/80 text-emerald-600 flex items-center justify-center shrink-0"><Wallet className="h-3 w-3" /></div>
      case "MOBILE_MONEY":
        return <div className="h-5 w-5 rounded-full bg-purple-50/80 text-purple-600 flex items-center justify-center shrink-0"><CreditCard className="h-3 w-3" /></div>
      default:
        return <div className="h-5 w-5 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><DollarSign className="h-3 w-3" /></div>
    }
  }

  const cur = stats?.currencySymbol ?? "₦"
  const volDelta = stats?.volumeChangePercent ?? 0
  const isPositiveVol = volDelta >= 0

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-16 px-4 md:px-0 max-w-full overflow-hidden">
      
      {/* HEADER */}
      <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-6 md:p-8 rounded-2xl shadow-sm relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between border border-[#0f766e]/20">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-10 bottom-0 h-32 w-32 rounded-full bg-teal-400/10 blur-3xl"></div>
        
        <div className="relative z-10 flex items-center gap-4">
          <div className="h-14 w-14 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner shrink-0">
            <Wallet className="h-7 w-7 text-teal-300" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Payment Center</h1>
            <p className="text-teal-100/70 mt-1 text-xs font-medium max-w-md">Monitor transactions, process withdrawals, and manage system liquidity.</p>
          </div>
        </div>

        <div className="relative z-10 mt-5 lg:mt-0 flex flex-wrap items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="h-10 bg-white/10 border border-white/20 text-white rounded-lg px-3 focus:ring-2 focus:ring-teal-400 outline-none text-xs font-bold cursor-pointer hover:bg-white/20 transition-colors"
          >
            <option value="24h" className="text-slate-900">Last 24 Hours</option>
            <option value="7d" className="text-slate-900">Last 7 Days</option>
            <option value="30d" className="text-slate-900">Last 30 Days</option>
            <option value="90d" className="text-slate-900">Last 90 Days</option>
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={() => handleExport()}
            className="flex items-center h-10 px-4 text-white text-xs font-bold rounded-lg bg-teal-400 hover:bg-teal-300 shadow-md shadow-teal-500/10 transition-all disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 mr-1.5 text-white" />
            Export CSV
          </button>
        </div>
      </div>

      {/* ACTION BANNER */}
      {actionBanner && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border animate-in slide-in-from-top-4 shadow-sm ${
            actionBanner.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionBanner.type === "ok" ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" /> : <XCircle className="h-4.5 w-4.5 text-rose-600" />}
            <span className="text-xs font-bold">{actionBanner.text}</span>
          </div>
          <button type="button" className="p-1 rounded-lg hover:bg-black/5 transition-colors" onClick={() => setActionBanner(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* SKELETON LOADER VS ACTIVE UI */}
      {loading ? (
        <div className="space-y-6">
          {/* Skeleton Clearance Setting */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-100" />
              <div className="space-y-2">
                <div className="h-4 w-36 bg-slate-100 rounded" />
                <div className="h-3 w-64 bg-slate-100 rounded" />
              </div>
            </div>
            <div className="h-10 w-32 bg-slate-100 rounded-xl" />
          </div>

          {/* Skeleton KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white p-5 rounded-2xl border border-slate-100 space-y-4">
                <div className="flex justify-between items-center">
                  <div className="h-10 w-10 bg-slate-100 rounded-xl" />
                  <div className="h-5 w-12 bg-slate-100 rounded" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                  <div className="h-6 w-28 bg-slate-100 rounded" />
                  <div className="h-3.5 w-36 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>

          {/* Skeleton Main Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-pulse">
            <div className="h-12 bg-slate-50 border-b border-slate-100 flex items-center px-4 gap-4">
              <div className="h-6 w-24 bg-slate-200 rounded" />
              <div className="h-6 w-24 bg-slate-200 rounded" />
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center gap-4">
                <div className="h-10 w-full max-w-xs bg-slate-100 rounded-xl" />
                <div className="h-10 w-44 bg-slate-100 rounded-xl" />
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((row) => (
                  <div key={row} className="h-12 bg-slate-50 rounded-xl w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* RIDER CLEARANCE SETTING */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-teal-100 transition-colors">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100 group-hover:bg-teal-50 group-hover:text-teal-600 group-hover:border-teal-100 transition-colors shrink-0">
                <Settings className="h-5 w-5 text-slate-400 group-hover:text-teal-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Wallet Clearance Window</h2>
                <p className="text-[11px] text-slate-500 mt-0.5 max-w-2xl leading-relaxed font-medium">
                  Set the number of calendar days before a rider/vendor&apos;s delivery earnings transition into their available, withdrawable balance.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-slate-50/50 p-2 rounded-xl border border-slate-100 shrink-0 w-max self-end md:self-auto">
              <label htmlFor="riderClearanceDays" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1.5">
                Days
              </label>
              <input
                id="riderClearanceDays"
                type="number"
                min={1}
                max={14}
                value={riderClearanceDays}
                onChange={(e) => setRiderClearanceDays(Math.min(14, Math.max(1, Number(e.target.value) || 4)))}
                className="w-12 text-center border border-slate-200 rounded-lg py-1.5 text-xs font-bold focus:ring-1 focus:ring-teal-500 outline-none"
              />
              <button
                type="button"
                disabled={savingClearance}
                onClick={() => void saveRiderClearanceDays()}
                className="px-4 py-1.5 text-white text-[11px] font-bold rounded-lg bg-teal-600 hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {savingClearance ? "Saving..." : "Save"}
              </button>
            </div>
          </div>

          {/* KPI GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group hover:border-teal-100 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center border border-emerald-100 transition-transform">
                  <Wallet className="h-5 w-5 text-emerald-600" />
                </div>
                <div className={`flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${isPositiveVol ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-rose-50 text-rose-700 border-rose-100"}`}>
                  {isPositiveVol ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                  {Math.abs(volDelta)}%
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Wallet Volume</p>
                <p className="text-xl font-black text-slate-900 tracking-tight">
                  {cur}{(stats?.totalVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-medium">Gateway Paid: <span className="font-bold text-slate-700">{cur}{(stats?.gatewayPaidVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group hover:border-blue-100 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center border border-blue-100 transition-transform">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Total Transactions</p>
                <p className="text-xl font-black text-slate-900 tracking-tight">{stats?.totalTransactions?.toLocaleString() ?? "0"}</p>
                <div className="mt-1 flex items-center text-[10px] font-bold text-emerald-700">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1 shrink-0" />
                  <span>{stats?.successRate ?? 0}% success rate</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group hover:border-amber-100 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100 transition-transform">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Pending / Failed</p>
                <p className="text-xl font-black text-slate-900 tracking-tight">{stats?.pendingPayments ?? 0}</p>
                <div className="mt-1 flex items-center text-[10px] font-semibold text-slate-500">
                  <span className="text-rose-600 font-bold">{stats?.failedPayments ?? 0} fail (wall)</span>
                  <span className="mx-1.5 text-slate-300">•</span>
                  <span>GW: {stats?.gatewayFailedCount ?? 0} fail</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 group hover:border-purple-100 transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="h-10 w-10 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100 transition-transform">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Paid Commission</p>
                <p className="text-xl font-black text-slate-900 tracking-tight">
                  {cur}{(stats?.totalCommission ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <div className="mt-1 flex items-center justify-between text-[10px]">
                  <span className="text-amber-700 font-bold">{stats?.pendingWithdrawals ?? 0} pend w/d</span>
                  <span className="text-slate-400 font-medium">Ref: <span className="font-bold text-slate-600">{cur}{(stats?.totalRefunds ?? 0).toLocaleString()}</span></span>
                </div>
              </div>
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col w-full">
            
            {/* Tabs */}
            <div className="border-b border-slate-100 bg-slate-50/50 p-1.5">
              <div className="flex space-x-1 w-full overflow-x-auto scrollbar-none">
                {[
                  { id: "payments", label: "Payments Ledger" },
                  { id: "withdrawals", label: "Withdrawal Requests" },
                  { id: "disputes", label: "Disputes" },
                  { id: "analytics", label: "Financial Analytics" }
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTab(t.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all shrink-0 ${
                      activeTab === t.id
                        ? "bg-white text-teal-700 shadow-sm border border-slate-150"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-0">
              
              {/* TAB: PAYMENTS */}
              {activeTab === "payments" && (
                <div className="space-y-0 animate-in fade-in">
                  
                  {/* Payment Source Toggles */}
                  <div className="flex gap-1.5 p-4 border-b border-slate-100 bg-white">
                    <button
                      type="button"
                      onClick={() => setPaymentSource("wallet")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        paymentSource === "wallet" 
                        ? "bg-slate-900 border-slate-900 text-white" 
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      Internal Wallet Ledger
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentSource("gateway")}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                        paymentSource === "gateway" 
                        ? "bg-slate-900 border-slate-900 text-white" 
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      External Gateway Records
                    </button>
                  </div>

                  {/* Wallet Ledger View */}
                  {paymentSource === "wallet" && (
                    <div className="flex flex-col w-full">
                      <div className="flex flex-col md:flex-row gap-3 items-center justify-between p-4">
                        <div className="relative w-full md:max-w-xs">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                          <input
                            type="text"
                            placeholder="Search ref, user, order id..."
                            value={walletSearch}
                            onChange={(e) => setWalletSearch(e.target.value)}
                            className="pl-9 pr-3 py-1.5 w-full border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-teal-500 focus:border-transparent text-xs outline-none transition-all placeholder:text-slate-400 h-9"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                          <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:ring-1 focus:ring-teal-500 h-9 flex-1 md:flex-none cursor-pointer"
                          >
                            <option value="ALL">All Statuses</option>
                            <option value="PENDING">Pending</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="FAILED">Failed</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                          <select
                            value={selectedModule}
                            onChange={(e) => setSelectedModule(e.target.value)}
                            className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:ring-1 focus:ring-teal-500 h-9 flex-1 md:flex-none cursor-pointer"
                          >
                            <option value="ALL">All Modules</option>
                            <option value="PROPERTY">Booking</option>
                            <option value="FOOD">Food</option>
                            <option value="PHARMACY">Pharmacy</option>
                            <option value="GROCERY">Grocery</option>
                            <option value="RIDING">Riding</option>
                            <option value="AUTO_PARTS">Auto Parts</option>
                          </select>
                          <select
                            value={selectedType}
                            onChange={(e) => setSelectedType(e.target.value)}
                            className="border border-slate-200 bg-white rounded-lg px-2 py-1.5 text-xs text-slate-600 outline-none focus:ring-1 focus:ring-teal-500 h-9 flex-1 md:flex-none cursor-pointer"
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

                      <div className="overflow-x-auto w-full border-t border-slate-100">
                        <table className="w-full text-left border-collapse table-auto">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[180px]">Transaction Info</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entity</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Financials</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status & Method</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Timestamp</th>
                              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white text-xs">
                            {payments.length > 0 ? (
                              payments.map((payment) => (
                                <tr key={payment.id} className="hover:bg-slate-50/50 transition-colors group">
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="font-mono text-[11px] font-bold text-slate-900 tracking-tight mb-1">{payment.transactionId}</div>
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-wider inline-block">
                                      {String(payment.type).replace(/_/g, " ")}
                                    </span>
                                    {payment.orderId && <div className="text-[10px] text-indigo-600 mt-1 font-semibold">Ord: {payment.orderId}</div>}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2.5">
                                      <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center border border-slate-150 text-slate-400 shrink-0">
                                        <User className="h-4 w-4" />
                                      </div>
                                      <div>
                                        <p className="font-bold text-slate-800 leading-tight">{payment.userName || "Unknown User"}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">{payment.userType}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="font-bold text-slate-900 text-sm">{payment.currency} {payment.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                    <div className="text-[10px] text-slate-400">Fee: {payment.fees.total.toFixed(2)}</div>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap">
                                    <div className="flex flex-col gap-1 items-start">
                                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${getStatusColor(payment.status)}`}>
                                        {payment.status}
                                      </span>
                                      <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 mt-0.5">
                                        {getPaymentMethodIcon(payment.method)} {payment.method.replace("_", " ")}
                                      </div>
                                      {payment.failureReason && <div className="text-[9px] text-rose-500 font-semibold max-w-[120px] truncate" title={payment.failureReason}>{payment.failureReason}</div>}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-500 font-semibold">
                                    <div>{new Date(payment.createdAt).toLocaleDateString()}</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">{new Date(payment.createdAt).toLocaleTimeString()}</div>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-right">
                                    <div className="flex items-center justify-end gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                                      <button onClick={() => setWalletDetail(payment)} className="h-7 w-7 flex items-center justify-center rounded-lg bg-slate-50 hover:bg-teal-50 text-slate-500 hover:text-teal-600 border border-slate-200 transition-colors" title="View Detail">
                                        <Eye size={12} />
                                      </button>
                                      {payment.status === "FAILED" && (
                                        <button onClick={() => handlePaymentAction(payment.id, "retry")} className="h-7 w-7 flex items-center justify-center rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 hover:text-amber-700 border border-amber-200 transition-colors" title="Retry">
                                          <RefreshCw size={12} />
                                        </button>
                                      )}
                                      {payment.status === "COMPLETED" && (
                                        <button onClick={() => handlePaymentAction(payment.id, "refund")} className="h-7 w-7 flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 transition-colors" title="Refund">
                                          <RefreshCw size={12} />
                                        </button>
                                      )}
                                      {payment.status === "PENDING" && (
                                        <button onClick={() => handlePaymentAction(payment.id, "cancel")} className="h-7 w-7 flex items-center justify-center rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 transition-colors" title="Cancel">
                                          <Ban size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-xs font-semibold">
                                  <div className="flex flex-col items-center">
                                    <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200 mb-3">
                                      <Search className="h-5 w-5 text-slate-400" />
                                    </div>
                                    No wallet transactions match your current filters.
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination */}
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page <span className="text-slate-800">{walletPage}</span> of <span className="text-slate-800">{walletTotalPages}</span></p>
                        <div className="flex gap-1.5">
                          <button disabled={walletPage <= 1} onClick={() => setWalletPage((p) => Math.max(1, p - 1))} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 transition-colors shadow-sm">
                            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                          </button>
                          <button disabled={walletPage >= walletTotalPages} onClick={() => setWalletPage((p) => p + 1)} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 transition-colors shadow-sm">
                            Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Gateway View */}
                  {paymentSource === "gateway" && (
                    <div className="flex flex-col w-full">
                      <div className="flex flex-col md:flex-row gap-3 items-center justify-between p-4">
                        <div className="relative w-full md:max-w-xs">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
                          <input
                            type="text"
                            placeholder="Search gateway ref, email, order..."
                            value={gatewaySearch}
                            onChange={(e) => setGatewaySearch(e.target.value)}
                            className="pl-9 pr-3 py-1.5 w-full border border-slate-200 rounded-lg bg-white focus:ring-1 focus:ring-teal-500 focus:border-transparent text-xs outline-none transition-all placeholder:text-slate-400 h-9"
                          />
                        </div>
                        <select
                          value={gatewayStatus}
                          onChange={(e) => setGatewayStatus(e.target.value)}
                          className="border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:ring-1 focus:ring-teal-500 h-9 w-full md:w-auto cursor-pointer"
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="PENDING">Pending</option>
                          <option value="PAID">Paid</option>
                          <option value="FAILED">Failed</option>
                          <option value="REFUNDED">Refunded</option>
                          <option value="PARTIALLY_REFUNDED">Partially Refunded</option>
                        </select>
                      </div>

                      <div className="overflow-x-auto w-full border-t border-slate-100">
                        {gatewayLoading ? (
                          <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3 bg-slate-50/30">
                            <Loader2 className="h-6 w-6 animate-spin text-teal-600" />
                            <p className="font-semibold text-xs">Fetching gateway ledgers...</p>
                          </div>
                        ) : (
                          <>
                            <table className="w-full text-left border-collapse table-auto">
                              <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gateway Ref & Order</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Customer Details</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount Paid</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Method</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Processed On</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 bg-white text-xs">
                                {groupedGatewayPayments.length > 0 ? groupedGatewayPayments.map((group) => (
                                  <tr key={group.groupKey} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <div className="font-mono text-[11px] font-bold text-slate-900 mb-0.5" title={group.groupKey}>
                                        {group.groupKey.slice(0, 14)}...
                                      </div>
                                      {group.gatewayTransactionId && <div className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Building size={11} className="text-slate-400 shrink-0" /> {group.gatewayTransactionId}</div>}
                                      {group.orderNumber && <div className="text-[10px] font-bold text-indigo-600 mt-1">Ord: #{group.orderNumber}</div>}
                                      {group.isSplitGroup && (
                                        <div className="mt-1 inline-flex px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-bold text-[9px] tracking-wider">
                                          SPLIT PAY
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <p className="font-bold text-slate-800">{group.userName || "Guest User"}</p>
                                      <p className="text-[10px] text-slate-400 mt-0.5 font-medium max-w-[150px] truncate" title={group.userEmail || ""}>{group.userEmail}</p>
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <div className="font-extrabold text-slate-900 text-sm">
                                        {group.currency} {group.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                      </div>
                                      {group.processingFeeLedger && (
                                        <div className="text-[9px] font-bold text-amber-700 mt-1 bg-amber-50 w-max px-1.5 py-0.5 rounded border border-amber-100">
                                          Fee: {group.processingFeeLedger.currency}{" "}
                                          {group.processingFeeLedger.commissionAmount.toFixed(2)}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <div className="font-bold text-slate-700 text-xs capitalize">{group.gateway}</div>
                                      {group.rows[0]?.paymentMethod && (
                                        <div className="text-[10px] font-medium text-slate-400 mt-0.5 flex items-center gap-1">
                                          {group.rows[0].paymentMethod.provider} {group.rows[0].paymentMethod.brand ? `· ${group.rows[0].paymentMethod.brand}` : ""}
                                          {group.rows[0].paymentMethod.lastFour ? <span className="font-mono font-bold text-slate-500">*{group.rows[0].paymentMethod.lastFour}</span> : ""}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${getStatusColor(group.status)}`}>
                                        {group.status}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 whitespace-nowrap">
                                      <div className="font-semibold text-slate-600">{new Date(group.createdAt).toLocaleDateString()}</div>
                                      <div className="text-[10px] text-slate-400 mb-1.5 mt-0.5">{new Date(group.createdAt).toLocaleTimeString()}</div>
                                      <button
                                        type="button"
                                        onClick={() => setGatewayGroupDetail(group)}
                                        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-teal-700 bg-slate-100 hover:bg-teal-50 border border-slate-200 hover:border-teal-200 px-2 py-0.5 rounded transition-colors"
                                      >
                                        <Eye size={10} />
                                        Details
                                      </button>
                                    </td>
                                  </tr>
                                )) : (
                                  <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-xs font-semibold">
                                      <div className="flex flex-col items-center">
                                        <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-200 mb-3">
                                          <Search className="h-5 w-5 text-slate-400" />
                                        </div>
                                        No gateway records found.
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-200">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page <span className="text-slate-800">{gatewayPage}</span> of <span className="text-slate-800">{gatewayTotalPages}</span></p>
                              <div className="flex gap-1.5">
                                <button disabled={gatewayPage <= 1} onClick={() => setGatewayPage((p) => Math.max(1, p - 1))} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 transition-colors shadow-sm">
                                  <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                                </button>
                                <button disabled={gatewayPage >= gatewayTotalPages} onClick={() => setGatewayPage((p) => p + 1)} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 transition-colors shadow-sm">
                                  Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
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
                <div className="p-4 space-y-3.5 animate-in fade-in">
                  {withdrawals.length > 0 ? withdrawals.map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={() => selectWithdrawalDetail(w)}
                      className={`w-full text-left bg-white p-4 rounded-xl border shadow-sm flex flex-col xl:flex-row xl:items-start justify-between gap-4 transition-all hover:shadow-md ${w.status === "PENDING" ? "border-amber-300 border-l-4" : "border-slate-200 hover:border-teal-100"}`}
                    >
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 bg-slate-50 rounded-lg flex items-center justify-center border border-slate-200 shrink-0">
                            <Store className="h-4 w-4 text-slate-600" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{w.vendorName}</h4>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{w.vendorId}</p>
                          </div>
                          <span className={`ml-auto xl:ml-3 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${getStatusColor(w.status)}`}>
                            {w.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Amount Requested</p>
                            <p className="text-lg font-black text-slate-900">{cur}{w.amount.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Destination Bank</p>
                            {w.bankDetails ? (
                              <>
                                <p className="font-bold text-slate-800">{w.bankDetails.accountName}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{w.bankDetails.bankName} •••• <span className="font-mono font-bold text-slate-500">{w.bankDetails.accountNumber?.slice(-4) ?? ""}</span></p>
                              </>
                            ) : (
                              <p className="text-slate-400 italic font-semibold mt-0.5">No bank provided</p>
                            )}
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Date Requested</p>
                            <p className="font-bold text-slate-700">{new Date(w.requestedAt).toLocaleDateString()}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{new Date(w.requestedAt).toLocaleTimeString()}</p>
                          </div>
                        </div>

                        {w.rejectionReason && (
                          <div className="bg-rose-50 border border-rose-100 p-3 rounded-lg flex items-start gap-2 text-rose-800 text-xs">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <p><strong>Rejected:</strong> {w.rejectionReason}</p>
                          </div>
                        )}

                        {(() => {
                          const meta = parseWithdrawalNotes(w.notes)
                          if (!meta.scheduledProcessDate && !meta.clearingBusinessDays && !meta.message) return null
                          return (
                            <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex items-start gap-2 text-xs">
                              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                              <div>
                                <p className="font-bold text-amber-900">Clearing & Schedule Info</p>
                                <div className="mt-0.5 space-y-0.5 text-amber-800">
                                  {meta.clearingBusinessDays != null && <p className="text-[11px]">Clearing window: <span className="font-bold">{meta.clearingBusinessDays} business days.</span></p>}
                                  {meta.scheduledProcessDate && <p className="text-[11px]">Est. Payout Date: <span className="font-bold">{new Date(meta.scheduledProcessDate).toLocaleString()}</span></p>}
                                  {meta.message && <p className="text-[10px] italic mt-1.5 bg-amber-100/40 p-1.5 rounded">{meta.message}</p>}
                                </div>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                      
                      {w.status === "PENDING" && (
                        <div className="flex xl:flex-col items-center justify-end gap-2 shrink-0 w-full xl:w-36 border-t xl:border-t-0 border-slate-100 pt-3 xl:pt-0">
                          <button onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, "approve") }} className="w-full flex items-center justify-center px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm">
                            Approve Payout
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(w.id, "reject", "Insufficient documentation or invalid banking detail.") }} className="w-full flex items-center justify-center px-3 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold text-xs rounded-lg transition-colors shadow-sm">
                            Reject
                          </button>
                        </div>
                      )}
                    </button>
                  )) : (
                    <div className="py-16 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-xl border border-slate-200 border-dashed">
                      <div className="h-10 w-10 bg-white rounded-lg flex items-center justify-center border border-slate-200 mb-3 shadow-sm">
                        <Wallet className="h-5 w-5 text-slate-400" />
                      </div>
                      <h3 className="text-xs font-bold text-slate-900">No Pending Withdrawals</h3>
                      <p className="text-xs text-slate-400 font-semibold mt-0.5">No withdrawal requests to process in this range.</p>
                    </div>
                  )}
                  
                  {withdrawals.length > 0 && (
                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-4">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page <span className="text-slate-800">{withdrawPage}</span> of <span className="text-slate-800">{withdrawTotalPages}</span></p>
                      <div className="flex gap-1.5">
                        <button disabled={withdrawPage <= 1} onClick={() => setWithdrawPage(p => Math.max(1, p - 1))} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 shadow-sm transition-colors">
                          <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Prev
                        </button>
                        <button disabled={withdrawPage >= withdrawTotalPages} onClick={() => setWithdrawPage(p => p + 1)} className="flex items-center px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 shadow-sm transition-colors">
                          Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB: DISPUTES */}
              {activeTab === "disputes" && (
                <div className="py-16 flex flex-col items-center justify-center text-center animate-in fade-in bg-slate-50/30 rounded-xl border border-slate-100 m-4">
                  <div className="h-14 w-14 bg-white rounded-2xl flex items-center justify-center mb-3 border border-slate-200 shadow-sm">
                    <AlertTriangle className="h-6 w-6 text-slate-400" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mb-1">Dispute Resolution Center</h3>
                  <p className="text-xs text-slate-500 mb-4 max-w-xs font-semibold leading-relaxed">Manage chargebacks, frozen funds, and user transaction disputes centrally.</p>
                  <button className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-lg hover:bg-slate-800 transition-all"
                  onClick={() => router.push('/admin/payments/refunds')}
                  >
                    Access Dispute Dashboard
                  </button>
                </div>
              )}

              {/* TAB: ANALYTICS */}
              {activeTab === "analytics" && (
                <div className="p-4 space-y-4 animate-in fade-in">
                  <div className="bg-indigo-50 border border-indigo-100 p-3.5 rounded-xl flex items-start gap-2.5 shadow-sm text-xs text-indigo-900">
                    <Info className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5" />
                    <p className="font-semibold leading-relaxed">Financial analytics are strictly bound to the globally selected date range (<span className="font-bold">{dateRange}</span>) mapping to live system data.</p>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-4">Volume Trend: Wallet vs Gateway</h3>
                    <div className="h-80 w-full">
                      {stats?.timeSeries && stats.timeSeries.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={stats.timeSeries} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => `${cur}${v >= 1000 ? v/1000+'k' : v}`}/>
                            <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold'}} />
                            <Legend wrapperStyle={{paddingTop: '15px', fontSize: '11px', fontWeight: 'bold', color: '#64748b'}}/>
                            <Bar dataKey="walletVolume" name="Wallet Volume" fill="#0f766e" stackId="a" radius={[0, 0, 4, 4]} />
                            <Bar dataKey="gatewayVolume" name="Gateway Volume" fill="#3b82f6" stackId="a" radius={[4, 4, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 font-semibold text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                          <BarChart className="h-6 w-6 text-slate-300 mb-1.5" />
                          No time-series data available.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-4">Transactions by Ledger</h3>
                      <div className="h-[240px] w-full">
                        {stats?.walletByType && stats.walletByType.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.walletByType} layout="vertical" margin={{ top: 0, right: 10, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="type" type="category" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold'}} />
                              <Bar dataKey="count" name="Count" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={16} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 font-semibold text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">No transaction count data.</div>
                        )}
                      </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <h3 className="text-sm font-bold text-slate-900 mb-4">Volume by Ledger</h3>
                      <div className="h-[240px] w-full">
                        {stats?.walletByType && stats.walletByType.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.walletByType} layout="vertical" margin={{ top: 0, right: 10, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                              <XAxis type="number" hide />
                              <YAxis dataKey="type" type="category" tick={{ fontSize: 9, fill: '#64748b', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                              <Tooltip cursor={{fill: '#f8fafc'}} formatter={(v: number) => `${cur}${v.toLocaleString()}`} contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: 'bold'}} />
                              <Bar dataKey="volume" name="Volume" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={16} />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-slate-400 font-semibold text-xs bg-slate-50/50 rounded-xl border border-dashed border-slate-200">No volume data.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">Status Distribution (Wallet Matrix)</h3>
                    <div className="flex flex-wrap gap-2.5">
                      {(stats?.walletByStatus ?? []).map((s) => (
                        <div key={s.status} className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-slate-200 shadow-sm hover:border-teal-100 transition-colors">
                          <div className={`h-2.5 w-2.5 rounded-full ${s.status === 'COMPLETED' ? 'bg-emerald-500' : s.status === 'FAILED' ? 'bg-rose-500' : s.status === 'PENDING' ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
                          <span className="font-bold text-slate-700 text-[10px] tracking-wider uppercase">{s.status}</span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px] font-black text-slate-500 border border-slate-200/50">{s.count.toLocaleString()}</span>
                        </div>
                      ))}
                      {!stats?.walletByStatus?.length && <p className="text-slate-400 text-xs font-semibold">No state matrices generated for this range.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* JSON MODAL (WALLET DETAIL) */}
      {walletDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-white z-10 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Transaction Raw Data</h3>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase tracking-wider">{walletDetail.transactionId}</p>
              </div>
              <button onClick={() => setWalletDetail(null)} className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto bg-slate-50/50">
              <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800 bg-slate-950">
                  <Terminal size={12} className="text-slate-400" />
                  <span className="text-[10px] font-mono font-bold text-slate-400">JSON Payload</span>
                </div>
                <div className="p-4 overflow-x-auto custom-scrollbar">
                  <pre className="text-[11px] text-emerald-400 font-mono leading-relaxed">
                    {JSON.stringify(walletDetail, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-start gap-2.5">
              <Info className="h-4.5 w-4.5 text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-500 font-semibold leading-normal">
                Use the quick action buttons (Retry / Cancel / Refund) directly on the transaction ledger table. Submitting a refund applies an administrative flag for review and freezes automated payouts for that specific transaction.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* WITHDRAWAL DETAIL MODAL */}
      {withdrawalDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-white z-10 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Withdrawal Request</h3>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase tracking-wider">{withdrawalDetail.id}</p>
              </div>
              <button onClick={closeWithdrawalDetail} className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto bg-slate-50/50 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vendor</p>
                  <p className="text-sm font-bold text-slate-900 mt-1">{withdrawalDetail.vendorName}</p>
                  <p className="text-[9px] text-slate-400 mt-1 font-mono bg-slate-50 px-1.5 py-0.5 rounded w-max border border-slate-100">{withdrawalDetail.vendorId}</p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Requested Amount</p>
                  <p className="text-xl font-black text-slate-900 mt-1">
                    {cur}{withdrawalDetail.amount.toLocaleString()}
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-150 rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Current Wallet Balance</p>
                  <p className="text-lg font-black text-emerald-950 mt-1">
                    {withdrawalDetail.vendorWalletCurrency || cur}{(withdrawalDetail.vendorWalletBalance ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Request Date</p>
                  <p className="font-bold text-slate-800 mt-1">{new Date(withdrawalDetail.requestedAt).toLocaleString()}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Bank Details</p>
                {withdrawalDetail.bankDetails ? (
                  <div className="space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <p className="text-slate-900 font-bold">{withdrawalDetail.bankDetails.accountName}</p>
                    <p className="text-slate-500">Bank: <span className="text-slate-850 font-bold">{withdrawalDetail.bankDetails.bankName}</span></p>
                    <p className="text-slate-500">Account: <span className="text-slate-850 font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">{withdrawalDetail.bankDetails.accountNumber}</span></p>
                    {withdrawalDetail.bankDetails.routingNumber && (
                      <p className="text-slate-500">Routing: <span className="text-slate-850 font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">{withdrawalDetail.bankDetails.routingNumber}</span></p>
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic bg-slate-50 p-3 rounded-lg border border-slate-100 border-dashed">No bank details provided.</p>
                )}
              </div>
            </div>
            {withdrawalDetail.status === "PENDING" && (
              <div className="px-5 py-4 border-t border-slate-100 bg-white flex items-center justify-end gap-2 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); closeWithdrawalDetail() }} className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                  Cancel
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(withdrawalDetail.id, "reject", "Insufficient documentation or invalid banking detail.") }} className="px-4 py-1.5 bg-white border border-rose-200 text-rose-600 font-bold text-xs rounded-lg hover:bg-rose-50 transition-colors shadow-sm">
                  Reject
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleWithdrawalAction(withdrawalDetail.id, "approve") }} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors shadow-sm">
                  Approve Payout
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GATEWAY GROUP MODAL */}
      {gatewayGroupDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200/50 animate-in zoom-in-95 slide-in-from-bottom-4 duration-200">
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-white z-10 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Gateway Payment Group</h3>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 uppercase tracking-wider">{gatewayGroupDetail.groupKey}</p>
              </div>
              <button onClick={() => setGatewayGroupDetail(null)} className="h-8 w-8 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 transition-colors">
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="p-5 space-y-5 overflow-y-auto bg-slate-50/50 text-xs">
              
              {gatewayGroupDetail.processingFeeLedger && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1.5">Payment Processing Ledger</p>
                  <p className="text-base font-black text-amber-900">
                    Fee: {gatewayGroupDetail.processingFeeLedger.currency} {gatewayGroupDetail.processingFeeLedger.commissionAmount.toFixed(2)}
                    <span className="text-xs font-bold ml-1.5">({gatewayGroupDetail.processingFeeLedger.commissionRate}%)</span>
                  </p>
                  <p className="text-[10px] font-bold text-amber-800 mt-2 bg-amber-100/50 w-max px-2 py-0.5 rounded border border-amber-200/50">
                    Base Amount: {gatewayGroupDetail.processingFeeLedger.currency} {gatewayGroupDetail.processingFeeLedger.orderAmount.toFixed(2)}
                  </p>
                </div>
              )}
              
              {gatewayGroupDetail.primaryOrderRow?.orderSummary && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Order Financial Breakdown</p>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="flex justify-between border-b border-slate-200/50 pb-1"><span className="text-slate-400 font-semibold">Subtotal:</span> <span className="font-bold text-slate-800">{gatewayGroupDetail.currency} {gatewayGroupDetail.primaryOrderRow.orderSummary.subtotal.toFixed(2)}</span></div>
                    <div className="flex justify-between border-b border-slate-200/50 pb-1"><span className="text-slate-400 font-semibold">Delivery:</span> <span className="font-bold text-slate-800">{gatewayGroupDetail.currency} {gatewayGroupDetail.primaryOrderRow.orderSummary.deliveryFee.toFixed(2)}</span></div>
                    <div className="flex justify-between border-b border-slate-200/50 pb-1"><span className="text-slate-400 font-semibold">Service:</span> <span className="font-bold text-slate-800">{gatewayGroupDetail.currency} {gatewayGroupDetail.primaryOrderRow.orderSummary.serviceFee.toFixed(2)}</span></div>
                    <div className="flex justify-between border-b border-slate-200/50 pb-1"><span className="text-slate-400 font-semibold">Tax:</span> <span className="font-bold text-slate-800">{gatewayGroupDetail.currency} {gatewayGroupDetail.primaryOrderRow.orderSummary.tax.toFixed(2)}</span></div>
                    <div className="flex justify-between border-b border-slate-200/50 pb-1"><span className="text-slate-400 font-semibold">Discount:</span> <span className="font-bold text-emerald-600">{gatewayGroupDetail.currency} {gatewayGroupDetail.primaryOrderRow.orderSummary.discount.toFixed(2)}</span></div>
                    <div className="flex justify-between border-b border-slate-200/50 pb-1"><span className="text-slate-900 font-black">Total:</span> <span className="font-black text-slate-900">{gatewayGroupDetail.currency} {gatewayGroupDetail.primaryOrderRow.orderSummary.total.toFixed(2)}</span></div>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm flex flex-col">
                <div className="p-3.5 border-b border-slate-100 bg-slate-50">
                  <h4 className="text-xs font-bold text-slate-900">Associated Transactions</h4>
                </div>
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse table-auto text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Id</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {gatewayGroupDetail.rows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 text-[10px] font-mono text-slate-500">{row.id}</td>
                          <td className="px-4 py-2 font-bold text-slate-600 bg-slate-50/30">{row.paymentType || "-"}</td>
                          <td className="px-4 py-2 font-black text-slate-900">
                            {row.currency} {row.amount.toFixed(2)}
                          </td>
                          <td className="px-4 py-2 font-bold">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] border ${getStatusColor(row.status)}`}>{row.status}</span>
                          </td>
                          <td className="px-4 py-2 font-mono text-indigo-600 bg-indigo-50/30 text-[10px]">{row.orderNumber ? `#${row.orderNumber}` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  )
}