"use client"

import { useState, useEffect } from "react"
import { 
  DollarSign, 
  TrendingUp, 
  Edit, 
  Save, 
  X, 
  Plus, 
  BarChart3, 
  RefreshCw,
  ShoppingBag,
  Utensils,
  Pill,
  Wrench,
  Bike,
  Package,
  Layers,
  Percent,
  CreditCard,
  Store,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  TrendingDown,
  Activity
} from "lucide-react"
import { formatCompact } from "../../../lib/moneyFormat"
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from "recharts"

interface CommissionSetting {
  id: string
  module: "AUTO_PARTS" | "PHARMACY" | "FOOD" | "GROCERY" | "RIDING" | "COURIER" | "WHOLESALER" | "CUSTOMER" | "WALLET"
  commissionType: "VENDOR_COMMISSION" | "RIDER_COMMISSION" | "PLATFORM_FEE" | "PAYMENT_PROCESSING" | "MECHANIC_COMMISSION" | "CUSTOMER_TAX" | "MECHANIC_TAX"
  rate: number
  minAmount?: number
  maxAmount?: number
  isActive: boolean
  description?: string
  createdAt: string
  updatedAt: string
}

interface CommissionBreakdownRow {
  commissionType: string
  status: string
  amount: number
  count: number
}

interface CommissionStats {
  totalCommission: number
  pendingCommission: number
  paidCommission: number
  monthlyGrowth: number
  topEarners: {
    vendorId: string
    vendorName: string
    commission: number
    orders: number
  }[]
  vendorCommissionBreakdown?: CommissionBreakdownRow[]
  riderCommissionBreakdown?: CommissionBreakdownRow[]
  // Added for the chart (if your API returns this in the future)
  revenueTrend?: { month: string; amount: number }[]
}

// Module Icons & Colors Helper
const getModuleConfig = (module: string) => {
  switch (module) {
    case "PHARMACY": return { icon: <Pill className="h-4 w-4" />, color: "bg-emerald-100 text-emerald-700 border-emerald-200", label: "Pharmacy" }
    case "FOOD": return { icon: <Utensils className="h-4 w-4" />, color: "bg-orange-100 text-orange-700 border-orange-200", label: "Food" }
    case "GROCERY": return { icon: <ShoppingBag className="h-4 w-4" />, color: "bg-purple-100 text-purple-700 border-purple-200", label: "Grocery" }
    case "AUTO_PARTS": return { icon: <Wrench className="h-4 w-4" />, color: "bg-blue-100 text-blue-700 border-blue-200", label: "Auto Parts" }
    case "RIDING": return { icon: <Bike className="h-4 w-4" />, color: "bg-red-100 text-red-700 border-red-200", label: "Ride Hailing" }
    case "COURIER": return { icon: <Package className="h-4 w-4" />, color: "bg-indigo-100 text-indigo-700 border-indigo-200", label: "Courier" }
    default: return { icon: <Layers className="h-4 w-4" />, color: "bg-gray-100 text-gray-700 border-gray-200", label: module.replace("_", " ") }
  }
}

const getTypeConfig = (type: string) => {
  switch (type) {
    case "VENDOR_COMMISSION": return { icon: <Store className="h-3 w-3" />, label: "Vendor Commission" }
    case "RIDER_COMMISSION": return { icon: <Bike className="h-3 w-3" />, label: "Rider Commission" }
    case "PLATFORM_FEE": return { icon: <Layers className="h-3 w-3" />, label: "Platform Fee" }
    case "PAYMENT_PROCESSING": return { icon: <CreditCard className="h-3 w-3" />, label: "Processing Fee" }
    default: return { icon: <Percent className="h-3 w-3" />, label: type.replace("_", " ") }
  }
}

// Fallback Mock Data for the Chart to showcase the UI
const MOCK_CHART_DATA = [
  { month: "Jan", amount: 12500 },
  { month: "Feb", amount: 15000 },
  { month: "Mar", amount: 14200 },
  { month: "Apr", amount: 18500 },
  { month: "May", amount: 22000 },
  { month: "Jun", amount: 28400 },
  { month: "Jul", amount: 31000 },
]

