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
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts"
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  const cur = stats?.currencySymbol ?? "₦"
  const growth = stats?.monthlyGrowth ?? 0

  const moduleIcons = {
    pharmacy: Heart,
    autoParts: Car,
    food: Utensils,
    grocery: Package,
    riding: Truck,
  }

  const moduleColors = {
    pharmacy: "bg-red-100 text-red-600 border-red-200",
    autoParts: "bg-blue-100 text-blue-600 border-blue-200",
    food: "bg-orange-100 text-orange-600 border-orange-200",
    grocery: "bg-green-100 text-green-600 border-green-200",
    riding: "bg-purple-100 text-purple-600 border-purple-200",
  }

  const chartRows =
    stats?.moduleChartData ??
    (stats?.moduleStats
      ? [
          { key: "pharmacy", name: "Pharmacy", revenue: stats.moduleStats.pharmacy.revenue, orders: stats.moduleStats.pharmacy.orders },
          { key: "autoParts", name: "Auto parts", revenue: stats.moduleStats.autoParts.revenue, orders: stats.moduleStats.autoParts.orders },
          { key: "food", name: "Food", revenue: stats.moduleStats.food.revenue, orders: stats.moduleStats.food.orders },
          { key: "grocery", name: "Grocery", revenue: stats.moduleStats.grocery.revenue, orders: stats.moduleStats.grocery.orders },
          { key: "riding", name: "Rides", revenue: stats.moduleStats.riding.revenue, orders: stats.moduleStats.riding.orders },
        ]
      : [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back! Here&apos;s what&apos;s happening with Kilo Super App.</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalUsers?.toLocaleString() ?? "0"}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">All registered accounts</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Orders (range)</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalOrders?.toLocaleString() ?? "0"}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <TrendingUp className={`h-4 w-4 mr-1 ${growth >= 0 ? "text-green-500" : "text-red-500"}`} />
            <span className={`text-sm font-medium ${growth >= 0 ? "text-green-600" : "text-red-600"}`}>
              {growth >= 0 ? "+" : ""}
              {growth}% delivered revenue vs prior window
            </span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Delivered revenue</p>
              <p className="text-3xl font-bold text-gray-900">
                {cur}
                {(stats?.totalRevenue ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-4">Sum of delivered orders in the selected range</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Support tickets</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.activeComplaints ?? 0}</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <div className="mt-4 flex items-center">
            <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-sm text-green-600 font-medium">{stats?.resolvedComplaints ?? 0} resolved in range</span>
          </div>
        </div>
      </div>

      {stats?.paymentSummary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Wallet volume (completed)</p>
              <p className="text-lg font-bold text-gray-900">
                {cur}
                {stats.paymentSummary.walletVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <CreditCard className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Gateway paid (range)</p>
              <p className="text-lg font-bold text-gray-900">
                {cur}
                {stats.paymentSummary.gatewayVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Pending vendor withdrawals</p>
              <p className="text-lg font-bold text-gray-900">{stats.paymentSummary.pendingWithdrawals}</p>
              <Link href="/admin/payments" className="text-xs text-emerald-600 hover:underline">
                Open payments →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Module performance (revenue)</h3>
          <div className="h-72 w-full">
            {chartRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => [`${cur}${value.toLocaleString()}`, "Revenue"]} />
                  <Legend />
                  <Bar dataKey="revenue" name={`Revenue (${cur})`} fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm py-16 text-center">No module data for this range.</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Module orders (count)</h3>
          <div className="h-72 w-full">
            {chartRows.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="orders" name="Orders" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-500 text-sm py-16 text-center">No data.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Module summary</h3>
          <div className="space-y-4">
            {stats?.moduleStats &&
              Object.entries(stats.moduleStats).map(([key, data]) => {
                const IconComponent = moduleIcons[key as keyof typeof moduleIcons]
                const colorClass = moduleColors[key as keyof typeof moduleColors]
                return (
                  <div key={key} className="flex items-center justify-between p-4 rounded-lg border border-gray-100">
                    <div className="flex items-center space-x-3">
                      <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${colorClass}`}>
                        <IconComponent className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                        <p className="text-sm text-gray-500">
                          {data.users} vendors / riders · {data.orders} orders
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">
                        {cur}
                        {data.revenue?.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-sm text-gray-500">Revenue</p>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent activity</h3>
          <div className="space-y-4 max-h-[28rem] overflow-y-auto pr-1">
            {(stats?.recentActivities?.length ?? 0) === 0 ? (
              <p className="text-sm text-gray-500">No recent audit or order events in this range.</p>
            ) : (
              stats!.recentActivities.map((activity) => {
                let rel = activity.timestamp
                try {
                  rel = formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })
                } catch {
                  /* keep raw */
                }
                return (
                  <div key={activity.id} className="flex items-start space-x-3">
                    <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Activity className="h-4 w-4 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900">{activity.message}</p>
                      <div className="flex items-center mt-1 space-x-2 flex-wrap">
                        <p className="text-xs text-gray-500">{activity.user}</p>
                        <span className="text-xs text-gray-400">•</span>
                        <p className="text-xs text-gray-500">{rel}</p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Link
            href="/admin/users"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <Users className="h-6 w-6 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Users</span>
          </Link>
          <Link
            href="/admin/payments"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <DollarSign className="h-6 w-6 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Payments</span>
          </Link>
          <Link
            href="/admin/orders"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <ShoppingCart className="h-6 w-6 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Orders</span>
          </Link>
          <Link
            href="/admin/commission"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <BarChart3 className="h-6 w-6 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Commission</span>
          </Link>
          <Link
            href="/admin/complaints"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <AlertTriangle className="h-6 w-6 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">Support</span>
          </Link>
          <Link
            href="/admin/kyc"
            className="flex flex-col items-center p-4 rounded-lg border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <Clock className="h-6 w-6 text-green-600 mb-2" />
            <span className="text-sm font-medium text-gray-900">KYC</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
