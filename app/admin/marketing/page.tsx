"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts"
import {
  TrendingUp,
  Target,
  DollarSign,
  Activity,
  Plus,
  Download,
  Send,
  Eye,
  Edit,
  Trash2,
  Users,
  Calendar,
  Mail,
  MessageSquare,
  Smartphone,
  Play,
  Pause,
  BarChart3,
  Search,
  RefreshCw,
  Sparkles,
  Loader2,
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle
} from "lucide-react"

// Interfaces remain identical
interface MarketingStats {
  campaigns: {
    totalCampaigns: number
    activeCampaigns: number
    completedCampaigns: number
    draftCampaigns: number
    scheduledCampaigns: number
    pausedCampaigns: number
    totalSent: number
    totalDelivered: number
    totalOpened: number
    totalClicked: number
    totalConverted: number
    totalRevenue: number
    deliveryRate: number
    openRate: number
    clickRate: number
    conversionRate: number
    revenuePerCampaign: number
  }
  engagement: {
    uniqueUsers: number
    totalEvents: number
    avgEventsPerUser: number
    eventsByType: Record<string, number>
    dailyEngagement: Array<{ date: string; events: number; users: number }>
    topPages: Array<{ page: string; views: number; uniqueUsers: number }>
    sessionDuration: number
    bounceRate: number
  }
  conversions: {
    totalOrders: number
    completedOrders: number
    totalRevenue: number
    avgOrderValue: number
    completionRate: number
    dailyConversions: Array<{ date: string; orders: number; revenue: number; conversions: number }>
    topProducts: Array<{ product: string; orders: number; revenue: number }>
    conversionFunnel: Array<{ stage: string; users: number; rate: number }>
  }
  segments: {
    totalSegments: number
    activeSegments: number
    totalMembers: number
    avgMembersPerSegment: number
    segmentTypes: Record<string, number>
    topSegments: Array<{ name: string; members: number; engagement: number; revenue: number }>
    segmentPerformance: Array<{ segment: string; openRate: number; clickRate: number; conversionRate: number }>
  }
  automation: {
    totalRules: number
    activeRules: number
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    successRate: number
    topTriggers: Array<{ trigger: string; executions: number; successRate: number }>
    recentExecutions: Array<{ rule: string; trigger: string; status: string; timestamp: string }>
  }
}

interface Campaign {
  id: string
  name: string
  type: "PROMO" | "LOYALTY" | "FLASH_SALE" | "PROMOTIONAL" | "CUSTOM"
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "RUNNING" | "COMPLETED" | "PAUSED" | "CANCELLED"
  startDate?: string | null
  endDate?: string | null
  timezone?: string
  targetAudience: {
    userType: string[]
    modules: string[]
    segments: string[]
    location?: string[]
    totalUsers: number
  }
  channels: ("PUSH" | "EMAIL" | "SMS")[]
  content: {
    title: string
    message: string
    imageUrl?: string
    actionUrl?: string
    ctaText?: string
  }
  schedule: {
    startDate: string
    endDate?: string
    timezone: string
    frequency?: "ONCE" | "HOURLY" | "DAILY" | "CUSTOM_DAYS"
    customEveryDays?: number
  }
  metrics: {
    sent: number
    delivered: number
    opened: number
    clicked: number
    converted: number
    revenue: number
    unsubscribed: number
    bounced: number
  }
  abTest?: {
    enabled: boolean
    variants: Array<{
      name: string
      percentage: number
      content: {
        title: string
        message: string
        ctaText?: string
      }
    }>
  }
  createdAt: string
  updatedAt: string
  createdBy: string
}