export default function CommissionManagement() {
  const [commissionSettings, setCommissionSettings] = useState<CommissionSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currency, setCurrency] = useState<string>("₦")

  const getCurrency = async () => {
    const currency = await fetch('/api/currencies').then(res => res.json()).then(data => data.defaultCurrency).catch(err => {
      console.error('Error fetching default currency:', err)
      return null
    })
    setCurrency(currency?.symbol || '₦')
  }

  useEffect(() => {
    void getCurrency()
  }, [])

  const moneyFormat = (amount: number) => {
    return `${currency}${formatCompact(amount) || 0}`
  }

  const [stats, setStats] = useState<CommissionStats>({
    totalCommission: 0,
    pendingCommission: 0,
    paidCommission: 0,
    monthlyGrowth: 0,
    topEarners: [],
    vendorCommissionBreakdown: [],
    riderCommissionBreakdown: [],
  })

  // Unified Form State for Create & Edit
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Partial<CommissionSetting>>({
    module: "PHARMACY",
    commissionType: "VENDOR_COMMISSION",
    rate: 0,
    minAmount: 0,
    maxAmount: 0,
    isActive: true,
    description: ""
  })

  /** Checkout primary gateway (system_settings.paymentMethods.primaryGateway) */
  const [gatewayState, setGatewayState] = useState<{
    primaryGateway: string
    fallbackGateway: string | null
    storedPrimaryGateway: string | null
    configuredGatewayIds: string[]
    currency: string
  } | null>(null)
  const [primaryGatewayDraft, setPrimaryGatewayDraft] = useState<string>("STRIPE")
  const [gatewaySaving, setGatewaySaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    await Promise.all([fetchCommissionSettings(), fetchCommissionStats(), fetchGatewaySettings()])
    setLoading(false)
  }

  const fetchGatewaySettings = async () => {
    try {
      const response = await fetch("/api/admin/payment-gateway")
      if (!response.ok) return
      const data = await response.json()
      setGatewayState({
        primaryGateway: data.primaryGateway,
        fallbackGateway: data.fallbackGateway ?? null,
        storedPrimaryGateway: data.storedPrimaryGateway ?? null,
        configuredGatewayIds: data.configuredGatewayIds ?? [],
        currency: data.currency ?? "NGN",
      })
      const stored = data.storedPrimaryGateway || data.primaryGateway
      if (typeof stored === "string" && stored) {
        setPrimaryGatewayDraft(stored)
      }
    } catch (error) {
      console.error("Error fetching payment gateway settings:", error)
    }
  }

  const handleSavePrimaryGateway = async () => {
    try {
      setGatewaySaving(true)
      const response = await fetch("/api/admin/payment-gateway", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryGateway: primaryGatewayDraft }),
      })
      if (response.ok) {
        const data = await response.json()
        setGatewayState((prev) =>
          prev
            ? {
                ...prev,
                primaryGateway: data.primaryGateway,
                fallbackGateway: data.fallbackGateway ?? null,
                storedPrimaryGateway: data.storedPrimaryGateway ?? primaryGatewayDraft,
                configuredGatewayIds: data.configuredGatewayIds ?? prev.configuredGatewayIds,
              }
            : null
        )
      }
    } catch (error) {
      console.error("Error saving payment gateway:", error)
    } finally {
      setGatewaySaving(false)
    }
  }

  const fetchCommissionSettings = async () => {
    try {
      const response = await fetch('/api/admin/commission')
      if (response.ok) {
        const data = await response.json()
        setCommissionSettings(data.commissionSettings)
      }
    } catch (error) {
      console.error('Error fetching commission settings:', error)
    }
  }

  const fetchCommissionStats = async () => {
    try {
      const response = await fetch('/api/admin/commission/stats')
      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const handleOpenModal = (setting?: CommissionSetting) => {
    if (setting) {
      setEditingId(setting.id)
      setFormData({ ...setting })
    } else {
      setEditingId(null)
      setFormData({
        module: "PHARMACY",
        commissionType: "VENDOR_COMMISSION",
        rate: 0,
        minAmount: 0,
        maxAmount: 0,
        isActive: true,
        description: ""
      })
    }
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const url = '/api/admin/commission'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { id: editingId, ...formData } : formData

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        await fetchCommissionSettings()
        setIsModalOpen(false)
      }
    } catch (error) {
      console.error('Error saving:', error)
    } finally {
      setSaving(false)
    }
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white/95 backdrop-blur-md border border-gray-100 p-4 rounded-xl shadow-xl">
          <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">{label}</p>
          <p className="text-xl font-bold text-[#2E8B57]">
            {moneyFormat(payload[0].value)}
          </p>
        </div>
      )
    }
    return null
  }

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-[#F9FAFB]">
        <div className="relative">
          <div className="absolute inset-0 bg-[#2E8B57]/20 rounded-full animate-ping"></div>
          <Activity className="h-12 w-12 text-[#2E8B57] relative z-10 animate-pulse" />
        </div>
        <p className="mt-6 text-gray-500 font-medium tracking-wide">Compiling financial intelligence...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-16 font-sans">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Modern Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2E8B57]/10 text-[#2E8B57] text-sm font-semibold mb-3">
              <BarChart3 className="h-4 w-4" /> Revenue Dashboard
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">Commission Control</h1>
            <p className="text-gray-500 mt-2 text-base">Monitor platform earnings, analyze trends, and configure fee structures.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchData}
              className="p-3 bg-white text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-[#2E8B57] shadow-sm transition-all duration-200 group"
            >
              <RefreshCw className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center px-6 py-3 bg-[#2E8B57] text-white rounded-xl hover:bg-[#257a4a] shadow-lg shadow-[#2E8B57]/25 transition-all duration-200 font-semibold transform hover:-translate-y-0.5"
            >
              <Plus className="h-5 w-5 mr-2" />
              New Commission Rule
            </button>
          </div>
        </div>

        {/* Top Analytics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
              <DollarSign className="h-24 w-24 text-[#2E8B57]" />
            </div>
            <div className="relative z-10">
              <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Net Earnings</p>
              <h3 className="text-3xl font-extrabold text-gray-900 mb-4">{moneyFormat(stats.totalCommission)}</h3>
              <div className="flex items-center text-sm font-medium">
                {stats.monthlyGrowth >= 0 ? (
                  <span className="flex items-center text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                    <TrendingUp className="h-4 w-4 mr-1" /> +{stats.monthlyGrowth}% this month
                  </span>
                ) : (
                  <span className="flex items-center text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                    <TrendingDown className="h-4 w-4 mr-1" /> {stats.monthlyGrowth}% this month
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="h-12 w-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-amber-500" />
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Pending Payouts</p>
            <h3 className="text-2xl font-bold text-gray-900">{moneyFormat(stats.pendingCommission)}</h3>
            <p className="mt-2 text-sm text-gray-400 font-medium">Scheduled for next cycle</p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="h-12 w-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-blue-500" />
              </div>
            </div>
            <p className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Lifetime Disbursed</p>
            <h3 className="text-2xl font-bold text-gray-900">{moneyFormat(stats.paidCommission)}</h3>
            <p className="mt-2 text-sm text-gray-400 font-medium">Successfully processed</p>
          </div>

          <div className="bg-gradient-to-br from-[#2E8B57] to-[#1a5233] p-6 rounded-2xl text-white shadow-xl shadow-[#2E8B57]/20 relative overflow-hidden flex flex-col justify-between">
            <div className="absolute -right-4 -top-4 opacity-20">
              <Activity className="h-32 w-32" />
            </div>
            <div className="relative z-10">
              <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider mb-2">MVP Vendor</p>
              {stats.topEarners[0] ? (
                <>
                  <h3 className="text-2xl font-bold truncate tracking-tight">{stats.topEarners[0].vendorName}</h3>
                  <div className="mt-4 pt-4 border-t border-emerald-500/30">
                    <p className="text-emerald-50 text-sm">Generated Revenue</p>
                    <p className="text-xl font-bold mt-1">{moneyFormat(stats.topEarners[0].commission)}</p>
                  </div>
                </>
              ) : (
                <div className="flex items-center h-full">
                  <h3 className="text-xl font-bold text-emerald-100">Awaiting Data</h3>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Primary payment gateway (checkout / wallet first attempt + fallback) */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm mb-8 overflow-hidden">
          <div className="px-6 sm:px-8 py-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-2xl bg-[#2E8B57]/10 flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-6 w-6 text-[#2E8B57]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 tracking-tight">Checkout payment gateway</h2>
                <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                  Sets the <span className="font-semibold text-gray-700">primary</span> processor for card checkout and add-money (Stripe first by default).
                  If the customer&apos;s card fails on the primary, the app can fall back to the other configured gateway when keys are present.
                </p>
              </div>
            </div>
          </div>
          <div className="p-6 sm:px-8 sm:pb-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 space-y-3">
              <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Primary gateway</label>
              <select
                value={primaryGatewayDraft}
                onChange={(e) => setPrimaryGatewayDraft(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-sm font-semibold text-gray-800 bg-white shadow-sm"
              >
                <option value="STRIPE">Stripe</option>
                <option value="PAYSTACK">Paystack</option>
              </select>
              <p className="text-xs text-gray-500 leading-relaxed">
                Stored in <code className="text-gray-700 bg-gray-100 px-1 rounded">system_settings.paymentMethods.primaryGateway</code>.
                The effective order also requires API keys for that gateway in the same JSON block.
              </p>
            </div>
            <div className="lg:col-span-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="space-y-2 text-sm">
                {gatewayState && (
                  <>
                    <p className="text-gray-600">
                      <span className="font-semibold text-gray-800">Effective primary:</span>{" "}
                      <span className="font-mono text-[#2E8B57]">{gatewayState.primaryGateway}</span>
                      <span className="text-gray-400 mx-2">·</span>
                      <span className="font-semibold text-gray-800">Fallback:</span>{" "}
                      <span className="font-mono">{gatewayState.fallbackGateway ?? "—"}</span>
                    </p>
                    <p className="text-gray-600">
                      <span className="font-semibold text-gray-800">Configured keys:</span>{" "}
                      {(gatewayState.configuredGatewayIds?.length ?? 0) > 0
                        ? gatewayState.configuredGatewayIds.join(", ")
                        : "None (add Stripe / Paystack keys in payment settings JSON)"}
                    </p>
                    <p className="text-xs text-gray-400">
                      Currency context for gateway list: {gatewayState.currency}
                    </p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={handleSavePrimaryGateway}
                disabled={gatewaySaving}
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-[#2E8B57] text-white font-bold hover:bg-[#257a4a] shadow-lg shadow-[#2E8B57]/20 transition-all text-sm disabled:opacity-50"
              >
                {gatewaySaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save gateway
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Revenue Trend Chart */}
        <div className="bg-white p-6 sm:p-8 rounded-3xl border border-gray-100 shadow-sm mb-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Revenue Trajectory</h2>
              <p className="text-sm text-gray-500 mt-1 font-medium">Monthly commission volume overview</p>
            </div>
            <div className="mt-4 sm:mt-0 px-4 py-2 bg-gray-50 rounded-lg text-sm font-bold text-gray-600 border border-gray-200">
              Current Year
            </div>
          </div>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.revenueTrend || MOCK_CHART_DATA} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2E8B57" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#2E8B57" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis 
                  dataKey="month" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#6B7280', fontSize: 12, fontWeight: 600 }}
                  tickFormatter={(value) => `${currency}${formatCompact(value)}`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area 
                  type="monotone" 
                  dataKey="amount" 
                  stroke="#2E8B57" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorAmount)" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#2E8B57' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Breakdowns & Lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          
          {/* Rules List (Spans 2 columns) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center tracking-tight">
                <Layers className="h-6 w-6 text-[#2E8B57] mr-2" />
                Active Fee Structures
              </h2>
            </div>

            {commissionSettings.length === 0 ? (
              <div className="bg-white rounded-3xl border border-dashed border-gray-300 p-12 text-center flex flex-col items-center">
                <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                  <Percent className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Rules Configured</h3>
                <p className="text-gray-500 max-w-sm mb-6">Create standardized commission and fee rules to start calculating platform revenue automatically.</p>
                <button 
                  onClick={() => handleOpenModal()}
                  className="px-6 py-3 bg-[#2E8B57] text-white rounded-xl hover:bg-[#257a4a] font-semibold transition-all shadow-md shadow-[#2E8B57]/20"
                >
                  Create Your First Rule
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {commissionSettings.map((setting) => {
                  const moduleInfo = getModuleConfig(setting.module)
                  const typeInfo = getTypeConfig(setting.commissionType)
                  
                  return (
                    <div 
                      key={setting.id} 
                      className="group bg-white rounded-2xl border border-gray-100 hover:border-[#2E8B57]/50 hover:shadow-xl hover:shadow-[#2E8B57]/5 transition-all duration-300 p-6 flex flex-col relative overflow-hidden"
                    >
                      <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-${moduleInfo.color.split('-')[1]}-100 to-transparent opacity-50 rounded-bl-full pointer-events-none`}></div>
                      
                      <div className="flex justify-between items-start mb-5 relative z-10">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border ${moduleInfo.color}`}>
                          {moduleInfo.icon}
                          <span className="ml-1.5">{moduleInfo.label}</span>
                        </span>
                        <div className={`flex items-center gap-1.5 ${setting.isActive ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 bg-gray-100'} px-2.5 py-1 rounded-full text-xs font-bold`}>
                          <div className={`h-2 w-2 rounded-full ${setting.isActive ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
                          {setting.isActive ? 'Active' : 'Inactive'}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3 text-gray-900 font-bold text-lg">
                        <div className="p-1.5 bg-gray-50 rounded-md border border-gray-100">
                          {typeInfo.icon}
                        </div>
                        {typeInfo.label}
                      </div>
                      
                      <p className="text-sm text-gray-500 mb-6 line-clamp-2 h-10 font-medium">
                        {setting.description || "Standard commission logic applied to transactions within this category."}
                      </p>

                      <div className="mt-auto pt-5 border-t border-gray-50 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Fee Rate</p>
                          <p className="text-2xl font-black text-[#2E8B57] tracking-tight">{setting.rate}%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Min Threshold</p>
                          <p className="text-base font-bold text-gray-700">
                            {moneyFormat(setting.minAmount || 0)}
                          </p>
                        </div>
                        <button 
                          onClick={() => handleOpenModal(setting)}
                          className="ml-2 p-2.5 text-gray-400 hover:text-[#2E8B57] hover:bg-[#2E8B57]/10 rounded-xl transition-colors"
                        >
                          <Edit className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Top Earners (Sidebar) */}
          <div className="lg:col-span-1 space-y-6">
            <h2 className="text-xl font-bold text-gray-900 flex items-center tracking-tight">
              <TrendingUp className="h-6 w-6 text-[#2E8B57] mr-2" />
              Top Performers
            </h2>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100%-3rem)]">
              <div className="p-5 border-b border-gray-50 bg-gray-50/50">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Vendor Leaderboard</span>
              </div>
              
              <div className="divide-y divide-gray-50 flex-grow">
                {stats.topEarners.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 flex flex-col items-center">
                    <Activity className="h-8 w-8 mb-3 opacity-50" />
                    <p className="text-sm font-medium">Not enough transaction data</p>
                  </div>
                ) : (
                  stats.topEarners.map((earner, index) => (
                    <div key={earner.vendorId} className="p-5 flex items-center justify-between hover:bg-[#2E8B57]/5 transition-colors group cursor-default">
                      <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${
                          index === 0 ? 'bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900 shadow-amber-200/50' :
                          index === 1 ? 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-800' :
                          index === 2 ? 'bg-gradient-to-br from-orange-200 to-orange-300 text-orange-900' :
                          'bg-gray-50 border border-gray-100 text-gray-500'
                        }`}>
                          #{index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900 group-hover:text-[#2E8B57] transition-colors">{earner.vendorName}</p>
                          <p className="text-xs text-gray-500 font-medium mt-0.5">{earner.orders} Volume</p>
                        </div>
                      </div>
                      <span className="text-base font-bold text-gray-900 bg-gray-50 px-3 py-1 rounded-lg group-hover:bg-white transition-colors border border-transparent group-hover:border-gray-100">
                        {moneyFormat(earner.commission)}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 bg-gray-50/50 border-t border-gray-50 mt-auto">
                <button className="text-sm font-bold text-[#2E8B57] hover:text-[#1a5233] flex items-center justify-center w-full transition-colors">
                  Generate Full Report <ArrowRight className="h-4 w-4 ml-1.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Ledger Breakdowns */}
        {(stats.vendorCommissionBreakdown?.length || stats.riderCommissionBreakdown?.length) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center">
                    <Store className="h-5 w-5 text-[#2E8B57] mr-2" />
                    Vendor Revenue Ledger
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Segmented by type and current status</p>
                </div>
              </div>
              <div className="overflow-x-auto p-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="px-4 py-4 font-bold">Category</th>
                      <th className="px-4 py-4 font-bold">State</th>
                      <th className="px-4 py-4 font-bold text-right">Value</th>
                      <th className="px-4 py-4 font-bold text-right">Txn Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(stats.vendorCommissionBreakdown || []).map((row, i) => {
                      const tc = getTypeConfig(row.commissionType)
                      return (
                        <tr key={`v-${i}`} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-2 text-gray-800 font-semibold bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                              {tc.icon}
                              {tc.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                              row.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 
                              row.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-gray-900 text-base">{moneyFormat(row.amount)}</td>
                          <td className="px-4 py-4 text-right text-gray-500 font-medium">{row.count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
              <div className="px-6 py-5 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-gray-900 flex items-center">
                    <Bike className="h-5 w-5 text-[#2E8B57] mr-2" />
                    Rider Revenue Ledger
                  </h2>
                  <p className="text-xs text-gray-500 mt-1 font-medium">Segmented by type and current status</p>
                </div>
              </div>
              <div className="overflow-x-auto p-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-gray-400 border-b border-gray-100">
                      <th className="px-4 py-4 font-bold">Category</th>
                      <th className="px-4 py-4 font-bold">State</th>
                      <th className="px-4 py-4 font-bold text-right">Value</th>
                      <th className="px-4 py-4 font-bold text-right">Txn Count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(stats.riderCommissionBreakdown || []).map((row, i) => {
                      const tc = getTypeConfig(row.commissionType)
                      return (
                        <tr key={`r-${i}`} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-4">
                            <span className="inline-flex items-center gap-2 text-gray-800 font-semibold bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                              {tc.icon}
                              {tc.label}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                              row.status === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 
                              row.status === 'PENDING' ? 'bg-amber-50 text-amber-700' : 
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-right font-bold text-gray-900 text-base">{moneyFormat(row.amount)}</td>
                          <td className="px-4 py-4 text-right text-gray-500 font-medium">{row.count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {/* Modal Configuration */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden animate-in slide-in-from-bottom-8 zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white">
                <div>
                  <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
                    {editingId ? 'Edit Configuration' : 'Create New Rule'}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1 font-medium">Define parameters for platform fee calculations</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)} 
                  className="p-2 bg-gray-50 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-8 space-y-6 bg-gray-50/30">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Target Module</label>
                    <div className="relative">
                      <select
                        value={formData.module}
                        onChange={(e) => setFormData({ ...formData, module: e.target.value as any })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-sm bg-white font-semibold text-gray-800 appearance-none shadow-sm transition-all"
                      >
                        {["PHARMACY", "FOOD", "GROCERY", "AUTO_PARTS", "RIDING", "COURIER", "WHOLESALER", "CUSTOMER", "WALLET"].map(m => (
                          <option key={m} value={m}>{m.replace("_", " ")}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Fee Category</label>
                    <div className="relative">
                      <select
                        value={formData.commissionType}
                        onChange={(e) => setFormData({ ...formData, commissionType: e.target.value as any })}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-sm bg-white font-semibold text-gray-800 appearance-none shadow-sm transition-all"
                      >
                        {["VENDOR_COMMISSION", "RIDER_COMMISSION", "PLATFORM_FEE", "PAYMENT_PROCESSING", "WHOLESALE_ORDER", "MECHANIC_COMMISSION", "CUSTOMER_TAX", "MECHANIC_TAX"].map(t => ( 
                          <option key={t} value={t}>{t.replace("_", " ")}</option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Deduction Rate</label>
                  <div className="relative flex items-center">
                    <input
                      type="number"
                      step="0.1"
                      value={formData.rate}
                      onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) })}
                      className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-2xl font-black text-gray-900 transition-all"
                    />
                    <div className="absolute right-4 text-gray-400 pointer-events-none bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                      <Percent className="h-5 w-5" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Min Value ({currency})</label>
                    <input
                      type="number"
                      value={formData.minAmount}
                      onChange={(e) => setFormData({ ...formData, minAmount: parseFloat(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-sm font-semibold bg-white shadow-sm transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Max Cap ({currency})</label>
                    <input
                      type="number"
                      value={formData.maxAmount}
                      onChange={(e) => setFormData({ ...formData, maxAmount: parseFloat(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-sm font-semibold bg-white shadow-sm transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Rule Description</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-[#2E8B57]/10 outline-none text-sm bg-white shadow-sm transition-all resize-none font-medium"
                    placeholder="Briefly detail when and how this logic applies..."
                  />
                </div>

                <div 
                  className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                    formData.isActive ? 'bg-emerald-50/50 border-emerald-200' : 'bg-white border-gray-200'
                  }`}
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                >
                  <div className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all shadow-sm ${
                    formData.isActive ? 'bg-[#2E8B57] border-[#2E8B57]' : 'bg-gray-50 border-gray-300'
                  }`}>
                    {formData.isActive && <CheckCircle className="h-4 w-4 text-white" />}
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-gray-900">Activate Rule Immediately</span>
                    <span className="block text-xs font-medium text-gray-500">System will apply this to all matching future transactions.</span>
                  </div>
                </div>
              </div>

              <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end gap-3">
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 hover:border-gray-300 transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formData.rate}
                  className="px-6 py-3 rounded-xl bg-[#2E8B57] text-white font-bold hover:bg-[#257a4a] shadow-lg shadow-[#2E8B57]/20 transition-all text-sm flex items-center disabled:opacity-50 disabled:shadow-none"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2"></div>
                      Committing...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Commit Rule
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}