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
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ComposedChart } from "recharts"

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "COMPLETED":
      case "PAID":
        return "bg-green-100 text-green-800"
      case "PENDING":
        return "bg-yellow-100 text-yellow-800"
      case "FAILED":
        return "bg-red-100 text-red-800"
      case "REFUNDED":
      case "PARTIALLY_REFUNDED":
        return "bg-blue-100 text-blue-800"
      case "DISPUTED":
        return "bg-purple-100 text-purple-800"
      case "CANCELLED":
        return "bg-gray-200 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case "CARD":
        return <CreditCard className="h-4 w-4" />
      case "BANK_TRANSFER":
        return <Building className="h-4 w-4" />
      case "WALLET":
        return <DollarSign className="h-4 w-4" />
      case "MOBILE_MONEY":
        return <CreditCard className="h-4 w-4" />
      default:
        return <CreditCard className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  const cur = stats?.currencySymbol ?? "₦"
  const volDelta = stats?.volumeChangePercent ?? 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payment Management</h1>
          <p className="text-gray-600 mt-1">Monitor transactions, process withdrawals, and manage payment flows</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            type="button"
            onClick={() => handleExport()}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {actionBanner && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            actionBanner.type === "ok" ? "bg-emerald-50 text-emerald-900 border border-emerald-200" : "bg-red-50 text-red-900 border border-red-200"
          }`}
        >
          {actionBanner.text}
          <button type="button" className="ml-3 underline" onClick={() => setActionBanner(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Wallet volume (completed)</p>
              <p className="text-3xl font-bold text-gray-900">
                {cur}
                {(stats?.totalVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className={`h-4 w-4 mr-1 ${volDelta >= 0 ? "text-green-500" : "text-red-500"}`} />
            <span className={`text-sm font-medium ${volDelta >= 0 ? "text-green-600" : "text-red-600"}`}>
              {volDelta >= 0 ? "+" : ""}
              {volDelta}% vs previous period
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Gateway paid: {cur}
            {(stats?.gatewayPaidVolume ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Wallet transactions</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalTransactions?.toLocaleString() ?? "0"}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-sm text-green-600 font-medium">{stats?.successRate ?? 0}% completed share</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">Cancelled in range: {stats?.cancelledWalletTx ?? 0}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending / failed</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.pendingPayments ?? 0}</p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <AlertTriangle className="h-4 w-4 text-red-500 mr-1" />
            <span className="text-sm text-red-600 font-medium">{stats?.failedPayments ?? 0} wallet failed</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Gateway: {stats?.gatewayPendingCount ?? 0} pending · {stats?.gatewayFailedCount ?? 0} failed
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Commission (paid)</p>
              <p className="text-3xl font-bold text-gray-900">
                {cur}
                {(stats?.totalCommission ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <span className="text-sm text-gray-600">{stats?.pendingWithdrawals ?? 0} pending withdrawals</span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Refunds (wallet type): {cur}
            {(stats?.totalRefunds ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab("payments")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "payments"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Payments
            </button>
            <button
              onClick={() => setActiveTab("withdrawals")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "withdrawals"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Withdrawals
            </button>
            <button
              onClick={() => setActiveTab("disputes")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "disputes"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Disputes
            </button>
            <button
              onClick={() => setActiveTab("analytics")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "analytics"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Analytics
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "payments" && (
            <div className="space-y-6">
              <div className="flex flex-wrap gap-2 border-b border-gray-100 pb-3">
                <button
                  type="button"
                  onClick={() => setPaymentSource("wallet")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    paymentSource === "wallet" ? "bg-green-100 text-green-800" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Wallet ledger
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSource("gateway")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                    paymentSource === "gateway" ? "bg-green-100 text-green-800" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Gateway (Payment records)
                </button>
              </div>

              {paymentSource === "wallet" && (
                <>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                    <div className="flex-1 max-w-lg">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <input
                          type="text"
                          placeholder="Search ref, user, email, order id…"
                          value={walletSearch}
                          onChange={(e) => setWalletSearch(e.target.value)}
                          className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                      >
                        <option value="ALL">All Status</option>
                        <option value="PENDING">Pending</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="FAILED">Failed</option>
                        <option value="CANCELLED">Cancelled</option>
                      </select>
                      <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
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
                      <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                        <Filter className="h-4 w-4 mr-2" />
                        More Filters
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Transaction
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            User
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Amount
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Method
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {payments?.map((payment) => (
                            <tr key={payment.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{payment.transactionId}</div>
                                  <div className="text-sm text-gray-500">{String(payment.type).replace(/_/g, " ")}</div>
                                  {payment.orderId && (
                                    <div className="text-xs text-gray-400">Order: {payment.orderId}</div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center">
                                  <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
                                    <User className="h-4 w-4 text-gray-500" />
                                  </div>
                                  <div className="ml-3">
                                    <div className="text-sm font-medium text-gray-900">{payment.userName}</div>
                                    <div className="text-sm text-gray-500">{payment.userType}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">
                                    {payment.amount.toFixed(2)} {payment.currency}
                                  </div>
                                  <div className="text-xs text-gray-500">Fee: {payment.fees.total.toFixed(2)}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center">
                                  {getPaymentMethodIcon(payment.method)}
                                  <span className="ml-2 text-sm text-gray-900">{payment.method.replace("_", " ")}</span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(payment.status)}`}
                                >
                                  {payment.status}
                                </span>
                                {payment.failureReason && (
                                  <div className="text-xs text-red-600 mt-1">{payment.failureReason}</div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-900">
                                  {new Date(payment.createdAt).toLocaleDateString()}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(payment.createdAt).toLocaleTimeString()}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center space-x-2">
                                  <button
                                    type="button"
                                    title="View details"
                                    onClick={() => setWalletDetail(payment)}
                                    className="text-green-600 hover:text-green-900"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  {payment.status === "FAILED" && (
                                    <button
                                      type="button"
                                      onClick={() => handlePaymentAction(payment.id, "retry")}
                                      className="text-blue-600 hover:text-blue-900"
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </button>
                                  )}
                                  {payment.status === "COMPLETED" && (
                                    <button
                                      type="button"
                                      onClick={() => handlePaymentAction(payment.id, "refund")}
                                      className="text-orange-600 hover:text-orange-900"
                                    >
                                      <RefreshCw className="h-4 w-4" />
                                    </button>
                                  )}
                                  {payment.status === "PENDING" && (
                                    <button
                                      type="button"
                                      onClick={() => handlePaymentAction(payment.id, "cancel")}
                                      className="text-red-600 hover:text-red-900"
                                    >
                                      <Ban className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      Page {walletPage} of {walletTotalPages}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={walletPage <= 1}
                        onClick={() => setWalletPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={walletPage >= walletTotalPages}
                        onClick={() => setWalletPage((p) => p + 1)}
                        className="inline-flex items-center px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              {paymentSource === "gateway" && (
                <>
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex-1 max-w-lg relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <input
                        type="text"
                        placeholder="Search id, order, gateway ref, user email…"
                        value={gatewaySearch}
                        onChange={(e) => setGatewaySearch(e.target.value)}
                        className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <select
                      value={gatewayStatus}
                      onChange={(e) => setGatewayStatus(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    >
                      <option value="ALL">All status</option>
                      <option value="PENDING">Pending</option>
                      <option value="PAID">Paid</option>
                      <option value="FAILED">Failed</option>
                      <option value="REFUNDED">Refunded</option>
                      <option value="PARTIALLY_REFUNDED">Partially refunded</option>
                    </select>
                  </div>

                  {gatewayLoading ? (
                    <p className="text-gray-500 text-sm py-8 text-center">Loading gateway payments…</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payment</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gateway</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {gatewayPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 text-sm">
                                <div className="font-mono text-xs text-gray-800">{p.id.slice(0, 12)}…</div>
                                {p.gatewayTransactionId && (
                                  <div className="text-xs text-gray-500">Ref: {p.gatewayTransactionId}</div>
                                )}
                                {p.orderNumber && <div className="text-xs text-gray-500">Order #{p.orderNumber}</div>}
                                {p.description && <div className="text-xs text-gray-400 mt-1">{p.description}</div>}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <div className="font-medium text-gray-900">{p.userName || "—"}</div>
                                <div className="text-gray-500 text-xs">{p.userEmail}</div>
                                <div className="text-gray-400 text-xs">{p.userRole}</div>
                              </td>
                              <td className="px-6 py-4 text-sm font-medium">
                                {p.amount.toFixed(2)} {p.currency}
                              </td>
                              <td className="px-6 py-4 text-sm">
                                <div className="font-medium">{p.gateway}</div>
                                {p.paymentMethod && (
                                  <div className="text-xs text-gray-500">
                                    {p.paymentMethod.provider} {p.paymentMethod.brand || ""}{" "}
                                    {p.paymentMethod.lastFour ? `••••${p.paymentMethod.lastFour}` : ""}
                                  </div>
                                )}
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(p.status)}`}
                                >
                                  {p.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-gray-600">
                                {new Date(p.createdAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!gatewayLoading && gatewayPayments.length === 0 && (
                        <p className="text-center text-gray-500 py-8 text-sm">No Payment rows match your filters.</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-500">
                      Page {gatewayPage} of {gatewayTotalPages}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={gatewayPage <= 1}
                        onClick={() => setGatewayPage((p) => Math.max(1, p - 1))}
                        className="inline-flex items-center px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </button>
                      <button
                        type="button"
                        disabled={gatewayPage >= gatewayTotalPages}
                        onClick={() => setGatewayPage((p) => p + 1)}
                        className="inline-flex items-center px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "withdrawals" && (
            <div className="space-y-4">
              {withdrawals?.map((withdrawal) => (
                <div key={withdrawal.id} className="bg-gray-50 p-6 rounded-lg border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <h4 className="text-lg font-medium text-gray-900">{withdrawal.vendorName}</h4>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(withdrawal.status)}`}
                        >
                          {withdrawal.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Amount</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {cur}
                            {withdrawal.amount.toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Bank Account</p>
                          {withdrawal.bankDetails ? (
                            <>
                              <p className="text-sm text-gray-900">{withdrawal.bankDetails.accountName}</p>
                              <p className="text-sm text-gray-500">
                                {withdrawal.bankDetails.bankName} - ****
                                {withdrawal.bankDetails.accountNumber?.slice(-4) ?? "—"}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-gray-500">No bank account on file</p>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Requested</p>
                          <p className="text-sm text-gray-900">
                            {new Date(withdrawal.requestedAt).toLocaleDateString()}
                          </p>
                          <p className="text-sm text-gray-500">
                            {new Date(withdrawal.requestedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>

                      {withdrawal.rejectionReason && (
                        <div className="bg-red-50 border border-red-200 p-3 rounded mb-4">
                          <p className="text-sm text-red-800">
                            <strong>Rejection Reason:</strong> {withdrawal.rejectionReason}
                          </p>
                        </div>
                      )}

                      {(() => {
                        const meta = parseWithdrawalNotes(withdrawal.notes)
                        if (!meta.scheduledProcessDate && !meta.clearingBusinessDays && !meta.message) return null
                        return (
                          <div className="bg-amber-50 border border-amber-200 p-3 rounded mb-4">
                            <p className="text-sm font-semibold text-amber-900 mb-1">Clearing &amp; scheduling</p>
                            {meta.clearingBusinessDays != null && (
                              <p className="text-sm text-amber-900">
                                Business-day clearing window: {meta.clearingBusinessDays} days (weekends/holidays excluded).
                              </p>
                            )}
                            {meta.scheduledProcessDate && (
                              <p className="text-sm text-amber-900">
                                Earliest indicated payout date:{" "}
                                {new Date(meta.scheduledProcessDate).toLocaleString(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                })}
                              </p>
                            )}
                            {meta.message && <p className="text-xs text-amber-800 mt-1">{meta.message}</p>}
                          </div>
                        )
                      })()}
                    </div>

                    {withdrawal.status === "PENDING" && (
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleWithdrawalAction(withdrawal.id, "approve")}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleWithdrawalAction(withdrawal.id, "reject", "Insufficient documentation")}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-gray-500">
                  Page {withdrawPage} of {withdrawTotalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={withdrawPage <= 1}
                    onClick={() => setWithdrawPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={withdrawPage >= withdrawTotalPages}
                    onClick={() => setWithdrawPage((p) => p + 1)}
                    className="inline-flex items-center px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "disputes" && (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Payment Disputes</h3>
              <p className="text-gray-600 mb-4">Manage and resolve payment disputes and chargebacks</p>
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                View All Disputes
              </button>
            </div>
          )}

          {activeTab === "analytics" && (
            <div className="space-y-8">
              <p className="text-sm text-gray-500">
                Analytics use the selected date range ({dateRange}) and the same data as the stat cards above.
              </p>
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Volume over time (wallet vs gateway)</h3>
                <div className="h-72 w-full">
                  {stats?.timeSeries && stats.timeSeries.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={stats.timeSeries}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="walletVolume" name="Wallet (completed)" fill="#059669" stackId="a" />
                        <Bar dataKey="gatewayVolume" name="Gateway (paid)" fill="#2563eb" stackId="a" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-gray-500 text-sm py-12 text-center">No time-series data for this range.</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Wallet transactions by type</h3>
                  <div className="h-64">
                    {stats?.walletByType && stats.walletByType.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.walletByType}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                          <YAxis allowDecimals={false} />
                          <Tooltip />
                          <Bar dataKey="count" name="Count" fill="#0d9488" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-gray-500 text-sm text-center py-10">No wallet activity in range.</p>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Wallet volume by type</h3>
                  <div className="h-64">
                    {stats?.walletByType && stats.walletByType.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.walletByType}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="type" tick={{ fontSize: 10 }} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="volume" name={`Volume (${cur})`} fill="#7c3aed" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-gray-500 text-sm text-center py-10">No data.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Status breakdown (wallet)</h3>
                <div className="flex flex-wrap gap-3">
                  {(stats?.walletByStatus ?? []).map((s) => (
                    <div key={s.status} className="px-3 py-2 bg-white rounded-lg border text-sm">
                      <span className="font-medium text-gray-900">{s.status}</span>
                      <span className="text-gray-500 ml-2">{s.count}</span>
                    </div>
                  ))}
                  {!stats?.walletByStatus?.length && <p className="text-gray-500 text-sm">No rows in range.</p>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {walletDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Wallet transaction</h3>
              <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setWalletDetail(null)}>
                ✕
              </button>
            </div>
            <pre className="text-xs bg-gray-50 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(walletDetail, null, 2)}
            </pre>
            <p className="text-xs text-gray-500 mt-3">
              Use Retry / Cancel / Refund in the table for actions. Refund records a review flag on the row (no automatic
              payout).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
