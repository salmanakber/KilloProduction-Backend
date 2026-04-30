"use client"

import { useEffect, useState, Suspense, useCallback } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { 
  ArrowLeft, Download, ShoppingCart, 
  TrendingUp, Activity, User, AlertCircle 
} from "lucide-react"

// --- Types ---
type VendorPerformanceResponse = {
  module: string
  currencySymbol?: string
  vendorId?: string
  vendor?: { id: string; name: string; email?: string | null; phone?: string | null }
  summary?: { totalOrders?: number; totalJobs?: number; completedJobs?: number; grossSales?: number; netProfitOrLoss?: number }
  discounts?: { totalDiscount?: number }
  chartData?: Array<{ date: string; grossSales?: number; orders?: number; requests?: number; offers?: number }>
  recentActivity?: Array<{ id: string; message?: string; status?: string; createdAt: string; amount?: number; type?: string }>
  activityPagination?: { page: number; limit: number; total: number; pages: number }
}

// --- Helpers ---
const formatMoney = (amount: number, symbol: string = "₦") => {
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`
}

// --- Sub-components ---
const StatCard = ({ title, value, icon: Icon }: { title: string, value: string | number, icon: any }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm transition-shadow hover:shadow-md">
    <div className="flex items-center gap-3 mb-2">
      <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
        <Icon size={18} />
      </div>
      <p className="text-sm font-medium text-gray-500">{title}</p>
    </div>
    <p className="text-2xl font-bold text-gray-900">{value}</p>
  </div>
)

const SkeletonLoader = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white rounded-xl border h-28 p-5" />
      ))}
    </div>
    <div className="bg-white rounded-xl border h-64 p-5" />
    <div className="bg-white rounded-xl border h-64 p-5" />
  </div>
)

// --- Main Content Component ---
function VendorPerformanceContent() {
  const searchParams = useSearchParams()
  const vendorId = searchParams?.get("vendorId") || ""
  const moduleKey = searchParams?.get("module") || "ALL"
  const label = searchParams?.get("label") || "Vendor"
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<VendorPerformanceResponse | null>(null)
  const [page, setPage] = useState(1)
  const limit = 10

  useEffect(() => {
    setPage(1)
  }, [vendorId, moduleKey])

  const fetchPerformance = useCallback(async () => {
    if (!vendorId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/modules/vendor-performance?vendorId=${encodeURIComponent(vendorId)}&module=${encodeURIComponent(moduleKey)}&page=${page}&limit=${limit}`,
      )
      if (!res.ok) throw new Error("Failed to fetch performance data")
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred")
    } finally {
      setLoading(false)
    }
  }, [vendorId, moduleKey, page])

  useEffect(() => {
    fetchPerformance()
  }, [fetchPerformance])

  const downloadExport = () => {
    const url = `/api/admin/modules/vendor-performance?vendorId=${encodeURIComponent(vendorId)}&module=${encodeURIComponent(moduleKey)}&export=csv`
    window.open(url, "_blank")
  }

  // Derived calculations for the chart
  const isMechanic = moduleKey === "MECHANIC"
  const getChartValue = (p: any) => isMechanic ? (p.requests || 0) + (p.offers || 0) : (p.grossSales || 0)
  const maxChartValue = Math.max(...(data?.chartData || []).map(getChartValue), 1)

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Standalone Performance</h1>
          <p className="text-sm text-gray-500 mt-1">
            <span className="font-medium text-gray-700">{label}</span> ({moduleKey}) financial performance and recent activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            href="/admin/modules/vendor" 
            className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-emerald-600 transition-colors bg-gray-50 hover:bg-emerald-50 px-3 py-2 rounded-lg border"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          <button
            type="button"
            onClick={downloadExport}
            disabled={loading || !data}
            className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </div>

      {/* States: Loading, Error, Content */}
      {loading ? (
        <SkeletonLoader />
      ) : error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center flex flex-col items-center">
          <AlertCircle className="text-red-500 mb-3" size={32} />
          <p className="text-red-800 font-medium">{error}</p>
          <button 
            onClick={fetchPerformance} 
            className="mt-4 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50 transition-colors"
          >
            Try Again
          </button>
        </div>
      ) : !data ? (
        <div className="bg-gray-50 rounded-xl border p-8 text-center text-gray-500">
          No data available for this vendor.
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          
          {/* Stat Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard 
              title="Vendor" 
              value={data.vendor?.name || label} 
              icon={User} 
            />
            <StatCard 
              title={isMechanic ? "Service Requests" : "Total Orders"} 
              value={((isMechanic ? data.summary?.totalJobs : data.summary?.totalOrders) || data.summary?.totalOrders || 0).toLocaleString()} 
              icon={ShoppingCart} 
            />
            <StatCard 
              title="Gross Sales" 
              value={formatMoney(data.summary?.grossSales || 0, data.currencySymbol)} 
              icon={Activity} 
            />
            <StatCard 
              title="Net Profit/Loss" 
              value={formatMoney(data.summary?.netProfitOrLoss || 0, data.currencySymbol)} 
              icon={TrendingUp} 
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart Section */}
            <div className="bg-white rounded-xl border p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Trend</h2>
              {(data.chartData || []).length === 0 ? (
                <div className="h-48 flex items-center justify-center text-sm text-gray-500 border border-dashed rounded-lg">
                  No trend points in selected range.
                </div>
              ) : (
                <div className="space-y-4">
                  {(data.chartData || []).map((point) => {
                    const value = getChartValue(point)
                    const width = Math.max(2, Math.round((value / maxChartValue) * 100))
                    
                    return (
                      <div key={point.date} className="flex items-center gap-4 text-sm group">
                        <span className="w-24 text-gray-500 font-medium tabular-nums">{point.date}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div 
                            className="h-full rounded-full bg-emerald-500 transition-all duration-1000 ease-out group-hover:bg-emerald-400" 
                            style={{ width: `${width}%` }} 
                          />
                        </div>
                        <span className="w-28 text-right font-medium text-gray-700 tabular-nums">
                          {isMechanic
                            ? `${value} events`
                            : formatMoney(value, data.currencySymbol)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Recent Activity Section */}
            <div className="bg-white rounded-xl border p-6 shadow-sm flex flex-col h-full">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Activity</h2>
              
              <div className="space-y-3 flex-grow">
                {(data.recentActivity || []).length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-sm text-gray-500 border border-dashed rounded-lg">
                    No recent activity for this vendor.
                  </div>
                ) : (
                  (data.recentActivity || []).map((item) => (
                    <div key={item.id} className="flex items-start justify-between border-b last:border-0 pb-3 last:pb-0 gap-4">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{item.message || item.type || "Activity"}</p>
                        <span className="text-xs text-gray-500">
                          {new Date(item.createdAt).toLocaleString(undefined, { 
                            dateStyle: 'medium', 
                            timeStyle: 'short' 
                          })}
                        </span>
                      </div>
                      {typeof item.amount === "number" && (
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs font-semibold text-gray-700 tabular-nums">
                          {formatMoney(item.amount, data.currencySymbol)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {(data.activityPagination?.pages || 1) > 1 && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t">
                  <span className="text-sm text-gray-500">
                    Page <span className="font-medium text-gray-900">{data.activityPagination?.page || page}</span> of <span className="font-medium text-gray-900">{data.activityPagination?.pages || 1}</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      disabled={page >= (data.activityPagination?.pages || 1)}
                      onClick={() => setPage((p) => p + 1)}
                      className="px-3 py-1.5 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Main Export with Suspense Boundary ---
export default function VendorPerformancePage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto p-8 text-center text-gray-500">
        Loading performance dashboard...
      </div>
    }>
      <VendorPerformanceContent />
    </Suspense>
  )
}