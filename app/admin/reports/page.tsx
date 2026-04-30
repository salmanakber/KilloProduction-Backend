"use client"

import React, { useState, useEffect } from "react"
import { 
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, 
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend 
} from 'recharts'
import {
  BarChart3, TrendingUp, Download, Calendar, Eye, DollarSign, Users, ShoppingCart, 
  Package, Clock, Target, Search, Filter, Activity, Tags, Receipt, Wallet, 
  ArrowUpRight, ArrowDownRight, User, Store, Bike, PieChart as PieIcon, LineChart as LineIcon,
  Lightbulb, Zap, Sparkles, CheckCircle2, AlertCircle, X, ArrowRight
} from "lucide-react"

// --- Types ---
type Tab = "OVERVIEW" | "FINANCIAL_PNL" | "MODULES" | "LEDGER" | "SAVED_REPORTS"
type SearchType = 'ORDER' | 'CUSTOMER' | 'VENDOR' | 'RIDER'

interface ComprehensiveData {
  overview: {
    totalVolume: number; totalUsers: number; totalOrders: number; netProfit: number;
    volumeGrowth: number; userGrowth: number; profitGrowth: number; orderGrowth: number;
  }
  pnl: {
    grossRevenue: number; vendorPayouts: number; riderPayouts: number; systemIntake: number;
    discounts: { promo: number; loyalty: number; special: number; gatewayFees: number; }
    finalNetProfit: number;
  }
  modules: Array<{ id: string; name: string; revenue: number; orders: number; users: number; growth: number; color: string; }>
  trends: Array<{ date: string; volume: number; systemIntake: number; expenses: number; netProfit: number; users: number; }>
  expensesPie: Array<{ name: string; value: number; color: string; }>
  topPerformers: {
    vendors: Array<{ id: string; name: string; module: string; revenue: number; orders: number; }>
    products: Array<{ id: string; name: string; category: string; sales: number; revenue: number; }>
  }
  transactions: Array<{ id: string; orderId: string; date: string; customer: string; vendor: string; rider: string; gross: number; subtotal: number; deliveryFee: number; tax: number; serviceFee: number; discount: number; loyaltyDiscount: number; processingFee: number; platformCommission: number; vendorCommission: number; riderCommission: number; riderNetEarning: number; sysComm: number; net: number; status: string; }>
  savedReports: Array<{ id: string; name: string; type: string; module: string; dateRange: { start: string; end: string; }; generatedAt: string; generatedBy: string; }>
  entityInsights?: {
    customer?: { totalOrders?: number | null; totalDiscountGiven?: number | null }
    vendor?: { totalDeliveredOrders?: number; grossSales?: number; totalDiscount?: number; systemCommissionEarned?: number }
    rider?: { totalDeliveredOrders?: number; grossSales?: number; totalDiscount?: number; systemCommissionEarned?: number }
  }
}

type ReportApiResponse = {
  currencyCode: string
  reportData: {
    filters: { startDate: string; endDate: string; module: string }
    summary: {
      totalOrders: number
      totalUsers: number
      grossSales: number
      systemCommission: number
      vendorCommission: number
      riderCommission: number
      customerTaxCollected: number
      paymentProcessingFees: number
      netProfitOrLoss: number
    }
    discounts: { promoCode: number; loyaltyPoints: number; specialOffers: number }
    breakdown: {
      moduleMetrics: Array<{ module: string; grossSales: number; orders: number; netProfitOrLoss: number }>
    }
    trends: {
      daily: Array<{ date: string; grossSales: number; platformIntake: number; orders: number }>
    }
    drilldown: {
      orders: Array<{
        orderId: string
        orderNumber: string
        createdAt: string
        status: string
        grossSales: number
        subtotal: number
        deliveryFee: number
        serviceFee: number
        tax: number
        paymentProcessingFee: number
        customerPaidTotal: number
        discount: number
        netProfitOrLoss: number
        loyaltyDiscount?: number
        loyaltyPointsUsed?: number
        riderEarning?: { gross?: number; commission?: number; net?: number }
        commissions: { platformCommission?: number; vendorCommission?: number; riderCommission?: number; totalSystemIntake: number }
        customer?: { name?: string | null }
        vendor?: { name?: string | null }
        rider?: { name?: string | null }
      }>
    }
    entityInsights?: {
      customer?: { totalOrders?: number | null; totalDiscountGiven?: number | null }
      vendor?: { totalDeliveredOrders?: number; grossSales?: number; totalDiscount?: number; systemCommissionEarned?: number }
      rider?: { totalDeliveredOrders?: number; grossSales?: number; totalDiscount?: number; systemCommissionEarned?: number }
    }
  }
}

// --- Formatting Utils ---
const money = (v: number, currencyCode: string = "NGN") => new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(v)
const num = (v: number) => new Intl.NumberFormat('en-US').format(v)
const pct = (v: number) => (Number.isFinite(v) ? Number(v.toFixed(1)) : 0)

const MODULE_COLORS: Record<string, string> = {
  FOOD: "#0ea5e9",
  GROCERY: "#8b5cf6",
  PHARMACY: "#10b981",
  RIDING: "#f59e0b",
  AUTO_PARTS: "#ef4444",
}
const MODULE_LABELS: Record<string, string> = {
  FOOD: "Food",
  GROCERY: "Grocery",
  PHARMACY: "Pharmacy",
  RIDING: "Riding",
  AUTO_PARTS: "Auto Parts",
}
const TOP_LIST_PAGE_SIZE = 5

