"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Users,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  BarChart3,
  Heart,
  Car,
  Utensils,
  Package,
  Truck,
  Activity,
  CreditCard,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Zap
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, Cell } from "recharts"
import { formatDistanceToNow } from "date-fns"

interface DashboardStats {
  currencySymbol?: string
  totalUsers: number
  totalOrders: number
  totalRevenue: number
  monthlyGrowth: number
  activeComplaints: number
  resolvedComplaints: number
  moduleStats: {
    pharmacy: { users: number; orders: number; revenue: number }
    autoParts: { users: number; orders: number; revenue: number }
    food: { users: number; orders: number; revenue: number }
    grocery: { users: number; orders: number; revenue: number }
    riding: { users: number; orders: number; revenue: number }
  }
  moduleChartData?: { key: string; name: string; revenue: number; orders: number }[]
  recentActivities: Array<{
    id: string
    type: string
    message: string
    timestamp: string
    user: string
  }>
  paymentSummary?: {
    walletVolume: number
    gatewayVolume: number
    pendingWithdrawals: number
  }
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState("7d")

  useEffect(() => {
    setLoading(true)
    const fetchDashboardStats = async () => {
      try {
        const response = await fetch(`/api/admin/dashboard/stats?range=${timeRange}`)
        const data = await response.json()
        setStats(data.error ? null : data)
      } catch (error) {
        console.error("Failed to fetch dashboard stats:", error)
        setStats(null)
      } finally {
        setLoading(false)
      }
    }
    void fetchDashboardStats()
  }, [timeRange])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse p-2">
        {/* Header Skeleton */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="h-8 w-64 bg-slate-200 rounded-lg mb-2"></div>
            <div className="h-4 w-96 bg-slate-200 rounded-lg"></div>
          </div>
          <div className="h-10 w-40 bg-slate-200 rounded-xl"></div>
        </div>
        
        {/* KPI Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 h-32"></div>
          ))}
        </div>

        {/* Payment Summary Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-2xl border border-slate-100 h-24"></div>
          ))}
        </div>

        {/* Charts Skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 h-[400px]"></div>
          <div className="bg-white p-6 rounded-2xl border border-slate-100 h-[400px]"></div>
        </div>
      </div>
    )
  }

  const cur = stats?.currencySymbol ?? "₦"
  const growth = stats?.monthlyGrowth ?? 0
  const isPositiveGrowth = growth >= 0

  const moduleIcons = {
    pharmacy: Heart,
    autoParts: Car,
    food: Utensils,
    grocery: Package,
    riding: Truck,
  }

  const moduleColors = {
    pharmacy: { bg: "bg-rose-100", text: "text-rose-600", border: "border-rose-200", bar: "#e11d48" },
    autoParts: { bg: "bg-blue-100", text: "text-blue-600", border: "border-blue-200", bar: "#2563eb" },
    food: { bg: "bg-amber-100", text: "text-amber-600", border: "border-amber-200", bar: "#d97706" },
    grocery: { bg: "bg-emerald-100", text: "text-emerald-600", border: "border-emerald-200", bar: "#059669" },
    riding: { bg: "bg-purple-100", text: "text-purple-600", border: "border-purple-200", bar: "#7c3aed" },
  }

  const chartRows =
    stats?.moduleChartData ??
    (stats?.moduleStats
      ? [
          { key: "pharmacy", name: "Pharmacy", revenue: stats.moduleStats.pharmacy.revenue, orders: stats.moduleStats.pharmacy.orders },
          { key: "autoParts", name: "Auto Parts", revenue: stats.moduleStats.autoParts.revenue, orders: stats.moduleStats.autoParts.orders },
          { key: "food", name: "Food", revenue: stats.moduleStats.food.revenue, orders: stats.moduleStats.food.orders },
          { key: "grocery", name: "Grocery", revenue: stats.moduleStats.grocery.revenue, orders: stats.moduleStats.grocery.orders },
          { key: "riding", name: "Rides", revenue: stats.moduleStats.riding.revenue, orders: stats.moduleStats.riding.orders },
        ]
      : [])

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Enterprise overview and system health for Kilo Super App.</p>
        </div>
        <div className="flex items-center space-x-3 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <Calendar className="h-4 w-4 text-slate-500 ml-2" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-transparent text-sm font-semibold text-slate-700 outline-none pr-4 py-1.5 cursor-pointer"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-blue-50 group-hover:bg-blue-100 transition-colors rounded-xl flex items-center justify-center border border-blue-100">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Users</p>
            <p className="text-3xl font-black text-slate-900">{stats?.totalUsers?.toLocaleString() ?? "0"}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">All registered accounts globally</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-indigo-50 group-hover:bg-indigo-100 transition-colors rounded-xl flex items-center justify-center border border-indigo-100">
              <ShoppingCart className="h-6 w-6 text-indigo-600" />
            </div>
            <div className={`flex items-center px-2 py-1 rounded-full text-xs font-bold ${isPositiveGrowth ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {isPositiveGrowth ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
              {Math.abs(growth)}%
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Orders (Range)</p>
            <p className="text-3xl font-black text-slate-900">{stats?.totalOrders?.toLocaleString() ?? "0"}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Completed orders in selected window</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-emerald-50 group-hover:bg-emerald-100 transition-colors rounded-xl flex items-center justify-center border border-emerald-100">
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Delivered Revenue</p>
            <p className="text-3xl font-black text-slate-900">
              {cur}{(stats?.totalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Gross volume for delivered items</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-rose-50 group-hover:bg-rose-100 transition-colors rounded-xl flex items-center justify-center border border-rose-100">
              <AlertTriangle className="h-6 w-6 text-rose-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Tickets</p>
            <p className="text-3xl font-black text-slate-900">{stats?.activeComplaints ?? 0}</p>
            <div className="mt-2 flex items-center">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
              <span className="text-xs text-emerald-600 font-bold">{stats?.resolvedComplaints ?? 0} resolved</span>
            </div>
          </div>
        </div>
      </div>

      {/* PAYMENT SUMMARY BLOCK */}
      {stats?.paymentSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-5 rounded-2xl shadow-sm flex items-center gap-4 text-white">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <DollarSign className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Wallet Volume</p>
              <p className="text-xl font-bold mt-0.5">
                {cur}{stats.paymentSummary.walletVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Gateway Processed</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">
                {cur}{stats.paymentSummary.gatewayVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Payouts</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{stats.paymentSummary.pendingWithdrawals}</p>
              </div>
            </div>
            <Link href="/admin/payments" className="h-10 w-10 flex items-center justify-center rounded-full bg-slate-50 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors">
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      )}

      {/* CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900">Module Revenue</h3>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">Volume</span>
          </div>
          <div className="h-[300px] w-full">
            {chartRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${cur}${v >= 1000 ? v/1000+'k' : v}`} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} formatter={(value: number) => [`${cur}${value.toLocaleString()}`, "Revenue"]} />
                  <Bar dataKey="revenue" radius={[6, 6, 0, 0]} barSize={40}>
                    {chartRows.map((entry) => (
                      <Cell key={`cell-${entry.key}`} fill={moduleColors[entry.key as keyof typeof moduleColors]?.bar || "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No module data for this range.</div>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900">Order Distribution</h3>
            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">Count</span>
          </div>
          <div className="h-[300px] w-full">
            {chartRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} dy={10} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                  <Bar dataKey="orders" name="Orders" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm font-medium">No order data available.</div>
            )}
          </div>
        </div>
      </div>

      {/* MODULES & ACTIVITY ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module Breakdowns */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Module Deep Dive</h3>
          <div className="space-y-3">
            {stats?.moduleStats &&
              Object.entries(stats.moduleStats).map(([key, data]) => {
                const IconComponent = moduleIcons[key as keyof typeof moduleIcons] || Package
                const colorConfig = moduleColors[key as keyof typeof moduleColors] || { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' }
                
                return (
                  <div key={key} className="group flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer">
                    <div className="flex items-center space-x-4">
                      <div className={`h-12 w-12 rounded-xl flex items-center justify-center border ${colorConfig.bg} ${colorConfig.text} ${colorConfig.border}`}>
                        <IconComponent className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900 capitalize text-base">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5">
                          {data.users.toLocaleString()} users • {data.orders.toLocaleString()} orders
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900 text-base">
                        {cur}{data.revenue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5 group-hover:text-emerald-600 transition-colors">Gross Vol.</p>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" /> Live Activity Feed
            </h3>
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
            <div className="relative border-l border-slate-200 ml-3 space-y-6 pb-4">
              {(stats?.recentActivities?.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500 font-medium ml-6">No recent audit or order events in this range.</p>
              ) : (
                stats!.recentActivities.map((activity, index) => {
                  let rel = activity.timestamp
                  try {
                    rel = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
                  } catch { /* keep raw */ }
                  
                  return (
                    <div key={activity.id} className="relative pl-6">
                      {/* Timeline dot */}
                      <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-slate-200 border-2 border-white ring-1 ring-slate-200"></span>
                      
                      <div className="flex flex-col gap-1">
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{activity.message}</p>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600">{activity.user}</span>
                          <span>•</span>
                          <span>{rel}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { name: "Users", icon: Users, href: "/admin/users", color: "text-blue-600", bg: "bg-blue-50", hover: "hover:border-blue-300 hover:shadow-blue-100" },
            { name: "Payments", icon: DollarSign, href: "/admin/payments", color: "text-emerald-600", bg: "bg-emerald-50", hover: "hover:border-emerald-300 hover:shadow-emerald-100" },
            { name: "Orders", icon: ShoppingCart, href: "/admin/orders", color: "text-indigo-600", bg: "bg-indigo-50", hover: "hover:border-indigo-300 hover:shadow-indigo-100" },
            { name: "Commission", icon: BarChart3, href: "/admin/commission", color: "text-purple-600", bg: "bg-purple-50", hover: "hover:border-purple-300 hover:shadow-purple-100" },
            { name: "Support", icon: AlertTriangle, href: "/admin/complaints", color: "text-rose-600", bg: "bg-rose-50", hover: "hover:border-rose-300 hover:shadow-rose-100" },
            { name: "KYC Auth", icon: Clock, href: "/admin/kyc", color: "text-amber-600", bg: "bg-amber-50", hover: "hover:border-amber-300 hover:shadow-amber-100" },
          ].map((action, i) => (
            <Link
              key={i}
              href={action.href}
              className={`group flex flex-col items-center justify-center p-5 rounded-2xl border border-slate-200 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg bg-white ${action.hover}`}
            >
              <div className={`h-12 w-12 rounded-full ${action.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-200`}>
                <action.icon className={`h-6 w-6 ${action.color}`} />
              </div>
              <span className="text-sm font-bold text-slate-700 group-hover:text-slate-900">{action.name}</span>
            </Link>
          ))}
        </div>
      </div>
      
    </div>
  )
}