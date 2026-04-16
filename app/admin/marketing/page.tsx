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
  type: "PROMO" | "INFORMATIONAL" | "RE_ENGAGEMENT" | "WELCOME" | "ABANDONED_CART"
  status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "RUNNING" | "COMPLETED" | "PAUSED" | "CANCELLED"
  startDate?: string | null
  endDate?: string | null
  timezone?: string
  targetAudience: {
    userType: string[]
    modules: string[]
    segments: string[]
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
    frequency?: "ONCE" | "DAILY" | "WEEKLY" | "MONTHLY"
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

import { CreateCampaignForm } from "@/components/CreateCampaignForm"
import { CreateSegmentForm } from "@/components/CreateSegmentForm"
import { CreateAutomationRuleForm } from "@/components/CreateAutomationRuleForm"

// Updated Premium Color Palette (Greens/Teals)
const COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#14b8a6", "#8b5cf6", "#34d399", "#059669"]

export default function MarketingDashboard() {
  const [stats, setStats] = useState<MarketingStats | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [segments, setSegments] = useState<Segment[]>([])
  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([])
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
  }>({ id: "", start: "", end: "", timezone: "UTC" })
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
            frequency: "ONCE",
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
      case "RUNNING":
        return "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-none shadow-sm shadow-emerald-200"
      case "SCHEDULED":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "COMPLETED":
        return "bg-gray-100 text-gray-800 border-gray-200"
      case "PAUSED":
        return "bg-amber-100 text-amber-800 border-amber-200"
      case "DRAFT":
        return "bg-purple-100 text-purple-800 border-purple-200"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "PROMO":
        return "bg-amber-50 text-amber-600 border-amber-200"
      case "INFORMATIONAL":
        return "bg-sky-50 text-sky-600 border-sky-200"
      case "RE_ENGAGEMENT":
        return "bg-indigo-50 text-indigo-600 border-indigo-200"
      case "WELCOME":
        return "bg-emerald-50 text-emerald-600 border-emerald-200"
      case "ABANDONED_CART":
        return "bg-rose-50 text-rose-600 border-rose-200"
      default:
        return "bg-gray-50 text-gray-600 border-gray-200"
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="relative flex items-center justify-center">
          <div className="absolute animate-ping rounded-full h-16 w-16 bg-emerald-400 opacity-20"></div>
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-600"></div>
          <Activity className="absolute h-5 w-5 text-emerald-600" />
        </div>
        <p className="text-emerald-700 font-medium animate-pulse">Loading Intelligence Data...</p>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="p-6 text-center border border-red-200 bg-red-50 rounded-xl text-red-600">
        Error loading marketing data. Please try refreshing.
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-10 bg-slate-50/30 min-h-screen">
      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-emerald-100/50">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500 mb-1">
            Marketing Intelligence
          </h1>
          <p className="text-slate-500 font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            Comprehensive analytics and AI campaign management
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={refreshing}
            className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 transition-all"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] border-emerald-200 focus:ring-emerald-500">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-lg shadow-emerald-200/50 text-white border-0 transition-all">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* AI Automation Notice Card - Styled Premium */}
      <Card className="border-emerald-200 bg-gradient-to-r from-emerald-50/80 to-teal-50/80 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-300 to-teal-300 opacity-10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
        <CardHeader className="relative z-10">
          <CardTitle className="text-emerald-800 flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-emerald-500" />
            Automated AI Campaigns Engine
          </CardTitle>
          <CardDescription className="text-emerald-700/80 text-sm leading-relaxed max-w-5xl">
            The background worker runs on a schedule to score user activity (cart adds, views, purchases, searches). It excludes recently notified users, and optionally utilizes <strong>Advanced AI Analysis</strong> to optimize send times and content. Enable or disable in settings.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Key Metrics - Gradient Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            title: "Active Campaigns",
            value: stats.campaigns.activeCampaigns,
            subtitle: `${stats.campaigns.totalCampaigns} total • ${stats.campaigns.scheduledCampaigns} scheduled`,
            icon: Target,
            gradient: "from-emerald-500 to-emerald-700",
          },
          {
            title: "Engagement Rate",
            value: `${stats.campaigns.openRate.toFixed(1)}%`,
            subtitle: `${stats.campaigns.totalOpened.toLocaleString()} opens • ${stats.campaigns.clickRate.toFixed(1)}% CTR`,
            icon: Activity,
            gradient: "from-teal-500 to-teal-700",
          },
          {
            title: "Conversion Rate",
            value: `${stats.campaigns.conversionRate.toFixed(1)}%`,
            subtitle: `${stats.campaigns.totalConverted.toLocaleString()} conversions`,
            icon: TrendingUp,
            gradient: "from-green-500 to-emerald-600",
          },
          {
            title: "Revenue Generated",
            value: `$${stats.campaigns.totalRevenue.toLocaleString()}`,
            subtitle: `$${stats.campaigns.revenuePerCampaign.toFixed(0)} per campaign`,
            icon: DollarSign,
            gradient: "from-emerald-600 to-teal-800",
          },
        ].map((stat, idx) => (
          <Card key={idx} className={`relative overflow-hidden group hover:shadow-xl transition-all duration-300 border-transparent bg-gradient-to-br ${stat.gradient} text-white`}>
            <div className="absolute right-[-10%] top-[-10%] opacity-20 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-500">
              <stat.icon className="w-32 h-32" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative z-10">
              <CardTitle className="text-sm font-medium text-emerald-50">{stat.title}</CardTitle>
              <stat.icon className="h-5 w-5 text-emerald-100" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-3xl font-extrabold mb-1">{stat.value}</div>
              <p className="text-xs text-emerald-100/80">{stat.subtitle}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-white border border-emerald-100 shadow-sm p-1 rounded-xl w-full flex flex-wrap h-auto gap-1">
          {["overview", "campaigns", "segments", "automation", "analytics", "behavior"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="capitalize flex-1 min-w-[120px] rounded-lg data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all text-slate-600 hover:bg-emerald-50"
            >
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* OVERVIEW TAB */}
        <TabsContent value="overview" className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Campaign Performance Chart */}
            <Card className="hover:border-emerald-300 transition-colors shadow-sm">
              <CardHeader>
                <CardTitle className="text-emerald-900">Campaign Performance Funnel</CardTitle>
                <CardDescription>From delivery to conversion</CardDescription>
              </CardHeader>
              <CardContent>
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
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "#f1f5f9" }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any, name: any) => [
                        name === "value" ? value.toLocaleString() : `${Number(value).toFixed(1)}%`,
                        name === "value" ? "Count" : "Rate",
                      ]}
                    />
                    <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Revenue Trend */}
            <Card className="hover:border-teal-300 transition-colors shadow-sm">
              <CardHeader>
                <CardTitle className="text-teal-900">Revenue & Conversions Trend</CardTitle>
                <CardDescription>Daily performance over time</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={Array.isArray(stats?.conversions?.dailyConversions) ? stats.conversions.dailyConversions : []}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Area yAxisId="left" type="monotone" dataKey="revenue" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                    <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#10b981" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Active Segments", value: stats.segments.activeSegments, icon: Users, color: "text-emerald-500", bg: "bg-emerald-50" },
              { label: "Automation Rules", value: stats.automation.activeRules, icon: BarChart3, color: "text-teal-500", bg: "bg-teal-50" },
              { label: "Unique Users", value: stats.engagement.uniqueUsers.toLocaleString(), icon: Activity, color: "text-cyan-500", bg: "bg-cyan-50" },
              { label: "Success Rate", value: `${stats.automation.successRate.toFixed(1)}%`, icon: TrendingUp, color: "text-green-500", bg: "bg-green-50" },
            ].map((stat, idx) => (
              <Card key={idx} className="border-slate-100 hover:border-emerald-200 transition-colors">
                <CardContent className="p-5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* CAMPAIGNS TAB */}
        <TabsContent value="campaigns" className="space-y-6 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-wrap gap-4 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-emerald-500 h-4 w-4" />
                <Input
                  placeholder="Search campaigns..."
                  value={campaignSearch}
                  onChange={(e) => setCampaignSearch(e.target.value)}
                  className="pl-10 border-slate-200 focus-visible:ring-emerald-500"
                />
              </div>
              <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                <SelectTrigger className="w-40 border-slate-200 focus:ring-emerald-500">
                  <SelectValue />
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
            </div>
            <Button onClick={() => setShowCreateCampaign(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto shadow-md shadow-emerald-200">
              <Plus className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
          </div>

          <div className="space-y-4">
            {filteredCampaigns.map((campaign) => (
              <Card key={campaign.id} className="hover:shadow-lg hover:border-emerald-300 transition-all duration-300 group overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500 scale-y-0 group-hover:scale-y-100 transition-transform origin-top"></div>
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row items-start justify-between gap-6">
                    <div className="flex-1 w-full">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h3 className="text-xl font-bold text-slate-800">{campaign.name}</h3>
                        <Badge className={getStatusColor(campaign.status)} variant="outline">{campaign.status}</Badge>
                        <Badge className={getTypeColor(campaign.type)} variant="outline">{campaign.type.replace("_", " ")}</Badge>
                        {campaign.abTest?.enabled && <Badge variant="secondary" className="bg-indigo-50 text-indigo-700">A/B Test</Badge>}
                      </div>

                      <p className="text-slate-600 mb-5 text-sm leading-relaxed max-w-3xl">
                        {campaign.content?.message || "—"}
                      </p>

                      <div className="flex flex-wrap gap-6 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center text-sm font-medium text-slate-700">
                          <Users className="h-4 w-4 mr-2 text-emerald-500" />
                          {campaign.targetAudience?.totalUsers?.toLocaleString()} Users Target
                        </div>
                        <div className="flex items-center text-sm font-medium text-slate-700">
                          <Calendar className="h-4 w-4 mr-2 text-blue-500" />
                          {campaign.schedule?.startDate
                            ? new Date(campaign.schedule.startDate).toLocaleDateString()
                            : campaign.startDate
                              ? new Date(campaign.startDate).toLocaleDateString()
                              : "—"}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-slate-500 mr-1">Channels:</span>
                          {campaign.channels.includes("PUSH") && (
                            <div className="h-7 w-7 bg-blue-100 rounded-full flex items-center justify-center" title="Push">
                              <Smartphone className="h-3.5 w-3.5 text-blue-600" />
                            </div>
                          )}
                          {campaign.channels.includes("EMAIL") && (
                            <div className="h-7 w-7 bg-green-100 rounded-full flex items-center justify-center" title="Email">
                              <Mail className="h-3.5 w-3.5 text-green-600" />
                            </div>
                          )}
                          {campaign.channels.includes("SMS") && (
                            <div className="h-7 w-7 bg-purple-100 rounded-full flex items-center justify-center" title="SMS">
                              <MessageSquare className="h-3.5 w-3.5 text-purple-600" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center text-sm font-semibold text-emerald-700 ml-auto bg-emerald-50 px-3 py-1 rounded-full">
                          <DollarSign className="h-4 w-4 mr-1" />
                          {campaign.metrics?.revenue?.toLocaleString()} Rev
                        </div>
                      </div>

                      {/* Campaign Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
                        {[
                          { label: "Sent", value: campaign.metrics?.sent },
                          { label: "Delivered", value: campaign.metrics?.delivered },
                          { label: "Opened", value: campaign.metrics?.opened },
                          { label: "Clicked", value: campaign.metrics?.clicked, color: "text-emerald-600" },
                          { label: "Converted", value: campaign.metrics?.converted, color: "text-teal-600" },
                          { label: "Unsub", value: campaign.metrics?.unsubscribed, color: "text-rose-500" },
                        ].map((metric, idx) => (
                          <div key={idx} className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                            <p className={`text-xl font-bold ${metric.color || "text-slate-800"}`}>
                              {metric.value?.toLocaleString() || 0}
                            </p>
                            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mt-1">{metric.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex lg:flex-col items-center justify-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 w-full lg:w-auto">
                      <Button variant="ghost" size="icon" className="hover:text-emerald-600 hover:bg-emerald-50" onClick={() => setSelectedCampaign(campaign)} title="View">
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:text-blue-600 hover:bg-blue-50"
                        title="Edit schedule"
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
                          })
                          setScheduleEditorOpen(true)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {campaign.status === "DRAFT" && (
                        <Button variant="ghost" size="icon" className="hover:text-emerald-600 hover:bg-emerald-50" onClick={() => handleLaunchCampaign(campaign.id)} title="Launch">
                          <Send className="h-4 w-4" />
                        </Button>
                      )}
                      {campaign.status === "ACTIVE" || campaign.status === "RUNNING" ? (
                        <Button variant="ghost" size="icon" className="hover:text-amber-600 hover:bg-amber-50" onClick={() => handleCampaignAction(campaign.id, "pause")} title="Pause">
                          <Pause className="h-4 w-4" />
                        </Button>
                      ) : campaign.status === "PAUSED" ? (
                        <Button variant="ghost" size="icon" className="hover:text-emerald-600 hover:bg-emerald-50" onClick={() => handleCampaignAction(campaign.id, "resume")} title="Resume">
                          <Play className="h-4 w-4" />
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" className="hover:text-rose-600 hover:bg-rose-50" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* SEGMENTS TAB */}
        <TabsContent value="segments" className="space-y-6 animate-in fade-in duration-500">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex gap-4 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-emerald-500 h-4 w-4" />
                <Input
                  placeholder="Search segments..."
                  value={segmentSearch}
                  onChange={(e) => setSegmentSearch(e.target.value)}
                  className="pl-10 focus-visible:ring-emerald-500 border-slate-200"
                />
              </div>
              <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                <SelectTrigger className="w-40 focus:ring-emerald-500 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="BEHAVIORAL">Behavioral</SelectItem>
                  <SelectItem value="DEMOGRAPHIC">Demographic</SelectItem>
                  <SelectItem value="TRANSACTIONAL">Transactional</SelectItem>
                  <SelectItem value="ENGAGEMENT">Engagement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setShowCreateSegment(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Create Segment
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSegments.map((segment) => (
              <Card key={segment.id} className="hover:border-emerald-300 hover:shadow-lg transition-all group">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg text-slate-800 line-clamp-1">{segment.name}</CardTitle>
                    <Badge variant={segment.isActive ? "default" : "secondary"} className={segment.isActive ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : ""}>
                      {segment.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2 mt-2">{segment.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-100 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-500">Type</span>
                      <Badge variant="outline" className="bg-white">{segment.type}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-500">Members</span>
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">{segment.memberCount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-500">Created</span>
                      <span className="text-sm font-medium text-slate-700">{new Date(segment.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end opacity-60 group-hover:opacity-100 transition-opacity">
                    <Button variant="outline" size="sm" className="hover:bg-emerald-50 hover:text-emerald-600 border-slate-200">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-blue-50 hover:text-blue-600 border-slate-200">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="hover:bg-rose-50 hover:text-rose-600 border-slate-200">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* AUTOMATION TAB */}
        <TabsContent value="automation" className="space-y-6 animate-in fade-in duration-500">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <BarChart3 className="text-emerald-500" /> Automation Rules
            </h2>
            <Button onClick={() => setShowCreateAutomation(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              <Plus className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {automationRules.map((rule) => (
              <Card key={rule.id} className="hover:border-teal-300 hover:shadow-lg transition-all">
                <CardHeader className="bg-slate-50 border-b border-slate-100 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg text-slate-800">{rule.name}</CardTitle>
                      <CardDescription className="mt-1">{rule.description}</CardDescription>
                    </div>
                    <Badge className={rule.isActive ? "bg-gradient-to-r from-emerald-400 to-teal-500" : "bg-slate-200 text-slate-600"}>
                      {rule.isActive ? "Running" : "Paused"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-6">
                    <div className="flex gap-4 items-center">
                      <div className="flex-1 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Trigger</span>
                        <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-amber-500" />
                          {rule.trigger.type.replace("_", " ")}
                        </p>
                      </div>
                      <Send className="h-5 w-5 text-slate-300" />
                      <div className="flex-1 bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Actions</span>
                        <p className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Target className="h-4 w-4 text-emerald-500" />
                          {rule.actions.length} Task(s)
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 p-3 rounded-lg text-center border border-slate-100">
                        <p className="text-xl font-bold text-slate-700">{rule.executionCount.toLocaleString()}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">Runs</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-lg text-center border border-emerald-100">
                        <p className="text-xl font-bold text-emerald-600">{rule.successCount.toLocaleString()}</p>
                        <p className="text-xs font-medium text-emerald-600/70 mt-1">Success</p>
                      </div>
                      <div className="bg-rose-50 p-3 rounded-lg text-center border border-rose-100">
                        <p className="text-xl font-bold text-rose-600">{rule.failureCount.toLocaleString()}</p>
                        <p className="text-xs font-medium text-rose-600/70 mt-1">Failed</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                    <Button variant="ghost" size="sm" className="hover:text-emerald-600 hover:bg-emerald-50">
                      <Eye className="h-4 w-4 mr-2" /> View
                    </Button>
                    <Button variant="ghost" size="sm" className="hover:text-blue-600 hover:bg-blue-50">
                      <Edit className="h-4 w-4 mr-2" /> Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ANALYTICS TAB */}
        <TabsContent value="analytics" className="space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Segment Performance */}
            <Card className="hover:border-emerald-300 transition-colors shadow-sm">
              <CardHeader>
                <CardTitle className="text-emerald-900">Segment Performance</CardTitle>
                <CardDescription>Engagement rates by target audience</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stats.segments.segmentPerformance}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="segment" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                    />
                    <Bar dataKey="openRate" fill="#10b981" name="Open Rate" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="clickRate" fill="#34d399" name="Click Rate" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="conversionRate" fill="#0ea5e9" name="Conv. Rate" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Top Products */}
            <Card className="hover:border-teal-300 transition-colors shadow-sm">
              <CardHeader>
                <CardTitle className="text-teal-900">Top Converting Products</CardTitle>
                <CardDescription>Products driving the most campaign revenue</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stats.conversions?.topProducts?.map((product, index) => (
                    <div key={product.product} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                      <div className="flex items-center space-x-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm ${index === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                          {index + 1}
                        </div>
                        <div>
                          <span className="font-semibold text-slate-800 block">{product.product}</span>
                          <span className="text-xs text-slate-500">{product.orders} orders driven</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                          ${product.revenue.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Conversion Funnel */}
          <Card className="hover:border-emerald-300 transition-colors shadow-sm overflow-hidden relative">
            <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-emerald-50 to-transparent pointer-events-none"></div>
            <CardHeader>
              <CardTitle className="text-emerald-900">Journey Conversion Funnel</CardTitle>
              <CardDescription>User flow from initial awareness to final purchase</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={Array.isArray(stats.conversions.conversionFunnel) ? stats.conversions.conversionFunnel : []} layout="vertical" margin={{ left: 50, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} />
                  <YAxis dataKey="stage" type="category" axisLine={false} tickLine={false} fontWeight={500} />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="users" fill="#14b8a6" radius={[0, 4, 4, 0]} barSize={32}>
                    { Array.isArray(stats.conversions.conversionFunnel) && stats.conversions.conversionFunnel.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* BEHAVIOR TAB */}
        <TabsContent value="behavior" className="space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-20"><Activity className="w-20 h-20" /></div>
              <CardHeader className="relative z-10 pb-2">
                <CardTitle className="text-emerald-50 text-sm font-medium">Session Duration</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-extrabold">{Math.round(stats.engagement.sessionDuration / 60)}<span className="text-2xl font-medium text-emerald-200">m</span></div>
                <p className="text-sm text-emerald-100 mt-1">Average session length</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-teal-500 to-cyan-600 text-white border-0 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-20"><TrendingUp className="w-20 h-20" /></div>
              <CardHeader className="relative z-10 pb-2">
                <CardTitle className="text-teal-50 text-sm font-medium">Bounce Rate</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-extrabold">{stats.engagement?.bounceRate?.toFixed(1)}<span className="text-2xl font-medium text-teal-200">%</span></div>
                <p className="text-sm text-teal-100 mt-1">Single page sessions</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-cyan-500 to-blue-600 text-white border-0 shadow-lg relative overflow-hidden">
              <div className="absolute top-2 right-2 opacity-20"><Users className="w-20 h-20" /></div>
              <CardHeader className="relative z-10 pb-2">
                <CardTitle className="text-cyan-50 text-sm font-medium">Events per User</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10">
                <div className="text-4xl font-extrabold">{stats.engagement?.avgEventsPerUser?.toFixed(1)}</div>
                <p className="text-sm text-cyan-100 mt-1">Average user actions taken</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Event Types Distribution */}
            <Card className="hover:border-emerald-300 transition-colors shadow-sm">
              <CardHeader>
                <CardTitle className="text-emerald-900">User Behavior Breakdown</CardTitle>
                <CardDescription>Distribution of tracked actions</CardDescription>
              </CardHeader>
              <CardContent>
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
                    >
                      {eventsData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Daily Engagement */}
            <Card className="hover:border-teal-300 transition-colors shadow-sm">
              <CardHeader>
                <CardTitle className="text-teal-900">Daily Engagement Trends</CardTitle>
                <CardDescription>Activity volume over chosen period</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <LineChart data={Array.isArray(stats.engagement?.dailyEngagement) ? stats.engagement.dailyEngagement : []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    <Line yAxisId="left" type="monotone" dataKey="events" stroke="#10b981" strokeWidth={3} dot={{ r: 3, fill: "#10b981" }} name="Total Events" />
                    <Line yAxisId="right" type="monotone" dataKey="users" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 3, fill: "#0ea5e9" }} name="Unique Users" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Top Pages Table */}
          <Card className="hover:border-emerald-300 transition-colors shadow-sm">
            <CardHeader>
              <CardTitle className="text-emerald-900">Most Engaged Pages</CardTitle>
              <CardDescription>Where users spend the most time interacting</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 rounded-tl-lg">Rank</th>
                      <th className="px-6 py-4">Page Path</th>
                      <th className="px-6 py-4 text-right">Total Views</th>
                      <th className="px-6 py-4 text-right rounded-tr-lg">Unique Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.engagement?.topPages?.map((page, index) => (
                      <tr key={page.page} className="bg-white border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-semibold text-emerald-600">#{index + 1}</td>
                        <td className="px-6 py-4 font-medium text-slate-700">{page.page}</td>
                        <td className="px-6 py-4 text-right font-medium">{page.views.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-slate-500">{page.uniqueUsers.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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

      <Dialog open={scheduleEditorOpen} onOpenChange={setScheduleEditorOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Campaign schedule</DialogTitle>
            <DialogDescription>
              Updates start/end dates and timezone on the campaign (and schedule JSON) for workers and the customer inbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Start</Label>
              <Input
                type="datetime-local"
                value={scheduleDraft.start}
                onChange={(e) => setScheduleDraft((s) => ({ ...s, start: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>End (optional)</Label>
              <Input
                type="datetime-local"
                value={scheduleDraft.end}
                onChange={(e) => setScheduleDraft((s) => ({ ...s, end: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Timezone</Label>
              <Input
                value={scheduleDraft.timezone}
                onChange={(e) => setScheduleDraft((s) => ({ ...s, timezone: e.target.value }))}
                placeholder="e.g. Africa/Lagos"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setScheduleEditorOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveSchedule()} disabled={savingSchedule}>
              {savingSchedule ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}