interface Segment {
  id: string
  name: string
  description: string
  type: "BEHAVIORAL" | "DEMOGRAPHIC" | "TRANSACTIONAL" | "ENGAGEMENT"
  criteria: {
    userType?: string[]
    modules?: string[]
    ageRange?: { min: number; max: number }
    location?: string[]
    orderCount?: { min: number; max: number }
    totalSpent?: { min: number; max: number }
    lastOrderDays?: number
    engagementScore?: { min: number; max: number }
    customEvents?: Array<{ event: string; count: number; days: number }>
  }
  memberCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface AutomationRule {
  id: string
  name: string
  description: string
  trigger: {
    type: "USER_SIGNUP" | "ORDER_PLACED" | "CART_ABANDONED" | "INACTIVITY" | "CUSTOM_EVENT"
    conditions: Record<string, any>
    delay?: number
  }
  actions: Array<{
    type: "SEND_EMAIL" | "SEND_PUSH" | "SEND_SMS" | "ADD_TO_SEGMENT" | "ASSIGN_COUPON"
    config: Record<string, any>
  }>
  isActive: boolean
  executionCount: number
  successCount: number
  failureCount: number
  createdAt: string
  updatedAt: string
}

interface MarketingHealth {
  marketingAiEnabled: boolean
  marketingIntervalMs: number
  catchupIntervalMs: number
  dailyCap: number
  runCap: number
  sentToday: number
  remainingToday: number
  latestTick: {
    at: string
    sent: number
    skipped: string
    candidates: number
  } | null
  scheduledCampaigns: {
    dueNow: number
    future: number
  }
}

import { CreateCampaignForm } from "@/components/CreateCampaignForm"
import { CreateSegmentForm } from "@/components/CreateSegmentForm"
import { CreateAutomationRuleForm } from "@/components/CreateAutomationRuleForm"

// Updated Brand Palette for Charts
const COLORS = ["#14b8a6", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#10b981", "#6366f1"]

export default function MarketingDashboard() {
  const [stats, setStats] = useState<MarketingStats | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([])
  const [marketingHealth, setMarketingHealth] = useState<MarketingHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState("30")
  const [activeTab, setActiveTab] = useState("overview")
  const [showCreateCampaign, setShowCreateCampaign] = useState(false)
  const [showCreateSegment, setShowCreateSegment] = useState(false)
  const [showCreateAutomation, setShowCreateAutomation] = useState(false)
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false)
  const [scheduleDraft, setScheduleDraft] = useState<{
    id: string
    start: string
    end: string
    timezone: string
    frequency: "ONCE" | "HOURLY" | "DAILY" | "CUSTOM_DAYS"
    customEveryDays: string
  }>({ id: "", start: "", end: "", timezone: "UTC", frequency: "ONCE", customEveryDays: "2" })
  const [savingSchedule, setSavingSchedule] = useState(false)

  // Search and filter states
  const [campaignSearch, setCampaignSearch] = useState("")
  const [campaignFilter, setCampaignFilter] = useState("all")
  const [segmentSearch, setSegmentSearch] = useState("")
  const [segmentFilter, setSegmentFilter] = useState("all")

  useEffect(() => {
    fetchAllData()
  }, [period])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchMarketingStats(), fetchCampaigns(), fetchSegments(), fetchAutomationRules()])
      await fetchMarketingHealth()
    } catch (error) {
      console.error("Error fetching marketing data:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchMarketingStats = async () => {
    try {
      const response = await fetch(`/api/marketing/analytics/dashboard?period=${period}`, {
        credentials: "include",
      })
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error("Error fetching marketing stats:", error)
    }
  }

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/marketing/campaigns", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error("Error fetching campaigns:", error)
    }
  }

  const fetchSegments = async () => {
    try {
      const response = await fetch("/api/marketing/segments", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setSegments(data.segments || [])
      }
    } catch (error) {
      console.error("Error fetching segments:", error)
    }
  }

  const fetchAutomationRules = async () => {
    try {
      const response = await fetch("/api/marketing/automation/rules", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setAutomationRules(data.rules || [])
      }
    } catch (error) {
      console.error("Error fetching automation rules:", error)
    }
  }

  const fetchMarketingHealth = async () => {
    try {
      const response = await fetch("/api/admin/marketing/health", { credentials: "include" })
      if (response.ok) {
        const data = await response.json()
        setMarketingHealth(data.health || null)
      }
    } catch (error) {
      console.error("Error fetching marketing health:", error)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAllData()
    setRefreshing(false)
  }

  const handleCampaignAction = async (campaignId: string, action: string) => {
    try {
      const response = await fetch(`/api/marketing/campaigns/${campaignId}/${action}`, {
        method: "POST",
        credentials: "include",
      })
      if (response.ok) {
        await fetchCampaigns()
        await fetchMarketingStats()
      }
    } catch (error) {
      console.error(`Error ${action} campaign:`, error)
    }
  }

  const handleLaunchCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/marketing/campaigns/${campaignId}/launch`, {
        method: "POST",
        credentials: "include",
      })
      if (response.ok) {
        await fetchCampaigns()
        await fetchMarketingStats()
      }
    } catch (error) {
      console.error("Error launching campaign:", error)
    }
  }

  const saveSchedule = async () => {
    if (!scheduleDraft.id) return
    setSavingSchedule(true)
    try {
      const res = await fetch(`/api/marketing/campaigns/${scheduleDraft.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: scheduleDraft.start ? new Date(scheduleDraft.start).toISOString() : null,
          endDate: scheduleDraft.end ? new Date(scheduleDraft.end).toISOString() : null,
          timezone: scheduleDraft.timezone || "UTC",
          schedule: {
            startDate: scheduleDraft.start ? new Date(scheduleDraft.start).toISOString() : null,
            endDate: scheduleDraft.end ? new Date(scheduleDraft.end).toISOString() : null,
            timezone: scheduleDraft.timezone || "UTC",
            frequency: scheduleDraft.frequency,
            customEveryDays:
              scheduleDraft.frequency === "CUSTOM_DAYS"
                ? Math.max(1, Number(scheduleDraft.customEveryDays || "1"))
                : undefined,
          },
        }),
      })
      if (res.ok) {
        setScheduleEditorOpen(false)
        await fetchCampaigns()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSavingSchedule(false)
    }
  }

  // Refined Color Mappings for Premium UI
  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
      case "RUNNING":
        return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "SCHEDULED":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "COMPLETED":
        return "bg-slate-100 text-slate-700 border-slate-200"
      case "PAUSED":
        return "bg-amber-50 text-amber-700 border-amber-200"
      case "DRAFT":
        return "bg-purple-50 text-purple-700 border-purple-200"
      default:
        return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "PROMO":
        return "bg-amber-50 text-amber-700 border-amber-200"
      case "LOYALTY":
        return "bg-indigo-50 text-indigo-700 border-indigo-200"
      case "FLASH_SALE":
        return "bg-rose-50 text-rose-700 border-rose-200"
      case "PROMOTIONAL":
        return "bg-sky-50 text-sky-700 border-sky-200"
      case "CUSTOM":
        return "bg-teal-50 text-teal-700 border-teal-200"
      default:
        return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch = campaign.name.toLowerCase().includes(campaignSearch.toLowerCase())
    const matchesFilter =
      campaignFilter === "all" ||
      campaign.status === campaignFilter ||
      (campaignFilter === "ACTIVE" && campaign.status === "RUNNING")
    return matchesSearch && matchesFilter
  })

  const filteredSegments = segments.filter((segment) => {
    const matchesSearch = segment.name.toLowerCase().includes(segmentSearch.toLowerCase())
    const matchesFilter = segmentFilter === "all" || segment.type === segmentFilter
    return matchesSearch && matchesFilter
  })

  const eventsData = Object.entries(stats?.engagement?.eventsByType || {}).map(([name, value]) => ({
    name,
    value,
  }))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
        <p className="text-sm font-medium text-slate-500">Syncing marketing intelligence...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-rose-50 rounded-2xl border border-rose-200 shadow-sm">
        <AlertCircle className="h-8 w-8 text-rose-500 mb-4" />
        <p className="text-sm font-bold text-rose-800">Connection Error</p>
        <p className="text-sm font-medium text-rose-600/80 mt-1">Failed to load marketing data. Please refresh.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* PREMIUM GRADIENT HEADER */}
      <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-8 rounded-3xl shadow-lg relative overflow-hidden flex flex-col lg:flex-row lg:items-center justify-between border border-[#0f766e]/20">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-10 bottom-0 h-32 w-32 rounded-full bg-teal-400/10 blur-3xl"></div>
        
        <div className="relative z-10 flex items-center gap-5">
          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
            <Sparkles className="h-8 w-8 text-teal-300" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Marketing Intelligence</h1>
            <p className="text-teal-100/80 mt-1.5 font-medium max-w-md">Comprehensive analytics and AI-driven campaign management.</p>
          </div>
        </div>

        <div className="relative z-10 mt-6 lg:mt-0 flex flex-wrap gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] bg-white/10 border-white/20 text-white hover:bg-white/20 transition-colors">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button 
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white transition-all"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button className="bg-teal-500 hover:bg-teal-400 text-white shadow-lg hover:shadow-teal-500/25 border-none transition-all">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* AI Automation Notice Card */}
      <div className="bg-gradient-to-r from-teal-50 to-slate-50 p-6 rounded-2xl shadow-sm border border-teal-100 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-teal-400/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none"></div>
        <div className="relative z-10 flex gap-4">
          <div className="mt-1">
            <div className="h-10 w-10 bg-teal-100 rounded-full flex items-center justify-center border border-teal-200 shadow-sm">
              <Zap className="h-5 w-5 text-teal-600" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Automated AI Campaigns Engine</h3>
            <p className="text-sm text-slate-600 mt-1 max-w-4xl leading-relaxed font-medium">
              The background worker runs on a schedule to score user activity (cart adds, views, purchases, searches). It excludes recently notified users, and optionally utilizes <strong>Advanced AI Analysis</strong> to optimize send times and content. Enable or disable in settings.
            </p>
          </div>
        </div>
      </div>

      {marketingHealth ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="h-5 w-5 text-blue-500" />
            <div>
              <h3 className="text-lg font-bold text-slate-900">Backend Marketing Runtime</h3>
              <p className="text-xs text-slate-500 font-medium">Live backend visibility for automation ticks and limits.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">AI Marketing</p>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${marketingHealth.marketingAiEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                <p className="text-base font-bold text-slate-900">{marketingHealth.marketingAiEnabled ? "Enabled" : "Disabled"}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Daily Cap Usage</p>
              <p className="text-base font-bold text-slate-900">
                {marketingHealth.sentToday} / {marketingHealth.dailyCap}
              </p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Remaining</p>
              <p className="text-base font-bold text-teal-600">{marketingHealth.remainingToday}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Per Run Cap</p>
              <p className="text-base font-bold text-slate-900">{marketingHealth.runCap}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Due Now</p>
              <p className="text-base font-bold text-amber-600">{marketingHealth.scheduledCampaigns.dueNow}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Future</p>
              <p className="text-base font-bold text-blue-600">{marketingHealth.scheduledCampaigns.future}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 lg:col-span-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Last Automation Tick</p>
                <p className="text-sm font-bold text-slate-900">
                  {marketingHealth.latestTick
                    ? `${new Date(marketingHealth.latestTick.at).toLocaleString()} (Sent: ${marketingHealth.latestTick.sent} | Skipped: ${marketingHealth.latestTick.skipped})`
                    : "No automation tick recorded yet"}
                </p>
              </div>
              <Clock className="h-5 w-5 text-slate-300" />
            </div>
          </div>
        </div>
      ) : null}

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            title: "Active Campaigns",
            value: stats.campaigns.activeCampaigns,
            subtitle: `${stats.campaigns.totalCampaigns} total • ${stats.campaigns.scheduledCampaigns} scheduled`,
            icon: Target,
            iconBg: "bg-teal-50",
            iconColor: "text-teal-600"
          },
          {
            title: "Engagement Rate",
            value: `${stats.campaigns.openRate.toFixed(1)}%`,
            subtitle: `${stats.campaigns.totalOpened.toLocaleString()} opens • ${stats.campaigns.clickRate.toFixed(1)}% CTR`,
            icon: Activity,
            iconBg: "bg-blue-50",
            iconColor: "text-blue-600"
          },
          {
            title: "Conversion Rate",
            value: `${stats.campaigns.conversionRate.toFixed(1)}%`,
            subtitle: `${stats.campaigns.totalConverted.toLocaleString()} conversions`,
            icon: TrendingUp,
            iconBg: "bg-emerald-50",
            iconColor: "text-emerald-600"
          },
          {
            title: "Revenue Generated",
            value: `$${stats.campaigns.totalRevenue.toLocaleString()}`,
            subtitle: `$${stats.campaigns.revenuePerCampaign.toFixed(0)} avg per campaign`,
            icon: DollarSign,
            iconBg: "bg-amber-50",
            iconColor: "text-amber-600"
          },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className={`h-12 w-12 ${stat.iconBg} rounded-xl flex items-center justify-center border border-white/50 group-hover:scale-110 transition-transform`}>
                <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">{stat.title}</p>
              <p className="text-3xl font-black text-slate-900">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-2 font-medium">{stat.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* MAIN CONTENT TABS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm inline-block w-full overflow-x-auto">
          <TabsList className="bg-transparent space-x-1 h-auto p-0 flex w-max min-w-full">
            {["overview", "campaigns", "segments", "automation", "analytics", "behavior"].map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                className="px-6 py-2.5 rounded-xl capitalize data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 data-[state=active]:shadow-none data-[state=active]:font-bold text-slate-500 font-medium transition-all flex-1 min-w-[120px]"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 animate-in fade-in duration-500 outline-none mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Campaign Performance Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Campaign Funnel</h3>
                <p className="text-sm text-slate-500">From delivery to conversion</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={[
                    { name: "Sent", value: stats.campaigns.totalSent, rate: 100 },
                    { name: "Delivered", value: stats.campaigns.totalDelivered, rate: stats.campaigns.deliveryRate },
                    { name: "Opened", value: stats.campaigns.totalOpened, rate: stats.campaigns.openRate },
                    { name: "Clicked", value: stats.campaigns.totalClicked, rate: stats.campaigns.clickRate },
                    { name: "Converted", value: stats.campaigns.totalConverted, rate: stats.campaigns.conversionRate },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                    formatter={(value: any, name: any) => [
                      name === "value" ? value.toLocaleString() : `${Number(value).toFixed(1)}%`,
                      name === "value" ? "Count" : "Rate",
                    ]}
                  />
                  <Bar dataKey="value" fill="#14b8a6" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue Trend */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Revenue & Conversions</h3>
                <p className="text-sm text-slate-500">Daily performance trends</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={Array.isArray(stats?.conversions?.dailyConversions) ? stats.conversions.dailyConversions : []}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#14b8a6" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                  <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: "#3b82f6" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Active Segments", value: stats.segments.activeSegments, icon: Users, color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Automation Rules", value: stats.automation.activeRules, icon: BarChart3, color: "text-teal-600", bg: "bg-teal-50" },
              { label: "Unique Users", value: stats.engagement.uniqueUsers.toLocaleString(), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Success Rate", value: `${stats.automation.successRate.toFixed(1)}%`, icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
            ].map((stat, idx) => (
              <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between hover:border-teal-200 transition-colors">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                </div>
                <div className={`h-12 w-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* CAMPAIGNS TAB */}
        <TabsContent value="campaigns" className="space-y-6 animate-in fade-in duration-500 mt-0 outline-none">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-teal-600" />
                <h3 className="text-lg font-bold text-slate-900">Campaign Manager</h3>
              </div>
              <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <Input
                    placeholder="Search campaigns..."
                    value={campaignSearch}
                    onChange={(e) => setCampaignSearch(e.target.value)}
                    className="pl-10 h-10 border-slate-200 focus-visible:ring-teal-500 rounded-xl"
                  />
                </div>
                <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                  <SelectTrigger className="w-[160px] h-10 border-slate-200 focus:ring-teal-500 rounded-xl">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active / Running</SelectItem>
                    <SelectItem value="RUNNING">Running</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="PAUSED">Paused</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => setShowCreateCampaign(true)} className="bg-teal-600 hover:bg-teal-700 text-white h-10 rounded-xl px-5">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              {filteredCampaigns.map((campaign) => (
                <div key={campaign.id} className="p-5 rounded-2xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all group bg-white">
                  <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
                    <div className="flex-1 w-full">
                      
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-slate-900">{campaign.name}</h3>
                        <Badge variant="outline" className={`font-bold border ${getStatusColor(campaign.status)}`}>{campaign.status}</Badge>
                        <Badge variant="outline" className={`font-bold border ${getTypeColor(campaign.type)}`}>{campaign.type.replace("_", " ")}</Badge>
                        {campaign.abTest?.enabled && <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold">A/B Test</Badge>}
                      </div>

                      <p className="text-slate-500 text-sm mb-4 max-w-3xl line-clamp-2">
                        {campaign.content?.message || "No content provided."}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5">
                        <div className="flex items-center text-sm font-medium text-slate-600">
                          <Users className="h-4 w-4 mr-2 text-slate-400" />
                          <span className="font-bold text-slate-900 mr-1">{campaign.targetAudience?.totalUsers?.toLocaleString()}</span> Targets
                        </div>
                        <div className="flex items-center text-sm font-medium text-slate-600">
                          <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                          {campaign.schedule?.startDate
                            ? new Date(campaign.schedule.startDate).toLocaleDateString()
                            : campaign.startDate
                              ? new Date(campaign.startDate).toLocaleDateString()
                              : "No Date"}
                        </div>
                        <div className="flex items-center gap-1">
                          {campaign.channels.includes("PUSH") && <div className="bg-blue-50 p-1.5 rounded-lg border border-blue-100" title="Push"><Smartphone className="h-3.5 w-3.5 text-blue-600" /></div>}
                          {campaign.channels.includes("EMAIL") && <div className="bg-teal-50 p-1.5 rounded-lg border border-teal-100" title="Email"><Mail className="h-3.5 w-3.5 text-teal-600" /></div>}
                          {campaign.channels.includes("SMS") && <div className="bg-purple-50 p-1.5 rounded-lg border border-purple-100" title="SMS"><MessageSquare className="h-3.5 w-3.5 text-purple-600" /></div>}
                        </div>
                        <div className="flex items-center text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-100 lg:ml-auto">
                          <DollarSign className="h-4 w-4 mr-1" />
                          {campaign.metrics?.revenue?.toLocaleString()} Rev
                        </div>
                      </div>

                      {/* Campaign Metrics Bar */}
                      <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100 overflow-x-auto">
                        <div className="pr-4 border-r border-slate-200 min-w-max">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Sent</p>
                          <p className="text-lg font-bold text-slate-900">{campaign.metrics?.sent?.toLocaleString() || 0}</p>
                        </div>
                        <div className="pr-4 border-r border-slate-200 min-w-max">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Delivered</p>
                          <p className="text-lg font-bold text-slate-900">{campaign.metrics?.delivered?.toLocaleString() || 0}</p>
                        </div>
                        <div className="pr-4 border-r border-slate-200 min-w-max">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Opened</p>
                          <p className="text-lg font-bold text-slate-900">{campaign.metrics?.opened?.toLocaleString() || 0}</p>
                        </div>
                        <div className="pr-4 border-r border-slate-200 min-w-max">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Clicked</p>
                          <p className="text-lg font-bold text-teal-600">{campaign.metrics?.clicked?.toLocaleString() || 0}</p>
                        </div>
                        <div className="pr-4 border-r border-slate-200 min-w-max">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Converted</p>
                          <p className="text-lg font-bold text-emerald-600">{campaign.metrics?.converted?.toLocaleString() || 0}</p>
                        </div>
                        <div className="min-w-max">
                          <p className="text-xs font-semibold text-slate-500 uppercase">Unsub</p>
                          <p className="text-lg font-bold text-rose-500">{campaign.metrics?.unsubscribed?.toLocaleString() || 0}</p>
                        </div>
                      </div>
                    </div>

                    {/* Actions Column */}
                    <div className="flex lg:flex-col items-center gap-2 bg-white lg:bg-transparent lg:border-none border border-slate-100 p-2 lg:p-0 rounded-xl w-full lg:w-auto">
                      <Button variant="outline" size="sm" className="w-full justify-start text-slate-600 hover:text-teal-700 hover:bg-teal-50 border-slate-200" onClick={() => setSelectedCampaign(campaign)}>
                        <Eye className="h-4 w-4 mr-2" /> View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start text-slate-600 hover:text-blue-700 hover:bg-blue-50 border-slate-200"
                        onClick={() => {
                          const startRaw = campaign.schedule?.startDate || campaign.startDate
                          const endRaw = campaign.schedule?.endDate || campaign.endDate
                          const toLocalInput = (iso: string | undefined | null) => {
                            if (!iso) return ""
                            const d = new Date(iso)
                            if (Number.isNaN(d.getTime())) return ""
                            const pad = (n: number) => String(n).padStart(2, "0")
                            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                          }
                          setScheduleDraft({
                            id: campaign.id,
                            start: toLocalInput(typeof startRaw === "string" ? startRaw : startRaw ?? undefined),
                            end: toLocalInput(typeof endRaw === "string" ? endRaw : endRaw ?? undefined),
                            timezone: campaign.schedule?.timezone || campaign.timezone || "UTC",
                            frequency: (campaign.schedule?.frequency as any) || "ONCE",
                            customEveryDays: String((campaign.schedule as any)?.customEveryDays || "2"),
                          })
                          setScheduleEditorOpen(true)
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" /> Schedule
                      </Button>
                      {campaign.status === "DRAFT" && (
                        <Button variant="outline" size="sm" className="w-full justify-start text-emerald-700 hover:bg-emerald-50 border-emerald-200 bg-emerald-50/50" onClick={() => handleLaunchCampaign(campaign.id)}>
                          <Send className="h-4 w-4 mr-2" /> Launch
                        </Button>
                      )}
                      {campaign.status === "ACTIVE" || campaign.status === "RUNNING" ? (
                        <Button variant="outline" size="sm" className="w-full justify-start text-amber-700 hover:bg-amber-50 border-amber-200 bg-amber-50/50" onClick={() => handleCampaignAction(campaign.id, "pause")}>
                          <Pause className="h-4 w-4 mr-2" /> Pause
                        </Button>
                      ) : campaign.status === "PAUSED" ? (
                        <Button variant="outline" size="sm" className="w-full justify-start text-emerald-700 hover:bg-emerald-50 border-emerald-200 bg-emerald-50/50" onClick={() => handleCampaignAction(campaign.id, "resume")}>
                          <Play className="h-4 w-4 mr-2" /> Resume
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" className="w-full justify-start text-slate-400 hover:text-rose-600 hover:bg-rose-50 mt-auto">
                        <Trash2 className="h-4 w-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              
              {filteredCampaigns.length === 0 && (
                <div className="text-center py-16 border border-slate-200 rounded-2xl bg-slate-50 border-dashed">
                  <div className="h-12 w-12 bg-white rounded-xl flex items-center justify-center border border-slate-200 mx-auto mb-4">
                    <Search className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-base font-semibold text-slate-900">No campaigns found</p>
                  <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or search query.</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* SEGMENTS TAB */}
        <TabsContent value="segments" className="space-y-6 animate-in fade-in duration-500 mt-0 outline-none">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-teal-600" />
                <h3 className="text-lg font-bold text-slate-900">Audience Segments</h3>
              </div>
              <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <Input
                    placeholder="Search segments..."
                    value={segmentSearch}
                    onChange={(e) => setSegmentSearch(e.target.value)}
                    className="pl-10 h-10 border-slate-200 focus-visible:ring-teal-500 rounded-xl"
                  />
                </div>
                <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                  <SelectTrigger className="w-[160px] h-10 border-slate-200 focus:ring-teal-500 rounded-xl">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="BEHAVIORAL">Behavioral</SelectItem>
                    <SelectItem value="DEMOGRAPHIC">Demographic</SelectItem>
                    <SelectItem value="TRANSACTIONAL">Transactional</SelectItem>
                    <SelectItem value="ENGAGEMENT">Engagement</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={() => setShowCreateSegment(true)} className="bg-teal-600 hover:bg-teal-700 text-white h-10 rounded-xl px-5">
                  <Plus className="h-4 w-4 mr-2" />
                  Create
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {filteredSegments.map((segment) => (
                <div key={segment.id} className="p-6 rounded-2xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all group bg-white flex flex-col">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-lg font-bold text-slate-900 line-clamp-1">{segment.name}</h3>
                    <Badge variant="outline" className={segment.isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200 font-bold" : "bg-slate-100 text-slate-500 font-bold"}>
                      {segment.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-2 mb-6 flex-1">{segment.description}</p>
                  
                  <div className="space-y-3 p-4 bg-slate-50 rounded-xl border border-slate-100 mb-6">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Type</span>
                      <Badge variant="outline" className="bg-white font-semibold text-slate-700">{segment.type}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Members</span>
                      <span className="font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-100">{segment.memberCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Created</span>
                      <span className="text-sm font-medium text-slate-700">{new Date(segment.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 justify-end opacity-60 group-hover:opacity-100 transition-opacity mt-auto">
                    <Button variant="outline" size="sm" className="hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 border-slate-200 transition-colors">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border-slate-200 transition-colors">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 border-slate-200 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* AUTOMATION TAB */}
        <TabsContent value="automation" className="space-y-6 animate-in fade-in duration-500 mt-0 outline-none">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-teal-600" />
                <h3 className="text-lg font-bold text-slate-900">Automation Rules</h3>
              </div>
              <Button onClick={() => setShowCreateAutomation(true)} className="bg-teal-600 hover:bg-teal-700 text-white h-10 rounded-xl px-5 w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                Create Rule
              </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {automationRules.map((rule) => (
                <div key={rule.id} className="p-6 rounded-2xl border border-slate-200 hover:border-teal-300 hover:shadow-md transition-all bg-white">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900">{rule.name}</h3>
                      <p className="text-sm text-slate-500 mt-1">{rule.description}</p>
                    </div>
                    <Badge variant="outline" className={rule.isActive ? "bg-teal-50 text-teal-700 border-teal-200 font-bold" : "bg-slate-100 text-slate-500 font-bold"}>
                      {rule.isActive ? "Running" : "Paused"}
                    </Badge>
                  </div>

                  <div className="flex gap-4 items-center mb-6">
                    <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Trigger Event</span>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-amber-100 rounded-lg"><Zap className="h-4 w-4 text-amber-600" /></div>
                        <span className="text-sm font-bold text-slate-800">{rule.trigger.type.replace(/_/g, " ")}</span>
                      </div>
                    </div>
                    <Send className="h-5 w-5 text-slate-300 shrink-0" />
                    <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Actions</span>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-100 rounded-lg"><Target className="h-4 w-4 text-teal-600" /></div>
                        <span className="text-sm font-bold text-slate-800">{rule.actions.length} Task(s)</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <div className="bg-slate-50 p-3 rounded-xl text-center border border-slate-100">
                      <p className="text-2xl font-black text-slate-800">{rule.executionCount.toLocaleString()}</p>
                      <p className="text-xs font-semibold text-slate-500 uppercase mt-1">Runs</p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-xl text-center border border-emerald-100">
                      <p className="text-2xl font-black text-emerald-600">{rule.successCount.toLocaleString()}</p>
                      <p className="text-xs font-semibold text-emerald-700 uppercase mt-1">Success</p>
                    </div>
                    <div className="bg-rose-50 p-3 rounded-xl text-center border border-rose-100">
                      <p className="text-2xl font-black text-rose-600">{rule.failureCount.toLocaleString()}</p>
                      <p className="text-xs font-semibold text-rose-700 uppercase mt-1">Failed</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                    <Button variant="outline" size="sm" className="hover:text-teal-700 hover:bg-teal-50 hover:border-teal-200 border-slate-200">
                      <Eye className="h-4 w-4 mr-2" /> View
                    </Button>
                    <Button variant="outline" size="sm" className="hover:text-blue-700 hover:bg-blue-50 hover:border-blue-200 border-slate-200">
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="space-y-6 animate-in fade-in duration-500 mt-0 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Segment Performance</h3>
                <p className="text-sm text-slate-500">Engagement rates by target audience</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={stats.segments.segmentPerformance}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="segment" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }}
                    formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                  />
                  <Bar dataKey="openRate" fill="#14b8a6" name="Open Rate" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="clickRate" fill="#3b82f6" name="Click Rate" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="conversionRate" fill="#f59e0b" name="Conv. Rate" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Top Converting Products</h3>
                <p className="text-sm text-slate-500">Products driving the most campaign revenue</p>
              </div>
              <div className="space-y-3">
                {stats.conversions?.topProducts?.map((product, index) => (
                  <div key={product.product} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 hover:border-teal-200 hover:bg-teal-50/30 transition-colors bg-slate-50">
                    <div className="flex items-center space-x-4">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm ${index === 0 ? 'bg-amber-100 text-amber-700 border border-amber-200 shadow-sm' : 'bg-white text-slate-500 border border-slate-200'}`}>
                        #{index + 1}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 block">{product.product}</span>
                        <span className="text-xs text-slate-500 font-medium">{product.orders} orders driven</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-lg border border-teal-100">
                        ${product.revenue.toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-teal-50/50 to-transparent pointer-events-none"></div>
            <div className="mb-6">
              <h3 className="text-lg font-bold text-slate-900">Journey Conversion Funnel</h3>
              <p className="text-sm text-slate-500">User flow from initial awareness to final purchase</p>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={Array.isArray(stats.conversions.conversionFunnel) ? stats.conversions.conversionFunnel : []} layout="vertical" margin={{ left: 50, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} tick={{fill: '#0f172a', fontWeight: 'bold'}} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="users" radius={[0, 4, 4, 0]} barSize={32}>
                  { Array.isArray(stats.conversions.conversionFunnel) && stats.conversions.conversionFunnel.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        {/* BEHAVIOR TAB */}
        <TabsContent value="behavior" className="space-y-6 animate-in fade-in duration-500 mt-0 outline-none">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-6 rounded-2xl shadow-md border border-[#0f766e]/20 relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-10"><Activity className="w-24 h-24 text-white" /></div>
              <div className="relative z-10">
                <p className="text-sm font-semibold text-teal-100 uppercase tracking-wider mb-1">Session Duration</p>
                <div className="text-4xl font-black text-white">{Math.round(stats.engagement.sessionDuration / 60)}<span className="text-2xl font-bold text-teal-200 ml-1">m</span></div>
                <p className="text-xs text-teal-100/70 mt-2 font-medium">Average session length</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-teal-200 transition-colors">
              <div className="absolute top-2 right-2 opacity-5 group-hover:opacity-10 transition-opacity"><TrendingUp className="w-24 h-24 text-slate-900" /></div>
              <div className="relative z-10">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Bounce Rate</p>
                <div className="text-4xl font-black text-slate-900">{stats.engagement?.bounceRate?.toFixed(1)}<span className="text-2xl font-bold text-slate-400 ml-1">%</span></div>
                <p className="text-xs text-slate-500 mt-2 font-medium">Single page sessions</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group hover:border-blue-200 transition-colors">
              <div className="absolute top-2 right-2 opacity-5 group-hover:opacity-10 transition-opacity"><Users className="w-24 h-24 text-slate-900" /></div>
              <div className="relative z-10">
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Events per User</p>
                <div className="text-4xl font-black text-slate-900">{stats.engagement?.avgEventsPerUser?.toFixed(1)}</div>
                <p className="text-xs text-slate-500 mt-2 font-medium">Average user actions taken</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">User Behavior Breakdown</h3>
                <p className="text-sm text-slate-500">Distribution of tracked actions</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <PieChart>
                  <Pie
                    data={eventsData}
                    cx="50%"
                    cy="50%"
                    innerRadius={80}
                    outerRadius={110}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {eventsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-900">Daily Engagement Trends</h3>
                <p className="text-sm text-slate-500">Activity volume over time</p>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={Array.isArray(stats.engagement?.dailyEngagement) ? stats.engagement.dailyEngagement : []}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} dy={10} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Line yAxisId="left" type="monotone" dataKey="events" stroke="#14b8a6" strokeWidth={3} dot={{ r: 3, fill: "#14b8a6" }} name="Total Events" />
                  <Line yAxisId="right" type="monotone" dataKey="users" stroke="#3b82f6" strokeWidth={3} dot={{ r: 3, fill: "#3b82f6" }} name="Unique Users" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-lg font-bold text-slate-900">Most Engaged Pages</h3>
              <p className="text-sm text-slate-500 mt-1">Where users spend the most time interacting</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Rank</th>
                    <th className="px-6 py-4 font-semibold">Page Path</th>
                    <th className="px-6 py-4 font-semibold text-right">Total Views</th>
                    <th className="px-6 py-4 font-semibold text-right">Unique Visitors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.engagement?.topPages?.map((page, index) => (
                    <tr key={page.page} className="bg-white hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-teal-600">#{index + 1}</td>
                      <td className="px-6 py-4 font-medium text-slate-800">{page.page}</td>
                      <td className="px-6 py-4 text-right font-bold text-slate-900">{page.views.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-medium text-slate-500">{page.uniqueUsers.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Popups & Modals */}
      <CreateCampaignForm
        isOpen={showCreateCampaign}
        onClose={() => setShowCreateCampaign(false)}
        onSuccess={fetchAllData}
      />

      <CreateSegmentForm
        isOpen={showCreateSegment}
        onClose={() => setShowCreateSegment(false)}
        onSuccess={fetchAllData}
      />

      <CreateAutomationRuleForm
        isOpen={showCreateAutomation}
        onClose={() => setShowCreateAutomation(false)}
        onSuccess={fetchAllData}
      />

      {/* SCHEDULE EDITOR DIALOG */}
      <Dialog open={scheduleEditorOpen} onOpenChange={setScheduleEditorOpen}>
        <DialogContent className="sm:max-w-md sm:rounded-3xl border-slate-200 shadow-xl p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900">Campaign Schedule</DialogTitle>
              <DialogDescription className="text-slate-500 text-sm">
                Updates start/end dates and timezone on the campaign.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-700">Start Date</Label>
              <Input
                type="datetime-local"
                value={scheduleDraft.start}
                onChange={(e) => setScheduleDraft((s) => ({ ...s, start: e.target.value }))}
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-teal-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-700">End Date <span className="text-slate-400 font-normal">(optional)</span></Label>
              <Input
                type="datetime-local"
                value={scheduleDraft.end}
                onChange={(e) => setScheduleDraft((s) => ({ ...s, end: e.target.value }))}
                className="h-11 rounded-xl border-slate-200 focus-visible:ring-teal-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-700">Timezone</Label>
              <Select
                value={scheduleDraft.timezone || "UTC"}
                onValueChange={(value) => setScheduleDraft((s) => ({ ...s, timezone: value }))}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-teal-500">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "UTC",
                    "Africa/Lagos",
                    "Africa/Cairo",
                    "Asia/Karachi",
                    "Asia/Dubai",
                    "Asia/Kolkata",
                    "Europe/London",
                    "America/New_York",
                    "America/Chicago",
                    "America/Los_Angeles",
                  ].map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-bold text-slate-700">Frequency</Label>
              <Select
                value={scheduleDraft.frequency}
                onValueChange={(value) =>
                  setScheduleDraft((s) => ({ ...s, frequency: value as typeof s.frequency }))
                }
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 focus:ring-teal-500">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONCE">Once</SelectItem>
                  <SelectItem value="HOURLY">Hourly</SelectItem>
                  <SelectItem value="DAILY">Daily</SelectItem>
                  <SelectItem value="CUSTOM_DAYS">Every custom days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scheduleDraft.frequency === "CUSTOM_DAYS" ? (
              <div className="space-y-1.5">
                <Label className="text-sm font-bold text-slate-700">Every N days</Label>
                <Input
                  type="number"
                  min={1}
                  value={scheduleDraft.customEveryDays}
                  onChange={(e) => setScheduleDraft((s) => ({ ...s, customEveryDays: e.target.value }))}
                  className="h-11 rounded-xl border-slate-200 focus-visible:ring-teal-500"
                />
              </div>
            ) : null}
          </div>
          
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
            <DialogFooter className="w-full sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setScheduleEditorOpen(false)} className="rounded-xl border-slate-200 text-slate-600">
                Cancel
              </Button>
              <Button type="button" onClick={() => void saveSchedule()} disabled={savingSchedule} className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
                {savingSchedule ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : "Save Schedule"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}