"use client"

import { useState, useEffect } from "react"
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  Eye,
  DollarSign,
  Users,
  ShoppingCart,
  Package,
  Clock,
  Target,
  PieChart,
  LineChart,
} from "lucide-react"

interface ReportData {
  id: string
  name: string
  type: "REVENUE" | "USERS" | "ORDERS" | "PERFORMANCE" | "CUSTOM"
  module: "ALL" | "PHARMACY" | "AUTO_PARTS" | "FOOD" | "GROCERY" | "RIDING"
  dateRange: {
    start: string
    end: string
  }
  data: any
  generatedAt: string
  generatedBy: string
}

interface AnalyticsData {
  overview: {
    totalRevenue: number
    totalUsers: number
    totalOrders: number
    averageOrderValue: number
    revenueGrowth: number
    userGrowth: number
  }
  moduleBreakdown: {
    [key: string]: {
      revenue: number
      orders: number
      users: number
      growth: number
    }
  }
  timeSeriesData: {
    date: string
    revenue: number
    orders: number
    users: number
  }[]
  topPerformers: {
    vendors: Array<{
      id: string
      name: string
      module: string
      revenue: number
      orders: number
    }>
    products: Array<{
      id: string
      name: string
      category: string
      sales: number
      revenue: number
    }>
  }
}

