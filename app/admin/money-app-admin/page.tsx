"use client"

import { useState, useEffect } from "react"
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle,
  XCircle,
  Activity,
  Loader2,
  Settings,
  List
} from "lucide-react"

interface MoneyTransferStats {
  reportingCurrency: string
  totalTransfers: number
  totalVolumeBase: number
  totalFeeBase: number
  totalFxMarginBase: number
  totalPlatformRevenueBase: number
  taxableEarningsBase: number
  pendingTransfers: number
  processingTransfers: number
  settledTransfers: number
  failedTransfers: number
  todayTransfers: number
  todayVolumeBase: number
  todayPlatformRevenueBase: number
}

export default function MoneyTransferDashboard() {
  const [stats, setStats] = useState<MoneyTransferStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/admin/money-app-admin/stats")
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to load stats")
      }
      setStats({
        reportingCurrency: data.reportingCurrency,
        totalTransfers: data.totalTransfers,
        totalVolumeBase: data.totalVolumeBase,
        totalFeeBase: data.totalFeeBase,
        totalFxMarginBase: data.totalFxMarginBase,
        totalPlatformRevenueBase: data.totalPlatformRevenueBase,
        taxableEarningsBase: data.taxableEarningsBase,
        pendingTransfers: data.pendingTransfers,
        processingTransfers: data.processingTransfers,
        settledTransfers: data.settledTransfers,
        failedTransfers: data.failedTransfers,
        todayTransfers: data.todayTransfers,
        todayVolumeBase: data.todayVolumeBase,
        todayPlatformRevenueBase: data.todayPlatformRevenueBase,
      })
    } catch (error) {
      console.error("Failed to fetch stats:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
        <p className="text-sm font-medium text-slate-500">Syncing transfer data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Money Transfer Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor and manage money transfers across the network.</p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-50 px-4 py-2 rounded-xl border border-teal-100">
          <Activity className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-bold text-teal-700">Live Status</span>
        </div>
      </div>

      {/* STATS GRID (TOP 4) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Total Transfers */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-slate-50 group-hover:bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-teal-100">
              <List className="h-6 w-6 text-slate-600 group-hover:text-teal-600 transition-colors" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Transfers</p>
            <p className="text-3xl font-black text-slate-900">{stats?.totalTransfers || 0}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">All time transactions</p>
          </div>
        </div>

        {/* Card 2: Total Volume (Custom Primary Gradient) */}
        <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-6 rounded-2xl shadow-md border border-[#0f766e]/20 group relative overflow-hidden">
          {/* Subtle background flair */}
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl"></div>
          
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <TrendingUp className="h-6 w-6 text-[#2dd4bf]" />
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-sm font-semibold text-teal-100 uppercase tracking-wider mb-1">Total Volume</p>
            <p className="text-3xl font-black text-white">
              {(stats?.totalVolumeBase ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-lg font-bold text-teal-200">{stats?.reportingCurrency}</span>
            </p>
            <p className="text-xs text-teal-100/70 mt-2 font-medium">Sum of base amount (proc. + sent + comp.)</p>
          </div>
        </div>

        {/* Card 3: Platform Revenue */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-emerald-50 transition-colors rounded-xl flex items-center justify-center border border-emerald-100">
              <DollarSign className="h-6 w-6 text-emerald-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Platform Revenue</p>
            <p className="text-3xl font-black text-slate-900">
              {(stats?.totalPlatformRevenueBase ?? 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}{" "}
              <span className="text-lg font-bold text-slate-400">{stats?.reportingCurrency}</span>
            </p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Fees + FX margin (feeBase + fxMarginBase)</p>
          </div>
        </div>

        {/* Card 4: Today's Transfers */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-blue-50 transition-colors rounded-xl flex items-center justify-center border border-blue-100">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex items-center px-2 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
              Today
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Today's Transfers</p>
            <p className="text-3xl font-black text-slate-900">{stats?.todayTransfers || 0}</p>
            <div className="text-xs text-slate-500 mt-2 font-medium leading-relaxed">
              Vol: <span className="font-bold text-slate-700">{(stats?.todayVolumeBase ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {stats?.reportingCurrency}</span>
              <br/>
              Rev: <span className="font-bold text-emerald-600">{(stats?.todayPlatformRevenueBase ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {stats?.reportingCurrency}</span>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS CARDS */}
      <div>
        <h3 className="text-lg font-bold text-slate-900 mb-4">Transfer Lifecycle</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-amber-200 transition-colors">
            <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
              <Clock className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats?.pendingTransfers || 0}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-blue-200 transition-colors">
            <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
              <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Processing</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats?.processingTransfers || 0}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-teal-200 transition-colors">
            <div className="h-12 w-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Settled</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats?.settledTransfers ?? 0}</p>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 hover:border-rose-200 transition-colors">
            <div className="h-12 w-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center">
              <XCircle className="h-6 w-6 text-rose-500" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">{stats?.failedTransfers || 0}</p>
            </div>
          </div>

        </div>
      </div>

      {/* QUICK ACTIONS */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-900 mb-6">Quick Management</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          <div 
            onClick={() => window.location.href = "/admin/money-app-admin/transactions"}
            className="group flex items-center p-5 rounded-2xl border border-slate-200 hover:border-teal-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer bg-white"
          >
            <div className="h-12 w-12 rounded-full bg-teal-50 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform duration-200">
              <ArrowUpRight className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">View Transactions</h4>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">See complete transaction history</p>
            </div>
          </div>

          <div 
            onClick={() => window.location.href = "/admin/money-app-admin/payouts"}
            className="group flex items-center p-5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer bg-white"
          >
            <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform duration-200">
              <ArrowDownRight className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Manage Payouts</h4>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Monitor & retry failed payouts</p>
            </div>
          </div>

          <div 
            onClick={() => window.location.href = "/admin/money-app-admin/config"}
            className="group flex items-center p-5 rounded-2xl border border-slate-200 hover:border-purple-300 hover:shadow-md hover:-translate-y-1 transition-all duration-200 cursor-pointer bg-white"
          >
            <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center mr-4 group-hover:scale-110 transition-transform duration-200">
              <Settings className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">Configuration</h4>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">Update settings and API keys</p>
            </div>
          </div>

        </div>
      </div>
      
    </div>
  )
}