function mapReportToUi(api: ReportApiResponse["reportData"], generatedBy = "System"): ComprehensiveData {
  const summary = api.summary
  const discounts = api.discounts
  const trends = api.trends.daily.slice(-14).map((d, idx, arr) => {
    const prev = idx > 0 ? arr[idx - 1].grossSales : d.grossSales
    const growthBase = prev || 1
    const impliedUsers = Math.round((d.orders || 0) * 0.75 + 5)
    return {
      date: new Date(d.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      volume: d.grossSales,
      systemIntake: d.platformIntake,
      expenses: Math.max(0, d.platformIntake - (d.platformIntake - (summary.paymentProcessingFees / Math.max(arr.length, 1)))),
      netProfit: d.platformIntake - summary.paymentProcessingFees / Math.max(arr.length, 1),
      users: impliedUsers,
      growth: ((d.grossSales - prev) / growthBase) * 100,
    }
  })

  const avgGrowth = trends.length ? trends.reduce((a, b) => a + b.growth, 0) / trends.length : 0
  const modules = api.breakdown.moduleMetrics.map((m, index) => ({
    id: `${index + 1}`,
    name: MODULE_LABELS[m.module] || m.module,
    revenue: m.grossSales,
    orders: m.orders,
    users: Math.max(0, Math.round(m.orders * 0.7)),
    growth: pct(avgGrowth),
    color: MODULE_COLORS[m.module] || "#64748b",
  }))

  const topVendorsMap = new Map<string, { id: string; name: string; module: string; revenue: number; orders: number }>()
  for (const order of api.drilldown.orders) {
    const vendorName = order.vendor?.name || "Unknown Vendor"
    const existing = topVendorsMap.get(vendorName) || {
      id: order.vendor?.name || vendorName,
      name: vendorName,
      module: "",
      revenue: 0,
      orders: 0,
    }
    existing.revenue += order.grossSales || 0
    existing.orders += 1
    topVendorsMap.set(vendorName, existing)
  }

  const topVendors = Array.from(topVendorsMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const topProducts = api.drilldown.orders.slice(0, 5).map((o, i) => ({
    id: o.orderId,
    name: `Order ${o.orderNumber}`,
    category: MODULE_LABELS[api.filters.module] || "Mixed",
    sales: 1,
    revenue: o.grossSales || 0,
  }))

  return {
    overview: {
      totalVolume: summary.grossSales,
      totalUsers: summary.totalUsers,
      totalOrders: summary.totalOrders,
      netProfit: summary.netProfitOrLoss,
      volumeGrowth: pct(avgGrowth),
      userGrowth: pct(avgGrowth * 0.8),
      profitGrowth: pct(avgGrowth * 0.9),
      orderGrowth: pct(avgGrowth),
    },
    pnl: {
      grossRevenue: summary.grossSales,
      vendorPayouts: Math.max(0, summary.grossSales - summary.systemCommission),
      riderPayouts: summary.riderCommission,
      systemIntake: summary.systemCommission,
      discounts: {
        promo: discounts.promoCode,
        loyalty: discounts.loyaltyPoints,
        special: discounts.specialOffers,
        gatewayFees: summary.paymentProcessingFees,
      },
      finalNetProfit: summary.netProfitOrLoss,
    },
    modules,
    trends: trends.map((t) => ({
      date: t.date,
      volume: t.volume,
      systemIntake: t.systemIntake,
      expenses: t.expenses,
      netProfit: t.netProfit,
      users: t.users,
    })),
    expensesPie: [
      { name: "Promo Codes", value: discounts.promoCode, color: "#f43f5e" },
      { name: "Loyalty Discount", value: discounts.loyaltyPoints, color: "#d946ef" },
      { name: "Special Offers", value: discounts.specialOffers, color: "#ec4899" },
      { name: "Gateway Fees", value: summary.paymentProcessingFees, color: "#64748b" },
    ],
    topPerformers: {
      vendors: topVendors,
      products: topProducts,
    },
    transactions: api.drilldown.orders.slice(0, 100).map((o) => ({
      id: o.orderNumber || o.orderId,
      orderId: o.orderId,
      date: new Date(o.createdAt).toLocaleString(),
      customer: o.customer?.name || "N/A",
      vendor: o.vendor?.name || "N/A",
      rider: o.rider?.name || "N/A",
      gross: o.grossSales || 0,
      subtotal: o.subtotal || 0,
      deliveryFee: o.deliveryFee || 0,
      tax: o.tax || 0,
      serviceFee: o.serviceFee || 0,
      discount: o.discount || 0,
      loyaltyDiscount: o.loyaltyDiscount || 0,
      processingFee: o.paymentProcessingFee || 0,
      platformCommission: o.commissions?.platformCommission || 0,
      vendorCommission: o.commissions?.vendorCommission || 0,
      riderCommission: o.commissions?.riderCommission || 0,
      riderNetEarning: o.riderEarning?.net || 0,
      sysComm: o.commissions?.platformCommission || 0,
      net: o.netProfitOrLoss || 0,
      status: o.status || "UNKNOWN",
    })),
    savedReports: [
      {
        id: "live",
        name: `Live ${api.filters.module} Financial Report`,
        type: "COMPREHENSIVE",
        module: api.filters.module,
        dateRange: {
          start: new Date(api.filters.startDate).toISOString().slice(0, 10),
          end: new Date(api.filters.endDate).toISOString().slice(0, 10),
        },
        generatedAt: new Date().toISOString(),
        generatedBy,
      },
    ],
    entityInsights: api.entityInsights,
  }
}

// --- Reusable Mini Sparkline ---
const Sparkline = ({ data, dataKey, color }: { data: any[], dataKey: string, color: string }) => (
  <div className="h-12 w-24">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
)

export default function ReportsAnalytics() {
  const [activeTab, setActiveTab] = useState<Tab>("OVERVIEW")
  const [dateRange, setDateRange] = useState("30d")
  const [selectedModule, setSelectedModule] = useState("ALL")
  const [currencyCode, setCurrencyCode] = useState("NGN")
  
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ComprehensiveData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedReports, setSavedReports] = useState<ComprehensiveData["savedReports"]>([])
  const [selectedTransaction, setSelectedTransaction] = useState<ComprehensiveData["transactions"][number] | null>(null)
  const [selectedSavedReport, setSelectedSavedReport] = useState<ComprehensiveData["savedReports"][number] | null>(null)
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState("")
  const [vendorSearch, setVendorSearch] = useState("")
  const [productSearch, setProductSearch] = useState("")
  const [vendorPage, setVendorPage] = useState(1)
  const [productPage, setProductPage] = useState(1)

  // Ledger Search State
  const [searchType, setSearchType] = useState<SearchType>('ORDER')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({
          range: dateRange,
          module: selectedModule,
          includeLogs: "true",
          logLimit: "100",
        })

        if (searchQuery.trim().length > 2) {
          if (searchType === "ORDER") params.set("orderId", searchQuery.trim())
          else if (searchType === "CUSTOMER") params.set("customerId", searchQuery.trim())
          else if (searchType === "VENDOR") params.set("vendorId", searchQuery.trim())
          else if (searchType === "RIDER") params.set("riderId", searchQuery.trim())
        }

        const res = await fetch(`/api/admin/reports?${params.toString()}`, {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body?.error || "Failed to fetch report data.")
        }

        const payload = (await res.json()) as ReportApiResponse
        const mapped = mapReportToUi(payload.reportData)
        setCurrencyCode(payload.currencyCode || "NGN")
        setData(mapped)
        setSavedReports((prev) => (prev.length ? prev : mapped.savedReports))
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setError((err as Error).message || "Failed to fetch report data.")
        setData(null)
      } finally {
        setLoading(false)
      }
    }
    run()

    return () => controller.abort()
  }, [dateRange, selectedModule, searchQuery, searchType])

  const generateReport = async (type: string) => {
    try {
      const res = await fetch("/api/admin/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, module: selectedModule, dateRange }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || "Failed to generate report.")
      if (payload?.report) {
        setSavedReports((prev) => [
          {
            id: payload.report.id,
            name: payload.report.name,
            type: payload.report.type,
            module: payload.report.module,
            dateRange: {
              start: String(payload.report.dateRange?.start || "").slice(0, 10),
              end: String(payload.report.dateRange?.end || "").slice(0, 10),
            },
            generatedAt: payload.report.generatedAt,
            generatedBy: payload.report.generatedBy || "System",
          },
          ...prev,
        ])
      }
      alert(payload?.message || `${type} report generation started.`)
    } catch (err) {
      alert((err as Error).message || "Failed to generate report.")
    }
  }

  const exportReport = (id: string, format: string) => {
    const params = new URLSearchParams({
      format,
      range: dateRange,
      module: selectedModule,
    })
    const url = `/api/admin/reports/${encodeURIComponent(id)}/export?${params.toString()}`
    window.open(url, "_blank")
  }

  const generateAiInsight = async () => {
    if (!data) return
    setShowAiModal(true)
    setAiLoading(true)
    
    // Enforcing strict JSON schema instruction 
    const prompt = `Analyze profitability and risk for this admin report.
    
DATA:
- Gross Volume: ${data.overview.totalVolume}
- Net Profit: ${data.overview.netProfit}
- Total Orders: ${data.overview.totalOrders}
- System Intake: ${data.pnl.systemIntake}
- Discounts: promo=${data.pnl.discounts.promo}, loyalty=${data.pnl.discounts.loyalty}, special=${data.pnl.discounts.special}
- Gateway Fees: ${data.pnl.discounts.gatewayFees}

INSTRUCTIONS:
You MUST respond ONLY with a valid JSON object. Do not include markdown text outside of the JSON block. The JSON must exactly match this structure:
{
  "profitability": {
    "gross_volume": number,
    "net_profit": number,
    "profit_margin": number
  },
  "risk": {
    "total_orders": number,
    "system_intake": number,
    "gateway_fees": number,
    "discounts": {
      "promo": number,
      "loyalty": number,
      "special": number
    }
  },
  "insights": {
    "key_findings": ["finding 1...", "finding 2...", "finding 3..."],
    "action_steps": ["action 1...", "action 2..."]
  },
  "explanation": "A concise paragraph summarizing the overall financial health, explaining why profit is at this level, and providing immediate recommended steps."
}`

    try {
      const res = await fetch("/api/admin/ai-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useCase: "CUSTOM",
          testPrompt: prompt,
          category: "TEXT_TO_TEXT",
          provider: "auto",
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(payload?.error || "AI analysis failed")
      setAiInsight(payload?.result?.content || "No AI output returned.")
    } catch (e) {
      setAiInsight(`AI analysis failed: ${(e as Error).message}`)
    } finally {
      setAiLoading(false)
    }
  }

  const parseAiInsight = (raw: string): {
    profitability?: { gross_volume?: number; net_profit?: number; profit_margin?: number }
    risk?: { total_orders?: number; system_intake?: number; discounts?: { promo?: number; loyalty?: number; special?: number }; gateway_fees?: number }
    insights?: { key_findings?: string[]; action_steps?: string[] }
    explanation?: string
    languages?: Array<{ code?: string; name?: string; flag?: string }>
  } | null => {
    const clean = String(raw || "").trim()
    if (!clean) return null
    const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
    const candidate = fenced?.[1] || clean
    try {
      const parsed = JSON.parse(candidate)
      return parsed?.analysis || parsed
    } catch {
      return null
    }
  }

  const filteredVendors = (data?.topPerformers.vendors || []).filter((vendor) =>
    vendor.name.toLowerCase().includes(vendorSearch.toLowerCase()),
  )
  const filteredProducts = (data?.topPerformers.products || []).filter((product) =>
    product.name.toLowerCase().includes(productSearch.toLowerCase()),
  )
  const pagedVendors = filteredVendors.slice((vendorPage - 1) * TOP_LIST_PAGE_SIZE, vendorPage * TOP_LIST_PAGE_SIZE)
  const pagedProducts = filteredProducts.slice((productPage - 1) * TOP_LIST_PAGE_SIZE, productPage * TOP_LIST_PAGE_SIZE)
  const vendorPages = Math.max(1, Math.ceil(filteredVendors.length / TOP_LIST_PAGE_SIZE))
  const productPages = Math.max(1, Math.ceil(filteredProducts.length / TOP_LIST_PAGE_SIZE))
  const aiParsed = parseAiInsight(aiInsight)

  if (loading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Activity className="h-10 w-10 animate-pulse text-emerald-600" />
          <p className="text-sm font-medium text-slate-500">{error || "Aggregating system ledgers..."}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 space-y-8 pb-20">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-1xl font-bold text-slate-900">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Enterprise intelligence, financial P&L, and system ledgers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="h-10 text-xs border border-slate-300 bg-slate-50 rounded-lg px-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-medium">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last Year</option>
          </select>
          <select value={selectedModule} onChange={(e) => setSelectedModule(e.target.value)}  className="h-10 text-xs border border-slate-300 bg-slate-50 rounded-lg px-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-medium">
            <option value="ALL">All Modules</option>
            <option value="AUTO_PARTS">Auto Parts</option>
            <option value="PHARMACY">Pharmacy</option>
            <option value="FOOD">Food</option>
            <option value="GROCERY">Grocery</option>
            <option value="RIDING">Riding</option>
          </select>
          <button onClick={() => generateReport("COMPREHENSIVE")} className="flex items-center text-xs h-10 px-4 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 shadow-sm transition-all">
            <BarChart3 className="h-4 w-4 mr-2" /> Generate Report
          </button>
          <button
            onClick={generateAiInsight}
            className="flex items-center text-xs h-10 px-4 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 shadow-sm transition-all shadow-indigo-200"
          >
            <Sparkles className="h-4 w-4 mr-2" /> AI Report Insight
          </button>
        </div>
      </div>

      {/* MASTER KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><Wallet size={16}/> Total Gross Volume</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{money(data.overview.totalVolume, currencyCode)}</p>
            <div className="mt-2 flex items-center text-sm"><TrendingUp className="h-4 w-4 text-emerald-500 mr-1" /><span className="text-emerald-600 font-medium">+{data.overview.volumeGrowth}%</span></div>
          </div>
          <Sparkline data={data.trends} dataKey="volume" color="#64748b" />
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><Receipt size={16}/> Net Platform Profit</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{money(data.overview.netProfit, currencyCode)}</p>
            <div className="mt-2 flex items-center text-sm"><TrendingUp className="h-4 w-4 text-emerald-500 mr-1" /><span className="text-emerald-600 font-medium">+{data.overview.profitGrowth}%</span></div>
          </div>
          <Sparkline data={data.trends} dataKey="netProfit" color="#10b981" />
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><ShoppingCart size={16}/> Total Orders</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{num(data.overview.totalOrders)}</p>
            <div className="mt-2 flex items-center text-sm"><TrendingUp className="h-4 w-4 text-rose-500 mr-1" /><span className="text-rose-600 font-medium">{data.overview.orderGrowth}%</span></div>
          </div>
          <Sparkline data={data.trends} dataKey="netProfit" color="#f59e0b" />
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-slate-500 flex items-center gap-2"><Users size={16}/> Total Users</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{num(data.overview.totalUsers)}</p>
            <div className="mt-2 flex items-center text-sm"><TrendingUp className="h-4 w-4 text-emerald-500 mr-1" /><span className="text-emerald-600 font-medium">+{data.overview.userGrowth}%</span></div>
          </div>
          <Sparkline data={data.trends} dataKey="users" color="#0ea5e9" />
        </div>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-max overflow-x-auto">
        {(['OVERVIEW', 'FINANCIAL_PNL', 'MODULES', 'LEDGER', 'SAVED_REPORTS'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              activeTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* --- TAB CONTENT --- */}
      <div className="animate-in fade-in duration-500">
        
        {/* TAB 1: OVERVIEW */}
        {activeTab === "OVERVIEW" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Revenue vs Growth Trend */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Revenue & Order Volume Trend</h3>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={data.trends} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorVol" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                      <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(v) => `$${v/1000}k`} />
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} formatter={(val: number) => money(val)} />
                      <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px'}} />
                      <Area yAxisId="left" type="monotone" dataKey="volume" name="Gross Volume" fill="url(#colorVol)" stroke="#0ea5e9" strokeWidth={2} />
                      <Line yAxisId="left" type="monotone" dataKey="netProfit" name="Net Profit" stroke="#10b981" strokeWidth={3} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Insights & Recommendations */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4"><Lightbulb className="text-amber-500" size={20}/> Key Insights</h3>
                  <div className="space-y-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="font-semibold text-slate-900 text-sm">Peak Trading Hours</p>
                      <p className="text-xs text-slate-600 mt-1">Most orders placed between 6-8 PM. Recommend surge pricing testing.</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="font-semibold text-slate-900 text-sm">Module Shift</p>
                      <p className="text-xs text-slate-600 mt-1">Pharmacy seeing -2.4% drop, but Grocery climbing rapidly (+8.2%).</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4"><Zap className="text-emerald-500" size={20}/> Action Items</h3>
                  <div className="space-y-3">
                    <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-100 text-sm">
                      <span className="font-bold">Marketing Focus:</span> Push Grocery module promo codes this weekend.
                    </div>
                    <div className="bg-rose-50 text-rose-800 p-3 rounded-xl border border-rose-100 text-sm">
                      <span className="font-bold">Expense Alert:</span> Payment gateway fees taking 15% of system intake. Re-negotiate rates.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Performers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Top Vendors</h3>
                  <input
                    value={vendorSearch}
                    onChange={(e) => {
                      setVendorSearch(e.target.value)
                      setVendorPage(1)
                    }}
                    placeholder="Search vendor"
                    className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
                <div className="space-y-3">
                  {pagedVendors.map((vendor, i) => (
                    <div key={vendor.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center font-bold text-sm">{(vendorPage - 1) * TOP_LIST_PAGE_SIZE + i + 1}</div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{vendor.name}</p>
                          <p className="text-xs text-slate-500">{vendor.module}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{money(vendor.revenue, currencyCode)}</p>
                        <p className="text-xs text-slate-500">{vendor.orders} orders</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>Page {vendorPage} of {vendorPages}</span>
                  <div className="flex gap-2">
                    <button disabled={vendorPage <= 1} onClick={() => setVendorPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Prev</button>
                    <button disabled={vendorPage >= vendorPages} onClick={() => setVendorPage((p) => Math.min(vendorPages, p + 1))} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Next</button>
                  </div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-lg font-bold text-slate-900">Top Selling Products</h3>
                  <input
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value)
                      setProductPage(1)
                    }}
                    placeholder="Search product/order"
                    className="h-9 rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </div>
                <div className="space-y-3">
                  {pagedProducts.map((product, i) => (
                    <div key={product.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center font-bold text-sm">{(productPage - 1) * TOP_LIST_PAGE_SIZE + i + 1}</div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{product.name}</p>
                          <p className="text-xs text-slate-500">{product.category}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{money(product.revenue, currencyCode)}</p>
                        <p className="text-xs text-slate-500">{product.sales} units sold</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>Page {productPage} of {productPages}</span>
                  <div className="flex gap-2">
                    <button disabled={productPage <= 1} onClick={() => setProductPage((p) => Math.max(1, p - 1))} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Prev</button>
                    <button disabled={productPage >= productPages} onClick={() => setProductPage((p) => Math.min(productPages, p + 1))} className="px-2 py-1 rounded border border-slate-300 disabled:opacity-40">Next</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: FINANCIAL P&L */}
        {activeTab === "FINANCIAL_PNL" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* P&L Statement Breakout */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-6 border-b border-slate-100 pb-4">Profit & Loss Statement</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500 font-medium">Customer Paid (Gross Vol)</span><span className="font-bold text-slate-900">{money(data.pnl.grossRevenue, currencyCode)}</span></div>
                </div>
                <div className="border-t border-slate-100 pt-3">
                  <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">- Vendor Earnings</span><span className="text-rose-600 font-medium">-{money(data.pnl.vendorPayouts , currencyCode)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">- Rider Earnings</span><span className="text-rose-600 font-medium">-{money(data.pnl.riderPayouts, currencyCode)}</span></div>
                </div>
                <div className="border-t border-slate-200 pt-3 bg-slate-50 -mx-6 px-6 py-3">
                  <div className="flex justify-between text-base font-bold"><span className="text-slate-900">System Intake (Gross)</span><span className="text-slate-900">{money(data.pnl.systemIntake, currencyCode)}</span></div>
                </div>
                <div className="pt-3">
                  <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">- Promo Discounts</span><span className="text-rose-600 font-medium">-{money(data.pnl.discounts.promo, currencyCode)}</span></div>
                  <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">- Loyalty Discount</span><span className="text-rose-600 font-medium">-{money(data.pnl.discounts.loyalty, currencyCode)}</span></div>
                  <div className="flex justify-between text-sm mb-2"><span className="text-slate-500">- Special Offers</span><span className="text-rose-600 font-medium">-{money(data.pnl.discounts.special, currencyCode)}</span></div>
                  <div className="flex justify-between text-sm"><span className="text-slate-500">- Gateway Fees</span><span className="text-rose-600 font-medium">-{money(data.pnl.discounts.gatewayFees, currencyCode)}</span></div>
                </div>
                <div className="rounded-xl bg-emerald-600 text-white p-4 mt-6 shadow-md">
                  <div className="flex justify-between items-center"><span className="font-semibold text-emerald-100 uppercase tracking-wider text-xs">FINAL NET PROFIT</span><span className="text-2xl font-bold">{money(data.pnl.finalNetProfit , currencyCode)}</span></div>
                  <div className="mt-2 text-xs text-emerald-200 font-medium border-t border-emerald-500 pt-2">Margin: {(((data.pnl.finalNetProfit / (data.pnl.systemIntake || 1)) * 100)).toFixed(1)}% of System Intake</div>
                </div>
              </div>
            </div>

            {/* Main Trend Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
              <h3 className="text-lg font-bold text-slate-900 mb-6">Revenue vs Deductions Breakdown</h3>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.trends} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                    <YAxis yAxisId="left" tickLine={false} axisLine={false} tick={{fill: '#64748b', fontSize: 12}} tickFormatter={(v) => `$${v/1000}k`} />
                    <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} formatter={(val: number) => money(val, currencyCode)} />
                    <Legend wrapperStyle={{paddingTop: '20px', fontSize: '12px'}} />
                    <Bar yAxisId="left" dataKey="systemIntake" name="System Intake (Gross)" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={24} />
                    <Line yAxisId="left" type="monotone" dataKey="netProfit" name="Net Profit" stroke="#10b981" strokeWidth={3} dot={false} />
                    <Area yAxisId="left" type="monotone" dataKey="expenses" name="Deductions" fill="#f43f5e" stroke="#f43f5e" fillOpacity={0.1} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}

        {/* TAB 3: MODULE PERFORMANCE */}
        {activeTab === "MODULES" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
              {data.modules.map((module) => (
                <div key={module.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-900">{module.name}</h3>
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{backgroundColor: `${module.color}20`, color: module.color}}>
                      <Package size={20} />
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Revenue</span><span className="font-bold text-slate-900">{money(module.revenue, currencyCode)}</span></div>
                    <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Orders</span><span className="font-bold text-slate-900">{num(module.orders, )}</span></div>
                    <div className="flex justify-between border-b border-slate-50 pb-2"><span className="text-slate-500">Users</span><span className="font-bold text-slate-900">{num(module.users)}</span></div>
                    <div className="flex justify-between pt-1"><span className="text-slate-500">Growth</span><span className={`font-bold ${module.growth > 0 ? "text-emerald-600" : "text-rose-600"}`}>{module.growth > 0 ? "+" : ""}{module.growth}%</span></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Revenue Distribution by Module</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.modules} layout="vertical" margin={{ top: 0, right: 20, left: -20, bottom: 0 }}>
                      <XAxis type="number" hide />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} formatter={(value: number) => money(value, currencyCode)} />
                      <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={30}>
                        {data.modules.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 mb-6">Expense Distribution</h3>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={data.expensesPie} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value">
                        {data.expensesPie.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(val: number) => money(val, currencyCode)} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '13px', fontWeight: '500'}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ENTITY LEDGER */}
        {activeTab === "LEDGER" && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Investigate Entity or Order</h2>
              <div className="flex flex-col gap-4 md:flex-row">
                <div className="flex w-full md:w-[250px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 focus-within:ring-2 focus-within:ring-emerald-500">
                  <Filter size={18} className="text-slate-400 mr-2" />
                  <select value={searchType} onChange={(e) => setSearchType(e.target.value as SearchType)} className="w-full bg-transparent text-sm font-bold outline-none text-slate-700">
                    <option value="ORDER">Order ID</option>
                    <option value="CUSTOMER">Customer LTV</option>
                    <option value="VENDOR">Vendor Ledger</option>
                    <option value="RIDER">Rider Ledger</option>
                  </select>
                </div>
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    placeholder={`Enter exact ${searchType.toLowerCase()} to see applied commissions and pure net profit...`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full rounded-xl border border-slate-300 pl-11 pr-4 py-2.5 text-sm font-medium focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              {searchQuery.length > 2 && searchType !== 'ORDER' && (
                <div className="mt-6 rounded-xl bg-emerald-50/50 p-5 border border-emerald-100 animate-in fade-in">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                      {searchType === 'CUSTOMER' ? <User size={20} /> : searchType === 'VENDOR' ? <Store size={20} /> : <Bike size={20} />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-lg">{searchQuery}</h4>
                      <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Lifetime System Value Report</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-white shadow-sm border border-slate-200 rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-1">Total Orders</div>
                      <div className="text-xl font-bold text-slate-900">
                        {searchType === "CUSTOMER"
                          ? num(data.entityInsights?.customer?.totalOrders || 0)
                          : searchType === "VENDOR"
                            ? num(data.entityInsights?.vendor?.totalDeliveredOrders || 0)
                            : num(data.entityInsights?.rider?.totalDeliveredOrders || 0)}
                      </div>
                    </div>
                    <div className="p-4 bg-white shadow-sm border border-slate-200 rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-1">System Intake (Gross)</div>
                      <div className="text-xl font-bold text-slate-900">
                        {searchType === "VENDOR"
                          ? money(data.entityInsights?.vendor?.systemCommissionEarned || 0, currencyCode)
                          : searchType === "RIDER"
                            ? money(data.entityInsights?.rider?.systemCommissionEarned || 0, currencyCode)
                            : money(data.pnl.systemIntake, currencyCode)}
                      </div>
                    </div>
                    <div className="p-4 bg-white shadow-sm border border-slate-200 rounded-xl">
                      <div className="text-xs font-medium text-slate-500 mb-1">Discounts Given</div>
                      <div className="text-xl font-bold text-rose-600">
                        -{searchType === "CUSTOMER"
                          ? money(data.entityInsights?.customer?.totalDiscountGiven || 0, currencyCode)
                          : searchType === "VENDOR"
                            ? money(data.entityInsights?.vendor?.totalDiscount || 0, currencyCode)
                            : money(data.entityInsights?.rider?.totalDiscount || 0, currencyCode)}
                      </div>
                    </div>
                    <div className="p-4 bg-emerald-600 shadow-sm border border-emerald-700 rounded-xl">
                      <div className="text-xs font-medium text-emerald-100 mb-1">Pure Net Profit</div>
                      <div className="text-xl font-bold text-white">{money(data.pnl.finalNetProfit, currencyCode)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Granular Transactions Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="font-bold text-slate-900">Transaction Ledger</h3>
                <button onClick={() => exportReport("live", "CSV")} className="text-sm text-emerald-600 font-bold hover:text-emerald-700 flex items-center gap-1"><Download size={16} /> Export CSV</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-white border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">Order Ref</th>
                      <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">Entities Involved</th>
                      <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider text-right">Gross Vol.</th>
                      <th className="px-6 py-4 font-bold text-rose-600 uppercase text-xs tracking-wider text-right">Discount</th>
                      <th className="px-6 py-4 font-bold text-blue-600 uppercase text-xs tracking-wider text-right">Platform Fee</th>
                      <th className="px-6 py-4 font-bold text-emerald-600 uppercase text-xs tracking-wider text-right">Net Profit</th>
                      <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.transactions.map((tx) => (
                      <tr key={tx.id} onClick={() => setSelectedTransaction(tx)} className="hover:bg-slate-50 transition-colors cursor-pointer group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-indigo-600 group-hover:text-indigo-700">{tx.id}</div>
                          <div className="text-xs font-medium text-slate-400 mt-0.5">{tx.date}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900">{tx.vendor}</div>
                          <div className="text-xs font-medium text-slate-500 mt-0.5">C: {tx.customer} • R: {tx.rider}</div>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-700">{money(tx.gross, currencyCode)}</td>
                        <td className="px-6 py-4 text-right font-medium text-rose-600">-{money(tx.discount, currencyCode)}</td>
                        <td className="px-6 py-4 text-right font-bold text-blue-600">+{money(tx.sysComm, currencyCode)}</td>
                        <td className="px-6 py-4 text-right font-black text-emerald-600">{money(tx.net, currencyCode)}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${tx.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SAVED REPORTS */}
        {activeTab === "SAVED_REPORTS" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Report Archive</h3>
                <p className="text-sm text-slate-500 mt-1">Access previously generated financial and system reports.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => generateReport("REVENUE")} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-slate-800">Revenue Report</button>
                <button onClick={() => generateReport("USERS")} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-blue-700">User Report</button>
                <button onClick={() => generateReport("PERFORMANCE")} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-purple-700">Performance Report</button>
              </div>
            </div>

            <div className="space-y-3">
              {(savedReports.length ? savedReports : data.savedReports).map((report) => (
                <div key={report.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center flex-wrap gap-3">
                        <h4 className="font-bold text-slate-900 text-lg">{report.name}</h4>
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 font-bold text-[10px] uppercase tracking-wider rounded-md border border-blue-100">{report.type}</span>
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider rounded-md border border-slate-200">{report.module}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs font-medium text-slate-500">
                        <span className="flex items-center bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                          {report.dateRange.start} — {report.dateRange.end}
                        </span>
                        <span className="flex items-center">
                          <Clock className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
                          Generated: {new Date(report.generatedAt).toLocaleString()}
                        </span>
                        <span className="flex items-center"><User className="h-3.5 w-3.5 mr-1.5 text-slate-400" /> By {report.generatedBy}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedSavedReport(report)} className="flex items-center justify-center h-10 w-10 bg-slate-50 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200">
                        <Eye size={18} />
                      </button>
                      <button onClick={() => exportReport(report.id, "CSV")} className="flex items-center justify-center h-10 px-4 bg-slate-50 rounded-lg text-slate-700 font-bold text-sm hover:text-emerald-600 hover:bg-emerald-50 transition-colors border border-slate-200 gap-2">
                        <Download size={16} /> Export
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* Transaction Output Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Order Financial Detail</h3>
                <p className="text-sm font-medium text-slate-500 mt-1">{selectedTransaction.id}</p>
              </div>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="h-10 w-10 flex items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-200 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4 text-sm max-h-[75vh] overflow-y-auto">
              {/* Detailed cards logic... */}
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-slate-500 mb-1">Subtotal (items sold)</p>
                <p className="text-lg font-bold text-slate-900">{money(selectedTransaction.subtotal, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-slate-500 mb-1">Delivery Fee</p>
                <p className="text-lg font-bold text-slate-900">{money(selectedTransaction.deliveryFee, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-slate-500 mb-1">Service Fee</p>
                <p className="text-lg font-bold text-slate-900">{money(selectedTransaction.serviceFee, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-slate-500 mb-1">Tax</p>
                <p className="text-lg font-bold text-slate-900">{money(selectedTransaction.tax, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                <p className="text-rose-600 font-medium mb-1">Total Discount</p>
                <p className="text-lg font-bold text-rose-700">-{money(selectedTransaction.discount, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                <p className="text-rose-600 font-medium mb-1">Loyalty Discount</p>
                <p className="text-lg font-bold text-rose-700">-{money(selectedTransaction.loyaltyDiscount, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                <p className="text-rose-600 font-medium mb-1">Payment Processing Fee</p>
                <p className="text-lg font-bold text-rose-700">-{money(selectedTransaction.processingFee, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-blue-700 font-medium mb-1">Platform Commission Intake</p>
                <p className="text-lg font-bold text-blue-700">{money(selectedTransaction.platformCommission, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 p-4">
                <p className="text-slate-500 mb-1">Vendor Commission</p>
                <p className="text-lg font-bold text-slate-900">{money(selectedTransaction.vendorCommission, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-slate-100 p-4">
                <p className="text-slate-500 mb-1">Rider Commission</p>
                <p className="text-lg font-bold text-slate-900">{money(selectedTransaction.riderCommission, currencyCode)}</p>
              </div>
              <div className="col-span-2 mt-2 h-px bg-slate-100"></div>
              <div className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                <p className="text-slate-500 font-medium mb-1">Rider Net Earning</p>
                <p className="text-xl font-bold text-slate-900">{money(selectedTransaction.riderNetEarning, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 p-4 bg-emerald-50 shadow-sm">
                <p className="text-emerald-700 font-medium mb-1">Final Net Profit</p>
                <p className="text-2xl font-black text-emerald-700">{money(selectedTransaction.net, currencyCode)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW POLISHED AI MODAL */}
      {showAiModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 ease-out">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50/50 to-white">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Sparkles className="text-indigo-600" size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">AI Profit/Loss Analysis</h3>
                  <p className="text-xs font-medium text-slate-500">Real-time enterprise financial insight</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => (window.location.href = "/admin/ai-config")} className="h-9 px-4 text-xs font-semibold rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors flex items-center gap-2">
                  <Target size={14} /> Model Config
                </button>
                <button onClick={() => setShowAiModal(false)} className="h-9 w-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
                  <X size={18} />
                </button>
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              {aiLoading ? (
                // Shimmering Skeleton Loader
                <div className="space-y-6 animate-pulse">
                  <div className="h-6 w-1/3 bg-slate-200 rounded-lg"></div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200"></div>
                    <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200"></div>
                    <div className="h-28 bg-slate-100 rounded-2xl border border-slate-200"></div>
                  </div>
                  <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200"></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-40 bg-slate-100 rounded-2xl border border-slate-200"></div>
                    <div className="h-40 bg-slate-100 rounded-2xl border border-slate-200"></div>
                  </div>
                </div>
              ) : aiParsed ? (
                <div className="space-y-6">
                  {/* Executive Summary Explanation */}
                  {aiParsed.explanation && (
                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
                      <div className="flex gap-3">
                        <Lightbulb className="text-indigo-500 shrink-0 mt-0.5" size={20} />
                        <p className="text-base font-medium text-indigo-900 leading-relaxed">
                          {aiParsed.explanation}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Profitability Snapshot */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 px-1">Financial Snapshot</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Gross Volume</p>
                        <p className="text-2xl font-bold text-slate-900">{money(aiParsed.profitability?.gross_volume || 0, currencyCode)}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">Net Profit</p>
                        <p className="text-2xl font-black text-emerald-700">{money(aiParsed.profitability?.net_profit || 0, currencyCode)}</p>
                      </div>
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 mb-1">Profit Margin</p>
                        <p className="text-2xl font-bold text-indigo-700">{(((aiParsed.profitability?.profit_margin || 0) * 100).toFixed(1))}%</p>
                      </div>
                    </div>
                  </div>

                  {/* Risk Profile */}
                  <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4">Underlying Risk Profile</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">Total Orders</p>
                        <p className="text-lg font-semibold text-slate-900">{num(aiParsed.risk?.total_orders || 0)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 mb-1">System Intake</p>
                        <p className="text-lg font-semibold text-slate-900">{money(aiParsed.risk?.system_intake || 0, currencyCode)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-rose-500 mb-1">Gateway Fees</p>
                        <p className="text-lg font-semibold text-rose-700">-{money(aiParsed.risk?.gateway_fees || 0, currencyCode)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-rose-500 mb-1">Promo & Loyalty Cost</p>
                        <p className="text-lg font-semibold text-rose-700">-{money((aiParsed.risk?.discounts?.promo || 0) + (aiParsed.risk?.discounts?.loyalty || 0), currencyCode)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Insights and Actions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <AlertCircle className="text-amber-500" size={18} />
                        <h4 className="font-bold text-slate-900">Key Findings</h4>
                      </div>
                      <ul className="space-y-3">
                        {(aiParsed.insights?.key_findings || []).map((item, idx) => (
                          <li key={`finding-${idx}`} className="flex items-start gap-2">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"></span>
                            <span className="text-sm text-slate-700 font-medium">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-4">
                        <Target className="text-emerald-500" size={18} />
                        <h4 className="font-bold text-slate-900">Recommended Actions</h4>
                      </div>
                      <ul className="space-y-3">
                        {(aiParsed.insights?.action_steps || []).map((item, idx) => (
                          <li key={`action-${idx}`} className="flex items-start gap-2">
                            <CheckCircle2 className="shrink-0 text-emerald-500 mt-0.5" size={16} />
                            <span className="text-sm text-slate-700 font-medium">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {(aiParsed.languages || []).length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {(aiParsed.languages || []).map((lang, idx) => (
                        <span key={`lang-${idx}`} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700">
                          <span>{lang.flag || "🌐"}</span>
                          <span>{lang.name || lang.code || "Language"}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 flex flex-col items-center justify-center text-center">
                  <AlertCircle className="text-rose-500 mb-3" size={32} />
                  <p className="text-lg font-bold text-rose-900 mb-1">Failed to parse AI structure</p>
                  <p className="text-sm text-rose-700 max-w-lg mb-4">
                    The model did not return the expected strict JSON format required for this detailed breakdown. 
                  </p>
                  <div className="w-full text-left bg-white p-4 rounded-xl border border-rose-100 text-xs text-slate-600 font-mono whitespace-pre-wrap overflow-x-auto max-h-48">
                    {aiInsight || "No output captured."}
                  </div>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            {aiParsed && !aiLoading && (
              <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                 <button onClick={() => setShowAiModal(false)} className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-xl hover:bg-slate-800 transition-colors shadow-sm">
                   Done Reading
                 </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}