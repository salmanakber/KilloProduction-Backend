"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  ShoppingCart,
  DollarSign,
  Star,
  Calendar,
  BarChart3,
  Activity,
  Award,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react"

interface WholesalerStats {
  total: number
  verified: number
  pending: number
  active: number
  totalProducts: number
  totalOrders: number
  totalRevenue: number
  averageRating: number
  growth: {
    wholesalers: {
      current: number
      previous: number
      percentage: number
    }
    orders: {
      current: number
      previous: number
      percentage: number
    }
  }
  recentWholesalers: Array<{
    id: string
    companyName: string
    createdAt: string
    isVerified: boolean
  }>
  topWholesalers: Array<{
    id: string
    companyName: string
    rating: number
    totalOrders: number
    _count: {
      wholesalerProducts: number
    }
  }>
  orderStatusStats: Record<string, { count: number; revenue: number }>
  revenueStats: Array<{
    month: string
    order_count: number
    total_revenue: number
  }>
  period: number
  startDate: string
}

export default function WholesalerAnalytics() {
  const [stats, setStats] = useState<WholesalerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState("30")

  useEffect(() => {
    fetchStats()
  }, [period])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/wholesalers/stats?period=${period}`)
      const data = await response.json()
      if (response.ok) {
        setStats(data)
      }
    } catch (error) {
      console.error("Error fetching stats:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">Failed to load analytics data</p>
      </div>
    )
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })
  }

  const getGrowthIcon = (percentage: number) => {
    if (percentage > 0) {
      return <TrendingUp className="h-4 w-4 text-green-500" />
    } else if (percentage < 0) {
      return <TrendingDown className="h-4 w-4 text-red-500" />
    }
    return <Activity className="h-4 w-4 text-gray-500" />
  }

  const getGrowthColor = (percentage: number) => {
    if (percentage > 0) return "text-green-600"
    if (percentage < 0) return "text-red-600"
    return "text-gray-600"
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Wholesaler Analytics</h2>
          <p className="text-muted-foreground">
            Comprehensive insights into wholesaler performance and trends
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-sm text-muted-foreground">Period:</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Wholesalers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              {getGrowthIcon(stats.growth.wholesalers.percentage)}
              <span className={getGrowthColor(stats.growth.wholesalers.percentage)}>
                {stats.growth.wholesalers.percentage > 0 ? "+" : ""}
                {stats.growth.wholesalers.percentage.toFixed(1)}%
              </span>
              <span>vs previous period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              Across all wholesalers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <div className="flex items-center space-x-2 text-xs text-muted-foreground">
              {getGrowthIcon(stats.growth.orders.percentage)}
              <span className={getGrowthColor(stats.growth.orders.percentage)}>
                {stats.growth.orders.percentage > 0 ? "+" : ""}
                {stats.growth.orders.percentage.toFixed(1)}%
              </span>
              <span>vs previous period</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              From completed orders
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Status Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
              Verified Wholesalers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.verified}</div>
            <p className="text-sm text-muted-foreground">
              {((stats.verified / stats.total) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Clock className="mr-2 h-5 w-5 text-yellow-500" />
              Pending Verification
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-sm text-muted-foreground">
              {((stats.pending / stats.total) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Star className="mr-2 h-5 w-5 text-blue-500" />
              Average Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">
              {stats.averageRating.toFixed(1)}
            </div>
            <p className="text-sm text-muted-foreground">Out of 5 stars</p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analytics */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Recent Wholesalers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="mr-2 h-5 w-5" />
                  Recent Wholesalers
                </CardTitle>
                <CardDescription>
                  New wholesalers in the last {period} days
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.recentWholesalers.map((wholesaler) => (
                    <div
                      key={wholesaler.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div>
                        <p className="font-medium">{wholesaler.companyName}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(wholesaler.createdAt)}
                        </p>
                      </div>
                      <Badge variant={wholesaler.isVerified ? "default" : "secondary"}>
                        {wholesaler.isVerified ? "Verified" : "Pending"}
                      </Badge>
                    </div>
                  ))}
                  {stats.recentWholesalers.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">
                      No new wholesalers in this period
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Performers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Award className="mr-2 h-5 w-5" />
                  Top Performing Wholesalers
                </CardTitle>
                <CardDescription>
                  Based on orders and ratings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.topWholesalers.map((wholesaler, index) => (
                    <div
                      key={wholesaler.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <span className="text-sm font-bold text-green-600">
                            {index + 1}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{wholesaler.companyName}</p>
                          <p className="text-sm text-muted-foreground">
                            {wholesaler.totalOrders} orders • {wholesaler._count.wholesalerProducts} products
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        <span className="font-medium">{wholesaler.rating.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart3 className="mr-2 h-5 w-5" />
                Performance Metrics
              </CardTitle>
              <CardDescription>
                Key performance indicators for wholesalers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {stats.verified}
                  </div>
                  <p className="text-sm text-muted-foreground">Verified Wholesalers</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.totalProducts}
                  </div>
                  <p className="text-sm text-muted-foreground">Total Products</p>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {stats.averageRating.toFixed(1)}
                  </div>
                  <p className="text-sm text-muted-foreground">Average Rating</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShoppingCart className="mr-2 h-5 w-5" />
                Order Statistics
              </CardTitle>
              <CardDescription>
                Breakdown of orders by status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Object.entries(stats.orderStatusStats).map(([status, data]) => (
                  <div key={status} className="text-center p-4 border rounded-lg">
                    <div className="text-2xl font-bold">{data.count}</div>
                    <p className="text-sm text-muted-foreground capitalize">
                      {status.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(data.revenue)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <DollarSign className="mr-2 h-5 w-5" />
                Revenue Trends
              </CardTitle>
              <CardDescription>
                Monthly revenue breakdown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.revenueStats.map((monthData) => (
                  <div
                    key={monthData.month}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">
                        {new Date(monthData.month).toLocaleDateString("en-US", {
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {monthData.order_count} orders
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {formatCurrency(monthData.total_revenue)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
