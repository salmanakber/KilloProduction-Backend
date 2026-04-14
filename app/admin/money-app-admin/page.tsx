"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Loader2,
} from "lucide-react"

interface MoneyTransferStats {
  totalTransfers: number
  totalAmount: number
  totalNGNAmount: number
  totalCommission: number
  pendingTransfers: number
  processingTransfers: number
  completedTransfers: number
  failedTransfers: number
  todayTransfers: number
  todayAmount: number
  monthlyGrowth: number
}

export default function MoneyTransferDashboard() {
  const [stats, setStats] = useState<MoneyTransferStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/admin/money-app-admin/transactions?limit=1")
      const data = await response.json()
      
      // Calculate stats from transactions
      // In production, create a dedicated stats endpoint
      const transactionsResponse = await fetch("/api/admin/money-app-admin/transactions?limit=1000")
      const transactionsData = await transactionsResponse.json()
      
      const transactions = transactionsData.transfers || []
      const totalAmount = transactions.reduce((sum: number, t: any) => sum + (t.amount || 0), 0)
      const totalNGNAmount = transactions.reduce((sum: number, t: any) => sum + (t.ngnAmount || 0), 0)
      const pending = transactions.filter((t: any) => t.status === "PENDING").length
      const processing = transactions.filter((t: any) => t.status === "PROCESSING").length
      const completed = transactions.filter((t: any) => t.status === "COMPLETED").length
      const failed = transactions.filter((t: any) => t.status === "FAILED").length
      
      // Calculate commission (simplified - should come from commission records)
      const totalCommission = totalAmount * 0.02 // 2% default
      
      setStats({
        totalTransfers: transactions.length,
        totalAmount,
        totalNGNAmount,
        totalCommission,
        pendingTransfers: pending,
        processingTransfers: processing,
        completedTransfers: completed,
        failedTransfers: failed,
        todayTransfers: 0, // Calculate from date
        todayAmount: 0,
        monthlyGrowth: 0,
      })
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Money Transfer Dashboard</h1>
        <p className="text-gray-600 mt-1">Monitor and manage money transfers</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transfers</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTransfers || 0}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Volume</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats?.totalAmount.toFixed(2) || "0.00"}</div>
            <p className="text-xs text-muted-foreground">
              ₦{stats?.totalNGNAmount.toFixed(2) || "0.00"} NGN
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Commission</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${stats?.totalCommission.toFixed(2) || "0.00"}</div>
            <p className="text-xs text-muted-foreground">Platform earnings</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Transfers</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.todayTransfers || 0}</div>
            <p className="text-xs text-muted-foreground">${stats?.todayAmount.toFixed(2) || "0.00"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingTransfers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.processingTransfers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completedTransfers || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.failedTransfers || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = "/admin/money-app-admin/transactions"}>
          <CardHeader>
            <CardTitle className="text-lg">View All Transactions</CardTitle>
            <CardDescription>See complete transaction history</CardDescription>
          </CardHeader>
          <CardContent>
            <ArrowUpRight className="h-6 w-6 text-green-600" />
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = "/admin/money-app-admin/payouts"}>
          <CardHeader>
            <CardTitle className="text-lg">Manage Payouts</CardTitle>
            <CardDescription>Monitor and retry failed payouts</CardDescription>
          </CardHeader>
          <CardContent>
            <ArrowDownRight className="h-6 w-6 text-blue-600" />
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => window.location.href = "/admin/money-app-admin/config"}>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
            <CardDescription>Update settings and API keys</CardDescription>
          </CardHeader>
          <CardContent>
            <Activity className="h-6 w-6 text-purple-600" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
