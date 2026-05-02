"use client"

import { useState, useEffect } from "react"
import {
  Bell,
  Send,
  Users,
  Mail,
  Smartphone,
  MessageSquare,
  Calendar,
  Target,
  Eye,
  Edit,
  Trash2,
  Plus,
  Filter,
  Search,
  Download,
  Play,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Activity,
  Megaphone
} from "lucide-react"

interface NotificationCampaign {
  id: string
  title: string
  message: string
  type: "PUSH" | "EMAIL" | "SMS" | "IN_APP"
  status: "DRAFT" | "SCHEDULED" | "SENT" | "FAILED"
  targetAudience: {
    userTypes: string[]
    modules: string[]
    totalUsers: number
  }
  scheduledAt?: string
  sentAt?: string
  imageUrl?: string | null
  actionUrl?: string | null
  metrics: {
    sent: number
    delivered: number
    opened: number
    clicked: number
  }
  createdAt: string
  createdBy: string
}

function scheduledAtToDatetimeLocal(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface NotificationTemplate {
  id: string
  name: string
  type: string
  subject: string
  content: string
  variables: string[]
  isActive: boolean
}

interface NotificationStats {
  totalCampaigns: number
  activeCampaigns: number
  totalSent: number
  deliveryRate: number
  openRate: number
  clickRate: number
}

export default function NotificationManagement() {
  const [campaigns, setCampaigns] = useState<NotificationCampaign[]>([])
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [stats, setStats] = useState<NotificationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("campaigns")
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [viewCampaign, setViewCampaign] = useState<NotificationCampaign | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")

  const [newCampaign, setNewCampaign] = useState({
    title: "",
    message: "",
    type: "PUSH",
    targetAudience: {
      userTypes: [] as string[],
      modules: [] as string[],
    },
    scheduledAt: "",
    imageUrl: "",
    actionUrl: "",
  })

  useEffect(() => {
    fetchNotificationData()
  }, [searchTerm, statusFilter])

  const fetchNotificationData = async () => {
    try {
      const base = { credentials: "include" as RequestCredentials }
      const [campaignsResponse, templatesResponse, statsResponse] = await Promise.all([
        fetch(
          `/api/admin/notifications/campaigns?search=${encodeURIComponent(searchTerm)}&status=${encodeURIComponent(statusFilter)}`,
          base
        ),
        fetch("/api/admin/notifications/templates", base),
        fetch("/api/admin/notifications/stats", base),
      ])

      const [campaignsData, templatesData, statsData] = await Promise.all([
        campaignsResponse.json(),
        templatesResponse.json(),
        statsResponse.json(),
      ])

      setCampaigns(Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : [])
      setTemplates(Array.isArray(templatesData.templates) ? templatesData.templates : [])
      if (statsData && typeof statsData === "object" && !statsData.error) {
        setStats({
          totalCampaigns: Number(statsData.totalCampaigns) || 0,
          activeCampaigns: Number(statsData.activeCampaigns) || 0,
          totalSent: Number(statsData.totalSent) || 0,
          deliveryRate: Number(statsData.deliveryRate) || 0,
          openRate: Number(statsData.openRate) || 0,
          clickRate: Number(statsData.clickRate) || 0,
        })
      } else {
        setStats(null)
      }
    } catch (error) {
      console.error("Failed to fetch notification data:", error)
    } finally {
      setLoading(false)
    }
  }

  const resetCampaignForm = () => {
    setEditingId(null)
    setNewCampaign({
      title: "",
      message: "",
      type: "PUSH",
      targetAudience: { userTypes: [], modules: [] },
      scheduledAt: "",
      imageUrl: "",
      actionUrl: "",
    })
  }

  const openViewCampaign = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/notifications/campaigns/${id}`, { credentials: "include" })
      const data = await response.json()
      if (data.campaign) setViewCampaign(data.campaign as NotificationCampaign)
    } catch (error) {
      console.error("Failed to load campaign:", error)
    }
  }

  const openEditCampaign = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/notifications/campaigns/${id}`, { credentials: "include" })
      const data = await response.json()
      const c = data.campaign as NotificationCampaign | undefined
      if (!c) return
      setNewCampaign({
        title: c.title,
        message: c.message,
        type: c.type,
        targetAudience: {
          userTypes: c.targetAudience?.userTypes ?? [],
          modules: c.targetAudience?.modules ?? [],
        },
        scheduledAt: scheduledAtToDatetimeLocal(c.scheduledAt),
        imageUrl: c.imageUrl ?? "",
        actionUrl: c.actionUrl ?? "",
      })
      setEditingId(id)
      setShowCreateModal(true)
    } catch (error) {
      console.error("Failed to load campaign for edit:", error)
    }
  }

  const handleSaveCampaign = async () => {
    try {
      const url = editingId
        ? `/api/admin/notifications/campaigns/${editingId}`
        : "/api/admin/notifications/campaigns"
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newCampaign),
      })

      if (response.ok) {
        fetchNotificationData()
        setShowCreateModal(false)
        resetCampaignForm()
      }
    } catch (error) {
      console.error("Failed to save campaign:", error)
    }
  }

  const handleDeleteCampaign = async (campaignId: string) => {
    if (!confirm("Delete this notice? This cannot be undone.")) return
    try {
      const response = await fetch(`/api/admin/notifications/campaigns/${campaignId}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (response.ok) fetchNotificationData()
    } catch (error) {
      console.error("Failed to delete campaign:", error)
    }
  }

  const handleSendCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/admin/notifications/campaigns/${campaignId}/send`, {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        fetchNotificationData()
      }
    } catch (error) {
      console.error("Failed to send campaign:", error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "SENT":
        return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "SCHEDULED":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "DRAFT":
        return "bg-slate-100 text-slate-700 border-slate-200"
      case "FAILED":
        return "bg-rose-50 text-rose-700 border-rose-200"
      default:
        return "bg-slate-100 text-slate-700 border-slate-200"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "PUSH":
        return <Smartphone className="h-5 w-5" />
      case "EMAIL":
        return <Mail className="h-5 w-5" />
      case "SMS":
        return <MessageSquare className="h-5 w-5" />
      case "IN_APP":
        return <Bell className="h-5 w-5" />
      default:
        return <Bell className="h-5 w-5" />
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
        <p className="text-sm font-medium text-slate-500">Syncing notification data...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-teal-600" /> System Notices
          </h1>
          <p className="text-sm text-slate-500 mt-2 max-w-3xl leading-relaxed">
  This section is used to communicate important system-wide updates to users, such as maintenance alerts, service disruptions, new feature releases, and policy or safety announcements. Messages created here are distributed through available communication channels like push notifications, email, and SMS based on user preferences and system configuration.
</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button className="flex items-center px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            type="button"
            onClick={() => {
              resetCampaignForm()
              setShowCreateModal(true)
            }}
            className="flex items-center px-4 py-2 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Notice
          </button>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: "Total notices", value: stats?.totalCampaigns ?? 0, icon: Bell, bg: "bg-blue-50", color: "text-blue-600" },
          { label: "Draft / scheduled", value: stats?.activeCampaigns ?? 0, icon: Play, bg: "bg-teal-50", color: "text-teal-600" },
          { label: "Deliveries logged", value: (stats?.totalSent ?? 0).toLocaleString(), icon: Send, bg: "bg-purple-50", color: "text-purple-600" },
          { label: "Delivery rate", value: `${(stats?.deliveryRate ?? 0).toFixed(1)}%`, icon: CheckCircle, bg: "bg-amber-50", color: "text-amber-600" },
          { label: "Open rate", value: `${(stats?.openRate ?? 0).toFixed(1)}%`, icon: Eye, bg: "bg-indigo-50", color: "text-indigo-600" },
          { label: "Click rate", value: `${(stats?.clickRate ?? 0).toFixed(1)}%`, icon: Target, bg: "bg-rose-50", color: "text-rose-600" },
        ].map((stat, idx) => (
          <div key={idx} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-teal-200 hover:shadow-md transition-all group">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 ${stat.bg} rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{stat.label}</p>
                <p className="text-xl font-black text-slate-900 mt-0.5">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* TABS & CONTENT CONTAINER */}
      <div className="space-y-6">
        <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm inline-block w-full overflow-x-auto">
          <nav className="flex space-x-1 h-auto p-0 min-w-max">
            {[
              { id: "campaigns", label: "Broadcast Log", icon: <Send className="h-4 w-4" /> },
              // { id: "templates", label: "Templates", icon: <Edit className="h-4 w-4" /> },
              { id: "settings", label: "Channels Config", icon: <Activity className="h-4 w-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-teal-50 text-teal-700 font-bold"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div>
          {/* BROADCAST LOG */}
          {activeTab === "campaigns" && (
            <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-100 pb-6">
                <div className="flex-1 max-w-lg relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type="text"
                    placeholder="Search notices…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2.5 w-full border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all outline-none text-sm"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
                  >
                    <option value="ALL">All Status</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="SENT">Sent</option>
                    <option value="FAILED">Failed</option>
                  </select>
                  <button className="flex items-center px-4 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-sm font-medium text-slate-600 transition-colors">
                    <Filter className="h-4 w-4 mr-2 text-slate-400" />
                    More Filters
                  </button>
                </div>
              </div>

              {/* Campaigns List */}
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="border border-slate-200 rounded-2xl p-6 hover:border-teal-200 hover:shadow-md transition-all group bg-white">
                    <div className="flex flex-col xl:flex-row items-start justify-between gap-6">
                      <div className="flex-1 w-full">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="h-10 w-10 bg-teal-50 rounded-xl flex items-center justify-center border border-teal-100 text-teal-600 shrink-0">
                            {getTypeIcon(campaign.type)}
                          </div>
                          <h3 className="text-lg font-bold text-slate-900">{campaign.title}</h3>
                          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md border ${getStatusColor(campaign.status)}`}>
                            {campaign.status}
                          </span>
                        </div>

                        <p className="text-slate-600 mb-5 text-sm max-w-3xl leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                          {campaign.message}
                        </p>

                        <div className="flex flex-wrap items-center gap-6 mb-5">
                          <div className="flex items-center text-sm font-medium text-slate-600">
                            <Users className="h-4 w-4 mr-2 text-slate-400" />
                            <span className="font-bold text-slate-900 mr-1">{campaign.targetAudience.totalUsers.toLocaleString()}</span> users targeted
                          </div>
                          <div className="flex items-center text-sm font-medium text-slate-600">
                            <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                            {campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleDateString() : "Not scheduled"}
                          </div>
                          <div className="flex items-center text-sm font-medium text-slate-600">
                            <Send className="h-4 w-4 mr-2 text-slate-400" />
                            {campaign.sentAt ? `Sent ${new Date(campaign.sentAt).toLocaleDateString()}` : "Not sent"}
                          </div>
                          <div className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                            By {campaign.createdBy}
                          </div>
                        </div>

                        {/* Metrics */}
                        {campaign.status === "SENT" && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <div className="border-r border-slate-200 last:border-0 pr-4">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sent</p>
                              <p className="text-xl font-bold text-slate-900 mt-1">{campaign.metrics.sent.toLocaleString()}</p>
                            </div>
                            <div className="border-r border-slate-200 last:border-0 pr-4">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Delivered</p>
                              <p className="text-xl font-bold text-slate-900 mt-1">{campaign.metrics.delivered.toLocaleString()}</p>
                            </div>
                            <div className="border-r border-slate-200 last:border-0 pr-4">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Opened</p>
                              <p className="text-xl font-bold text-teal-600 mt-1">{campaign.metrics.opened.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Clicked</p>
                              <p className="text-xl font-bold text-emerald-600 mt-1">{campaign.metrics.clicked.toLocaleString()}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex xl:flex-col items-center gap-2 border border-slate-100 p-2 rounded-xl xl:w-32 w-full shrink-0">
                        <button
                          type="button"
                          onClick={() => void openViewCampaign(campaign.id)}
                          className="flex-1 xl:w-full flex items-center justify-center p-2 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={campaign.status === "SENT"}
                          onClick={() => void openEditCampaign(campaign.id)}
                          className="flex-1 xl:w-full flex items-center justify-center p-2 text-slate-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-40 disabled:pointer-events-none"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        {campaign.status === "DRAFT" && (
                          <button
                            type="button"
                            onClick={() => handleSendCampaign(campaign.id)}
                            className="flex-1 xl:w-full flex items-center justify-center p-2 text-teal-600 hover:text-teal-800 hover:bg-teal-100 rounded-lg transition-colors bg-teal-50"
                            title="Send Now"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                        {campaign.status !== "SENT" && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteCampaign(campaign.id)}
                            className="flex-1 xl:w-full flex items-center justify-center p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {campaigns.length === 0 && (
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
          )}

          {/* TEMPLATES TAB */}
          {/* {activeTab === "templates" && (
            <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Saved Templates</h3>
                  <p className="text-sm text-slate-500 mt-1">System notices are usually written ad hoc; reusable templates can be wired later.</p>
                </div>
                <button type="button" className="flex items-center justify-center px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 opacity-60 cursor-not-allowed font-medium" disabled title="Coming soon">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <div key={template.id} className="border border-slate-200 rounded-2xl p-6 hover:border-teal-200 hover:shadow-md transition-all bg-slate-50/50">
                    <div className="flex items-start justify-between mb-4">
                      <h4 className="font-bold text-slate-900 line-clamp-1">{template.name}</h4>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md border ${template.isActive ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                        {template.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-6 bg-white p-3 rounded-xl border border-slate-100 line-clamp-2">{template.subject}</p>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-1 rounded-md">{template.type}</span>
                      <div className="flex items-center space-x-1">
                        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )} */}

          {/* CHANNELS / SETTINGS TAB */}
          {activeTab === "settings" && (
            <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="border-b border-slate-100 pb-6">
                <h3 className="text-lg font-bold text-slate-900">Delivery Channels</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Toggles here are informational. Actual providers are configured under System settings (SMTP/Brevo, Twilio, etc.).
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Push */}
                <div className="flex flex-col p-5 border border-slate-200 rounded-2xl bg-slate-50 hover:border-teal-200 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-10 w-10 bg-teal-100 rounded-xl flex items-center justify-center text-teal-600 border border-teal-200">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div className="h-5 w-9 bg-teal-500 rounded-full flex items-center px-0.5 opacity-60">
                      <div className="h-4 w-4 bg-white rounded-full translate-x-4"></div>
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">Mobile Push (Expo)</h4>
                  <p className="text-sm text-slate-600 leading-relaxed flex-1">
                    Stored per user in <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200 font-mono">deviceTokens</code>. Sent via <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200 font-mono">NotificationBridge</code> when users have push enabled.
                  </p>
                </div>

                {/* Email */}
                <div className="flex flex-col p-5 border border-slate-200 rounded-2xl bg-slate-50 hover:border-blue-200 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-10 w-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 border border-blue-200">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div className="h-5 w-9 bg-teal-500 rounded-full flex items-center px-0.5 opacity-60">
                      <div className="h-4 w-4 bg-white rounded-full translate-x-4"></div>
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">Email</h4>
                  <p className="text-sm text-slate-600 leading-relaxed flex-1">
                    Uses <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200 font-mono">sendEmail</code> from <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200 font-mono">lib/email.ts</code> with the generic layout for broadcasts.
                  </p>
                </div>

                {/* SMS */}
                <div className="flex flex-col p-5 border border-slate-200 rounded-2xl bg-slate-50 hover:border-purple-200 transition-colors">
                  <div className="flex items-start justify-between mb-4">
                    <div className="h-10 w-10 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600 border border-purple-200">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div className="h-5 w-9 bg-teal-500 rounded-full flex items-center px-0.5 opacity-60">
                      <div className="h-4 w-4 bg-white rounded-full translate-x-4"></div>
                    </div>
                  </div>
                  <h4 className="font-bold text-slate-900 mb-2">SMS Integration</h4>
                  <p className="text-sm text-slate-600 leading-relaxed flex-1">
                    Uses <code className="text-xs bg-white px-1 py-0.5 rounded border border-slate-200 font-mono">sendTransactionalSms</code> (respects your provider config: Twilio, Nexmo, etc.).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CREATE CAMPAIGN MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  {editingId ? "Edit system notice" : "Compose System Notice"}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  Use neutral, factual wording. Choose one core channel per notice.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setShowCreateModal(false)
                  resetCampaignForm()
                }} 
                className="h-10 w-10 bg-white rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
                aria-label="Close"
              >
                <AlertTriangle className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">Subject / Headline</label>
                <input
                  type="text"
                  value={newCampaign.title}
                  onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                  className="w-full h-11 border border-slate-200 rounded-xl px-4 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all"
                  placeholder="e.g. Scheduled maintenance tonight 11pm–1am"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-bold text-slate-700">Message Body</label>
                <textarea
                  value={newCampaign.message}
                  onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                  rows={4}
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all resize-y"
                  placeholder="Explain impact, timing, and what users should do. Avoid promotional language unless this is truly an offer."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-700">Delivery Channel</label>
                  <select
                    value={newCampaign.type}
                    onChange={(e) => setNewCampaign({ ...newCampaign, type: e.target.value })}
                    className="w-full h-11 border border-slate-200 rounded-xl px-4 focus:ring-2 focus:ring-teal-500 outline-none transition-all cursor-pointer bg-white"
                  >
                    <option value="PUSH">Push (Expo tokens → mobile)</option>
                    <option value="EMAIL">Email (lib/email.ts)</option>
                    <option value="SMS">SMS (lib/twilio.ts)</option>
                    <option value="IN_APP">In-app inbox only (no push)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-700">Schedule <span className="font-normal text-slate-400">(Optional)</span></label>
                  <input
                    type="datetime-local"
                    value={newCampaign.scheduledAt}
                    onChange={(e) => setNewCampaign({ ...newCampaign, scheduledAt: e.target.value })}
                    className="w-full h-11 border border-slate-200 rounded-xl px-4 focus:ring-2 focus:ring-teal-500 outline-none transition-all bg-white"
                  />
                </div>
              </div>

              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl">
                <label className="block text-sm font-bold text-slate-900 mb-1">Target Audience</label>
                <p className="text-xs font-medium text-slate-500 mb-5">If none selected, customers are targeted by default.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">User Roles</label>
                    <div className="flex flex-wrap gap-3">
                      {["CUSTOMER", "VENDOR", "RIDER", "WHOLESALER"].map((userType) => (
                        <label key={userType} className={`flex items-center px-4 py-2 rounded-xl border cursor-pointer transition-colors ${newCampaign.targetAudience.userTypes.includes(userType) ? 'bg-teal-50 border-teal-200 text-teal-800 font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            checked={newCampaign.targetAudience.userTypes.includes(userType)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: { ...newCampaign.targetAudience, userTypes: [...newCampaign.targetAudience.userTypes, userType] },
                                })
                              } else {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: { ...newCampaign.targetAudience, userTypes: newCampaign.targetAudience.userTypes.filter((t) => t !== userType) },
                                })
                              }
                            }}
                            className="sr-only" // Hidden for styling, logic intact
                          />
                          <div className={`h-4 w-4 rounded border flex items-center justify-center mr-2 ${newCampaign.targetAudience.userTypes.includes(userType) ? 'bg-teal-600 border-teal-600' : 'border-slate-300'}`}>
                            {newCampaign.targetAudience.userTypes.includes(userType) && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-sm">{userType}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Platform Modules</label>
                    <div className="flex flex-wrap gap-3">
                      {["PHARMACY", "AUTO_PARTS", "FOOD", "GROCERY", "RIDING"].map((module) => (
                        <label key={module} className={`flex items-center px-4 py-2 rounded-xl border cursor-pointer transition-colors ${newCampaign.targetAudience.modules.includes(module) ? 'bg-blue-50 border-blue-200 text-blue-800 font-bold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            checked={newCampaign.targetAudience.modules.includes(module)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: { ...newCampaign.targetAudience, modules: [...newCampaign.targetAudience.modules, module] },
                                })
                              } else {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: { ...newCampaign.targetAudience, modules: newCampaign.targetAudience.modules.filter((m) => m !== module) },
                                })
                              }
                            }}
                            className="sr-only"
                          />
                          <div className={`h-4 w-4 rounded border flex items-center justify-center mr-2 ${newCampaign.targetAudience.modules.includes(module) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'}`}>
                            {newCampaign.targetAudience.modules.includes(module) && <CheckCircle className="h-3 w-3 text-white" />}
                          </div>
                          <span className="text-sm capitalize">{module.replace("_", " ").toLowerCase()}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-4">
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-700">Image URL <span className="font-normal text-slate-400">(Optional)</span></label>
                  <input
                    type="url"
                    value={newCampaign.imageUrl}
                    onChange={(e) => setNewCampaign({ ...newCampaign, imageUrl: e.target.value })}
                    className="w-full h-11 border border-slate-200 rounded-xl px-4 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    placeholder="https://... (push / email only)"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-bold text-slate-700">Action Link <span className="font-normal text-slate-400">(Optional)</span></label>
                  <input
                    type="url"
                    value={newCampaign.actionUrl}
                    onChange={(e) => setNewCampaign({ ...newCampaign, actionUrl: e.target.value })}
                    className="w-full h-11 border border-slate-200 rounded-xl px-4 focus:ring-2 focus:ring-teal-500 outline-none transition-all"
                    placeholder="Status page or help URL"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end space-x-3 px-6 py-5 border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false)
                  resetCampaignForm()
                }}
                className="px-6 py-2.5 border border-slate-200 rounded-xl text-slate-600 font-medium hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveCampaign()}
                className="px-6 py-2.5 bg-teal-600 text-white font-bold rounded-xl hover:bg-teal-700 transition-colors shadow-sm"
              >
                {editingId ? "Save changes" : "Save Draft"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW CAMPAIGN MODAL */}
      {viewCampaign && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-900 pr-4">{viewCampaign.title}</h2>
              <button
                type="button"
                onClick={() => setViewCampaign(null)}
                className="h-10 w-10 shrink-0 bg-slate-50 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 border border-slate-200"
                aria-label="Close"
              >
                <AlertTriangle className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-md border ${getStatusColor(viewCampaign.status)}`}>
                  {viewCampaign.status}
                </span>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-md border bg-slate-50 text-slate-700 border-slate-200">
                  {viewCampaign.type}
                </span>
              </div>
              <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{viewCampaign.message}</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-600">
                <div>
                  <dt className="text-xs font-semibold text-slate-500 uppercase">Target users</dt>
                  <dd className="font-medium text-slate-900">{viewCampaign.targetAudience.totalUsers.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500 uppercase">Roles</dt>
                  <dd className="font-medium text-slate-900">{(viewCampaign.targetAudience.userTypes || []).join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500 uppercase">Scheduled</dt>
                  <dd className="font-medium text-slate-900">
                    {viewCampaign.scheduledAt ? new Date(viewCampaign.scheduledAt).toLocaleString() : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500 uppercase">Sent</dt>
                  <dd className="font-medium text-slate-900">
                    {viewCampaign.sentAt ? new Date(viewCampaign.sentAt).toLocaleString() : "—"}
                  </dd>
                </div>
                {viewCampaign.imageUrl ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-slate-500 uppercase">Image URL</dt>
                    <dd className="font-mono text-xs break-all text-teal-700">{viewCampaign.imageUrl}</dd>
                  </div>
                ) : null}
                {viewCampaign.actionUrl ? (
                  <div className="sm:col-span-2">
                    <dt className="text-xs font-semibold text-slate-500 uppercase">Action link</dt>
                    <dd className="font-mono text-xs break-all text-teal-700">{viewCampaign.actionUrl}</dd>
                  </div>
                ) : null}
              </dl>
              {viewCampaign.status === "SENT" && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-xs text-slate-500">Sent</p>
                    <p className="text-lg font-bold">{viewCampaign.metrics.sent.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Delivered</p>
                    <p className="text-lg font-bold">{viewCampaign.metrics.delivered.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Opened</p>
                    <p className="text-lg font-bold text-teal-600">{viewCampaign.metrics.opened.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Clicked</p>
                    <p className="text-lg font-bold text-emerald-600">{viewCampaign.metrics.clicked.toLocaleString()}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-slate-400">Created by {viewCampaign.createdBy}</p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setViewCampaign(null)}
                className="px-5 py-2.5 bg-teal-600 text-white font-medium rounded-xl hover:bg-teal-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}