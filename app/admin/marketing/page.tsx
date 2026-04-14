      "use client"

      import { useState, useEffect } from "react"
      import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
      import { Button } from "@/components/ui/button"
      import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
      import { Badge } from "@/components/ui/badge"
      import { Input } from "@/components/ui/input"
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
      } from "lucide-react"

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
        status: "DRAFT" | "SCHEDULED" | "ACTIVE" | "COMPLETED" | "PAUSED"
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
      import {CreateCampaignForm}  from "@/components/CreateCampaignForm"
      import { CreateSegmentForm } from "@/components/CreateSegmentForm"
      import { CreateAutomationRuleForm } from "@/components/CreateAutomationRuleForm" 

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

        // Search and filter states
        const [campaignSearch, setCampaignSearch] = useState("")
        const [campaignFilter, setCampaignFilter] = useState("all")
        const [segmentSearch, setSegmentSearch] = useState("")
        const [segmentFilter, setSegmentFilter] = useState("all")
        console.log(CreateCampaignForm)

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
            const response = await fetch(`/api/marketing/analytics/dashboard?period=${period}`)
            console.log(response)
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
            const response = await fetch("/api/marketing/campaigns")
            console.log(response)
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
            const response = await fetch("/api/marketing/segments")
            console.log(response)
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
            const response = await fetch("/api/marketing/automation/rules")
            console.log(response)
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
            })
            console.log(response)
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
            })
            console.log(response)
            if (response.ok) {
              await fetchCampaigns()
              await fetchMarketingStats()
            }
          } catch (error) {
            console.error("Error launching campaign:", error)
          }
        }

        const trackBehavior = async (event: string, data: Record<string, any>) => {
          try {
            await fetch("/api/marketing/behavior/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event, data, timestamp: new Date().toISOString() }),
            })
            
          } catch (error) {
            console.error("Error tracking behavior:", error)
          }
        }

        const getStatusColor = (status: string) => {
          switch (status) {
            case "ACTIVE":
              return "bg-green-100 text-green-800"
            case "SCHEDULED":
              return "bg-blue-100 text-blue-800"
            case "COMPLETED":
              return "bg-gray-100 text-gray-800"
            case "PAUSED":
              return "bg-yellow-100 text-yellow-800"
            case "DRAFT":
              return "bg-purple-100 text-purple-800"
            default:
              return "bg-gray-100 text-gray-800"
          }
        }

        const getTypeColor = (type: string) => {
          switch (type) {
            case "PROMO":
              return "bg-orange-100 text-orange-800"
            case "INFORMATIONAL":
              return "bg-blue-100 text-blue-800"
            case "RE_ENGAGEMENT":
              return "bg-purple-100 text-purple-800"
            case "WELCOME":
              return "bg-green-100 text-green-800"
            case "ABANDONED_CART":
              return "bg-red-100 text-red-800"
            default:
              return "bg-gray-100 text-gray-800"
          }
        }

        const filteredCampaigns = campaigns.filter((campaign) => {
          const matchesSearch = campaign.name.toLowerCase().includes(campaignSearch.toLowerCase())
          const matchesFilter = campaignFilter === "all" || campaign.status === campaignFilter
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
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          )
        }



        if (!stats) {
          return <div>Error loading marketing data</div>
        }

        const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82ca9d", "#ffc658"]

        return (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold">Marketing Intelligence</h1>
                <p className="text-gray-600">Comprehensive marketing analytics and campaign management</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <select value={period} onChange={(e) => setPeriod(e.target.value)} className="px-3 py-2 border rounded-md">
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="365">Last year</option>
                </select>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
                  <Target className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.campaigns.activeCampaigns}</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.campaigns.totalCampaigns} total • {stats.campaigns.scheduledCampaigns} scheduled
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Engagement Rate</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.campaigns.openRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.campaigns.totalOpened.toLocaleString()} opens • {stats.campaigns.clickRate.toFixed(1)}% CTR
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.campaigns.conversionRate.toFixed(1)}%</div>
                  <p className="text-xs text-muted-foreground">
                    {stats.campaigns.totalConverted.toLocaleString()} conversions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Revenue Generated</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.campaigns.totalRevenue.toLocaleString()}</div>
                  <p className="text-xs text-muted-foreground">
                    ${stats.campaigns.revenuePerCampaign.toFixed(0)} per campaign
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-6">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="segments">Segments</TabsTrigger>
                <TabsTrigger value="automation">Automation</TabsTrigger>
                <TabsTrigger value="analytics">Analytics</TabsTrigger>
                <TabsTrigger value="behavior">Behavior</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Campaign Performance Chart */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Campaign Performance Funnel</CardTitle>
                      <CardDescription>From delivery to conversion</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={[
                            { name: "Sent", value: stats.campaigns.totalSent, rate: 100 },
                            { name: "Delivered", value: stats.campaigns.totalDelivered, rate: stats.campaigns.deliveryRate },
                            { name: "Opened", value: stats.campaigns.totalOpened, rate: stats.campaigns.openRate },
                            { name: "Clicked", value: stats.campaigns.totalClicked, rate: stats.campaigns.clickRate },
                            {
                              name: "Converted",
                              value: stats.campaigns.totalConverted,
                              rate: stats.campaigns.conversionRate,
                            },
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip
                            formatter={(value, name) => [
                              name === "value" ? value.toLocaleString() : `${value.toFixed(1)}%`,
                              name === "value" ? "Count" : "Rate",
                            ]}
                          />
                          <Bar dataKey="value" fill="#8884d8" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Revenue Trend */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Revenue & Conversions Trend</CardTitle>
                      <CardDescription>Daily performance over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={Array.isArray(stats?.conversions?.dailyConversions) ? stats.conversions.dailyConversions : []}>
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis dataKey="date" />
      <YAxis yAxisId="left" />
      <YAxis yAxisId="right" orientation="right" />
      <Tooltip />
      <Area
        yAxisId="left"
        type="monotone"
        dataKey="revenue"
        stackId="1"
        stroke="#82ca9d"
        fill="#82ca9d"
        fillOpacity={0.6}
      />
      <Line yAxisId="right" type="monotone" dataKey="conversions" stroke="#8884d8" />
    </AreaChart>

                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Active Segments</p>
                          <p className="text-2xl font-bold">{stats.segments.activeSegments}</p>
                        </div>
                        <Users className="h-8 w-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Automation Rules</p>
                          <p className="text-2xl font-bold">{stats.automation.activeRules}</p>
                        </div>
                        <BarChart3 className="h-8 w-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Unique Users</p>
                          <p className="text-2xl font-bold">{stats.engagement.uniqueUsers.toLocaleString()}</p>
                        </div>
                        <Activity className="h-8 w-8 text-purple-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Success Rate</p>
                          <p className="text-2xl font-bold">{stats.automation.successRate.toFixed(1)}%</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-orange-600" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Campaigns Tab */}
              <TabsContent value="campaigns" className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search campaigns..."
                        value={campaignSearch}
                        onChange={(e) => setCampaignSearch(e.target.value)}
                        className="pl-10 w-64"
                      />
                    </div>
                    <Select value={campaignFilter} onValueChange={setCampaignFilter}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="ACTIVE">Active</SelectItem>
                        <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                        <SelectItem value="DRAFT">Draft</SelectItem>
                        <SelectItem value="PAUSED">Paused</SelectItem>
                        <SelectItem value="COMPLETED">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => setShowCreateCampaign(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </div>

                <div className="space-y-4">
                  {filteredCampaigns.map((campaign) => (
                    <Card key={campaign.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-lg font-semibold">{campaign.name}</h3>
                              <Badge className={getStatusColor(campaign.status)}>{campaign.status}</Badge>
                              <Badge className={getTypeColor(campaign.type)}>{campaign.type.replace("_", " ")}</Badge>
                              {campaign.abTest?.enabled && <Badge variant="outline">A/B Test</Badge>}
                            </div>

                            <p className="text-gray-600 mb-4">{campaign.content.message}</p>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                              <div className="flex items-center text-sm text-gray-600">
                                <Users className="h-4 w-4 mr-2" />
                                {campaign.targetAudience?.totalUsers?.toLocaleString()} users
                              </div>
                              <div className="flex items-center text-sm text-gray-600">
                                <Calendar className="h-4 w-4 mr-2" />
                                {new Date(campaign.schedule.startDate).toLocaleDateString()}
                              </div>
                              <div className="flex items-center space-x-1">
                                {campaign.channels.includes("PUSH") && (
                                  <div className="h-6 w-6 bg-blue-100 rounded flex items-center justify-center">
                                    <Smartphone className="h-3 w-3 text-blue-600" />
                                  </div>
                                )}
                                {campaign.channels.includes("EMAIL") && (
                                  <div className="h-6 w-6 bg-green-100 rounded flex items-center justify-center">
                                    <Mail className="h-3 w-3 text-green-600" />
                                  </div>
                                )}
                                {campaign.channels.includes("SMS") && (
                                  <div className="h-6 w-6 bg-purple-100 rounded flex items-center justify-center">
                                    <MessageSquare className="h-3 w-3 text-purple-600" />
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-gray-600">
                                Revenue: ${campaign.metrics?.revenue?.toLocaleString()}
                              </div>
                            </div>

                            {/* Campaign Metrics */}
                            <div className="grid grid-cols-6 gap-4 text-center">
                              <div>
                                <p className="text-lg font-semibold">{campaign.metrics?.sent?.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Sent</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{campaign.metrics?.delivered?.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Delivered</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{campaign.metrics?.opened?.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Opened</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{campaign.metrics?.clicked?.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Clicked</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{campaign.metrics?.converted?.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Converted</p>
                              </div>
                              <div>
                                <p className="text-lg font-semibold">{campaign.metrics?.unsubscribed?.toLocaleString()}</p>
                                <p className="text-xs text-gray-500">Unsubscribed</p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center space-x-2 ml-4">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedCampaign(campaign)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Edit className="h-4 w-4" />
                            </Button>
                            {campaign.status === "DRAFT" && (
                              <Button size="sm" onClick={() => handleLaunchCampaign(campaign.id)}>
                                <Send className="h-4 w-4 mr-1" />
                                Launch
                              </Button>
                            )}
                            {campaign.status === "ACTIVE" ? (
                              <Button variant="outline" size="sm" onClick={() => handleCampaignAction(campaign.id, "pause")}>
                                <Pause className="h-4 w-4" />
                              </Button>
                            ) : campaign.status === "PAUSED" ? (
                              <Button variant="outline" size="sm" onClick={() => handleCampaignAction(campaign.id, "resume")}>
                                <Play className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Segments Tab */}
              <TabsContent value="segments" className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search segments..."
                        value={segmentSearch}
                        onChange={(e) => setSegmentSearch(e.target.value)}
                        className="pl-10 w-64"
                      />
                    </div>
                    <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                      <SelectTrigger className="w-40">
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
                  <Button onClick={() => setShowCreateSegment(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Segment
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredSegments.map((segment) => (
                    <Card key={segment.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{segment.name}</CardTitle>
                          <Badge variant={segment.isActive ? "default" : "secondary"}>
                            {segment.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <CardDescription>{segment.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Type:</span>
                            <Badge variant="outline">{segment.type}</Badge>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Members:</span>
                            <span className="font-semibold">{segment.memberCount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Created:</span>
                            <span className="text-sm">{new Date(segment.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Automation Tab */}
              <TabsContent value="automation" className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Automation Rules</h2>
                  <Button onClick={() => setShowCreateAutomation(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Rule
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {automationRules.map((rule) => (
                    <Card key={rule.id}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{rule.name}</CardTitle>
                          <Badge variant={rule.isActive ? "default" : "secondary"}>
                            {rule.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <CardDescription>{rule.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div>
                            <span className="text-sm font-medium text-gray-600">Trigger:</span>
                            <p className="text-sm">{rule.trigger.type.replace("_", " ")}</p>
                          </div>
                          <div>
                            <span className="text-sm font-medium text-gray-600">Actions:</span>
                            <p className="text-sm">{rule.actions.length} action(s) configured</p>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-lg font-semibold">{rule.executionCount}</p>
                              <p className="text-xs text-gray-500">Executions</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-green-600">{rule.successCount}</p>
                              <p className="text-xs text-gray-500">Success</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-red-600">{rule.failureCount}</p>
                              <p className="text-xs text-gray-500">Failed</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-4">
                          <Button variant="outline" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              {/* Analytics Tab */}
              <TabsContent value="analytics" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Segment Performance */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Segment Performance</CardTitle>
                      <CardDescription>Engagement rates by segment</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stats.segments.segmentPerformance}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="segment" />
                          <YAxis />
                          <Tooltip formatter={(value) => `${value.toFixed(1)}%`} />
                          <Bar dataKey="openRate" fill="#8884d8" name="Open Rate" />
                          <Bar dataKey="clickRate" fill="#82ca9d" name="Click Rate" />
                          <Bar dataKey="conversionRate" fill="#ffc658" name="Conversion Rate" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Top Products */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Converting Products</CardTitle>
                      <CardDescription>Products driving the most revenue</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.conversions?.topProducts?.map((product, index) => (
                          <div key={product.product} className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <span className="text-sm font-semibold text-blue-600">{index + 1}</span>
                              </div>
                              <span className="font-medium">{product.product}</span>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">${product.revenue.toLocaleString()}</p>
                              <p className="text-sm text-gray-500">{product.orders} orders</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Conversion Funnel */}
                <Card>
                  <CardHeader>
                    <CardTitle>Conversion Funnel</CardTitle>
                    <CardDescription>User journey from awareness to purchase</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={stats.conversions.conversionFunnel} layout="horizontal">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="stage" type="category" />
                        <Tooltip />
                        <Bar dataKey="users" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Behavior Tab */}
              <TabsContent value="behavior" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Event Types Distribution */}
                  <Card>
                    <CardHeader>
                      <CardTitle>User Behavior Events</CardTitle>
                      <CardDescription>Distribution of tracked user actions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
    <Pie
      data={eventsData}
      cx="50%"
      cy="50%"
      labelLine={false}
      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
      outerRadius={80}
      fill="#8884d8"
      dataKey="value"
    >
      {eventsData.map((entry, index) => (
        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
      ))}
    </Pie>
    <Tooltip />
  </PieChart>

                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Daily Engagement */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Daily User Engagement</CardTitle>
                      <CardDescription>Events and unique users over time</CardDescription>
                    </CardHeader>
                    <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
        <LineChart data={Array.isArray(stats.engagement?.dailyEngagement) ? stats.engagement.dailyEngagement : []}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" />
          <YAxis yAxisId="right" orientation="right" />
          <Tooltip />
          <Line yAxisId="left" type="monotone" dataKey="events" stroke="#8884d8" name="Events" />
          <Line yAxisId="right" type="monotone" dataKey="users" stroke="#82ca9d" name="Users" />
        </LineChart>
      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* Top Pages */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Pages</CardTitle>
                    <CardDescription>Most visited pages and user engagement</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {stats.engagement?.topPages?.map((page, index) => (
                        <div key={page.page} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <span className="text-sm font-semibold text-green-600">{index + 1}</span>
                            </div>
                            <span className="font-medium">{page.page}</span>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{page.views.toLocaleString()} views</p>
                            <p className="text-sm text-gray-500">{page.uniqueUsers.toLocaleString()} unique users</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Engagement Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Session Duration</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{Math.round(stats.engagement.sessionDuration / 60)}m</div>
                      <p className="text-sm text-muted-foreground">Average session length</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Bounce Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.engagement?.bounceRate?.toFixed(1)}%</div>
                      <p className="text-sm text-muted-foreground">Single page sessions</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Events per User</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-3xl font-bold">{stats.engagement?.avgEventsPerUser?.toFixed(1)}</div>
                      <p className="text-sm text-muted-foreground">Average user engagement</p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
                       {/* Create Campaign Dialog */}
       <CreateCampaignForm
        isOpen={showCreateCampaign}
        onClose={() => setShowCreateCampaign(false)}
        onSuccess={fetchAllData}
      />

      {/* Create Segment Dialog */}
      <CreateSegmentForm
        isOpen={showCreateSegment}
        onClose={() => setShowCreateSegment(false)}
        onSuccess={fetchAllData}
      />

      {/* Create Automation Rule Dialog */}
      <CreateAutomationRuleForm
        isOpen={showCreateAutomation}
        onClose={() => setShowCreateAutomation(false)}
        onSuccess={fetchAllData}
      />
          </div>
        )

 

        
      }