export default function ReportsAnalytics() {
  const [reports, setReports] = useState<ReportData[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("overview")
  const [dateRange, setDateRange] = useState("30d")
  const [selectedModule, setSelectedModule] = useState("ALL")

  useEffect(() => {
    fetchReportsData()
    fetchAnalytics()
  }, [dateRange, selectedModule])

  const fetchReportsData = async () => {
    try {
      const response = await fetch(`/api/admin/reports?range=${dateRange}&module=${selectedModule}`)
      const data = await response.json()
      setReports(data.reports)
    } catch (error) {
      console.error("Failed to fetch reports:", error)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(`/api/admin/analytics?range=${dateRange}&module=${selectedModule}`)
      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error("Failed to fetch analytics:", error)
    } finally {
      setLoading(false)
    }
  }

  const generateReport = async (reportType: string) => {
    try {
      const response = await fetch("/api/admin/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: reportType,
          module: selectedModule,
          dateRange,
        }),
      })
      if (response.ok) {
        fetchReportsData()
      }
    } catch (error) {
      console.error("Failed to generate report:", error)
    }
  }

  const exportReport = async (reportId: string, format: "PDF" | "CSV" | "EXCEL") => {
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/export?format=${format}`)
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `report-${reportId}.${format.toLowerCase()}`
        a.click()
      }
    } catch (error) {
      console.error("Failed to export report:", error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
          <p className="text-gray-600 mt-1">Comprehensive business intelligence and reporting dashboard</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="1y">Last Year</option>
          </select>
          <select
            value={selectedModule}
            onChange={(e) => setSelectedModule(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
          >
            <option value="ALL">All Modules</option>
            <option value="PHARMACY">Pharmacy</option>
            <option value="AUTO_PARTS">Auto Parts</option>
            <option value="FOOD">Food</option>
            <option value="GROCERY">Grocery</option>
            <option value="RIDING">Riding</option>
          </select>
          <button
            onClick={() => generateReport("COMPREHENSIVE")}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            Generate Report
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Revenue</p>
                <p className="text-3xl font-bold text-gray-900">${analytics?.overview?.totalRevenue?.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600 font-medium">+{analytics?.overview?.revenueGrowth}%</span>
              <span className="text-sm text-gray-500 ml-1">vs last period</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Users</p>
                <p className="text-3xl font-bold text-gray-900">{analytics?.overview?.totalUsers?.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div className="mt-4 flex items-center">
              <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-sm text-green-600 font-medium">+{analytics?.overview?.userGrowth}%</span>
              <span className="text-sm text-gray-500 ml-1">vs last period</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Orders</p>
                <p className="text-3xl font-bold text-gray-900">{analytics?.overview?.totalOrders?.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Order Value</p>
                <p className="text-3xl font-bold text-gray-900">${analytics?.overview?.averageOrderValue?.toFixed(2)}</p>
              </div>
              <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Target className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab("overview")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "overview"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("modules")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "modules"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Module Performance
            </button>
            <button
              onClick={() => setActiveTab("trends")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "trends"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Trends & Insights
            </button>
            <button
              onClick={() => setActiveTab("reports")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "reports"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Generated Reports
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "overview" && analytics && (
            <div className="space-y-6">
              {/* Revenue Chart */}
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
                <div className="h-64 flex items-center justify-center bg-white rounded border">
                  <div className="text-center">
                    <LineChart className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Revenue chart visualization would go here</p>
                    <p className="text-sm text-gray-400">Integration with charting library needed</p>
                  </div>
                </div>
              </div>

              {/* Top Performers */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Vendors</h3>
                  <div className="space-y-3">
                    {analytics?.topPerformers?.vendors?.map((vendor, index) => (
                      <div key={vendor.id} className="flex items-center justify-between bg-white p-3 rounded">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                            <span className="text-green-600 font-medium text-sm">{index + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{vendor.name}</p>
                            <p className="text-sm text-gray-500">{vendor.module}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">${vendor.revenue.toLocaleString()}</p>
                          <p className="text-sm text-gray-500">{vendor.orders} orders</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Products</h3>
                  <div className="space-y-3">
                    {analytics?.topPerformers?.products?.map((product, index) => (
                      <div key={product.id} className="flex items-center justify-between bg-white p-3 rounded">
                        <div className="flex items-center space-x-3">
                          <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 font-medium text-sm">{index + 1}</span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{product.name}</p>
                            <p className="text-sm text-gray-500">{product.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">${product.revenue.toLocaleString()}</p>
                          <p className="text-sm text-gray-500">{product.sales} sold</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "modules" && analytics && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {analytics?.moduleBreakdown?.map((module, index) => (
                  <div key={module.id} className="bg-gray-50 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 capitalize">{module.name}</h3>
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center bg-green-100`}>
                        <Package className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Revenue</span>
                        <span className="font-semibold">${module?.revenue?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Orders</span>
                        <span className="font-semibold">{module?.orders?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Users</span>
                        <span className="font-semibold">{module?.users?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Growth</span>
                        <span className={`font-semibold ${module?.growth > 0 ? "text-green-600" : "text-red-600"}`}>
                          {module?.growth > 0 ? "+" : ""}
                          {module?.growth}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "trends" && (
            <div className="space-y-6">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Trends</h3>
                <div className="h-64 flex items-center justify-center bg-white rounded border">
                  <div className="text-center">
                    <PieChart className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Trend analysis charts would go here</p>
                    <p className="text-sm text-gray-400">Integration with charting library needed</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Insights</h3>
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded border-l-4 border-green-500">
                      <p className="font-medium text-gray-900">Peak Hours</p>
                      <p className="text-sm text-gray-600">Most orders placed between 6-8 PM</p>
                    </div>
                    <div className="bg-white p-4 rounded border-l-4 border-blue-500">
                      <p className="font-medium text-gray-900">Popular Categories</p>
                      <p className="text-sm text-gray-600">Pharmacy and Food leading in orders</p>
                    </div>
                    <div className="bg-white p-4 rounded border-l-4 border-purple-500">
                      <p className="font-medium text-gray-900">User Behavior</p>
                      <p className="text-sm text-gray-600">Average session duration: 12 minutes</p>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recommendations</h3>
                  <div className="space-y-3">
                    <div className="bg-white p-4 rounded border-l-4 border-orange-500">
                      <p className="font-medium text-gray-900">Marketing Focus</p>
                      <p className="text-sm text-gray-600">Increase grocery module promotion</p>
                    </div>
                    <div className="bg-white p-4 rounded border-l-4 border-red-500">
                      <p className="font-medium text-gray-900">Operational</p>
                      <p className="text-sm text-gray-600">Optimize delivery routes for peak hours</p>
                    </div>
                    <div className="bg-white p-4 rounded border-l-4 border-yellow-500">
                      <p className="font-medium text-gray-900">User Experience</p>
                      <p className="text-sm text-gray-600">Improve app loading speed</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "reports" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Generated Reports</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => generateReport("REVENUE")}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                  >
                    Revenue Report
                  </button>
                  <button
                    onClick={() => generateReport("USERS")}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                  >
                    User Report
                  </button>
                  <button
                    onClick={() => generateReport("PERFORMANCE")}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                  >
                    Performance Report
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {reports?.map((report) => (
                  <div key={report.id} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h4 className="font-medium text-gray-900">{report.name}</h4>
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                            {report.type}
                          </span>
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded-full">
                            {report.module}
                          </span>
                        </div>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-600">
                          <span className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(report.dateRange.start).toLocaleDateString()} -{" "}
                            {new Date(report.dateRange.end).toLocaleDateString()}
                          </span>
                          <span className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            Generated {new Date(report.generatedAt).toLocaleDateString()}
                          </span>
                          <span>By {report.generatedBy}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button className="p-2 text-gray-400 hover:text-gray-600">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => exportReport(report.id, "PDF")}
                          className="p-2 text-gray-400 hover:text-gray-600"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
