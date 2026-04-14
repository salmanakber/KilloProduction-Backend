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
  metrics: {
    sent: number
    delivered: number
    opened: number
    clicked: number
  }
  createdAt: string
  createdBy: string
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
      const [campaignsResponse, templatesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/notifications/campaigns?search=${searchTerm}&status=${statusFilter}`),
        fetch("/api/admin/notifications/templates"),
        fetch("/api/admin/notifications/stats"),
      ])

      const [campaignsData, templatesData, statsData] = await Promise.all([
        campaignsResponse.json(),
        templatesResponse.json(),
        statsResponse.json(),
      ])

      setCampaigns(campaignsData.campaigns)
      setTemplates(templatesData.templates)
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch notification data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCampaign = async () => {
    try {
      const response = await fetch("/api/admin/notifications/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCampaign),
      })

      if (response.ok) {
        fetchNotificationData()
        setShowCreateModal(false)
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
    } catch (error) {
      console.error("Failed to create campaign:", error)
    }
  }

  const handleSendCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/admin/notifications/campaigns/${campaignId}/send`, {
        method: "POST",
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
        return "bg-green-100 text-green-800"
      case "SCHEDULED":
        return "bg-blue-100 text-blue-800"
      case "DRAFT":
        return "bg-gray-100 text-gray-800"
      case "FAILED":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "PUSH":
        return <Smartphone className="h-4 w-4" />
      case "EMAIL":
        return <Mail className="h-4 w-4" />
      case "SMS":
        return <MessageSquare className="h-4 w-4" />
      case "IN_APP":
        return <Bell className="h-4 w-4" />
      default:
        return <Bell className="h-4 w-4" />
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
          <h1 className="text-3xl font-bold text-gray-900">Notification Management</h1>
          <p className="text-gray-600 mt-1">Create and manage push notifications, emails, and SMS campaigns</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Campaign
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Bell className="h-4 w-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Total Campaigns</p>
              <p className="text-xl font-bold text-gray-900">{stats?.totalCampaigns}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
              <Play className="h-4 w-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-xl font-bold text-gray-900">{stats?.activeCampaigns}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Send className="h-4 w-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Total Sent</p>
              <p className="text-xl font-bold text-gray-900">{stats?.totalSent.toLocaleString()}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-yellow-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Delivery Rate</p>
              <p className="text-xl font-bold text-gray-900">{stats?.deliveryRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Eye className="h-4 w-4 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Open Rate</p>
              <p className="text-xl font-bold text-gray-900">{stats?.openRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
              <Target className="h-4 w-4 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Click Rate</p>
              <p className="text-xl font-bold text-gray-900">{stats?.clickRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { id: "campaigns", label: "Campaigns", icon: <Send className="h-4 w-4" /> },
              { id: "templates", label: "Templates", icon: <Edit className="h-4 w-4" /> },
              { id: "settings", label: "Settings", icon: <Bell className="h-4 w-4" /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? "border-green-500 text-green-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* Campaigns Tab */}
          {activeTab === "campaigns" && (
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div className="flex-1 max-w-lg">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder="Search campaigns..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  >
                    <option value="ALL">All Status</option>
                    <option value="DRAFT">Draft</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="SENT">Sent</option>
                    <option value="FAILED">Failed</option>
                  </select>
                  <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Filter className="h-4 w-4 mr-2" />
                    More Filters
                  </button>
                </div>
              </div>

              {/* Campaigns List */}
              <div className="space-y-4">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
                            {getTypeIcon(campaign.type)}
                          </div>
                          <h3 className="text-lg font-semibold text-gray-900">{campaign.title}</h3>
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(campaign.status)}`}
                          >
                            {campaign.status}
                          </span>
                        </div>

                        <p className="text-gray-600 mb-4">{campaign.message}</p>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                          <div className="flex items-center text-sm text-gray-600">
                            <Users className="h-4 w-4 mr-2" />
                            {campaign.targetAudience.totalUsers.toLocaleString()} users
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Calendar className="h-4 w-4 mr-2" />
                            {campaign.scheduledAt
                              ? new Date(campaign.scheduledAt).toLocaleDateString()
                              : "Not scheduled"}
                          </div>
                          <div className="flex items-center text-sm text-gray-600">
                            <Send className="h-4 w-4 mr-2" />
                            {campaign.sentAt ? `Sent ${new Date(campaign.sentAt).toLocaleDateString()}` : "Not sent"}
                          </div>
                          <div className="text-sm text-gray-600">Created by {campaign.createdBy}</div>
                        </div>

                        {/* Metrics */}
                        {campaign.status === "SENT" && (
                          <div className="grid grid-cols-4 gap-4 text-center bg-gray-50 rounded-lg p-4">
                            <div>
                              <p className="text-lg font-semibold text-gray-900">
                                {campaign.metrics.sent.toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500">Sent</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-gray-900">
                                {campaign.metrics.delivered.toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500">Delivered</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-gray-900">
                                {campaign.metrics.opened.toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500">Opened</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-gray-900">
                                {campaign.metrics.clicked.toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-500">Clicked</p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 ml-4">
                        <button className="p-2 text-gray-400 hover:text-gray-600">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="p-2 text-blue-400 hover:text-blue-600">
                          <Edit className="h-4 w-4" />
                        </button>
                        {campaign.status === "DRAFT" && (
                          <button
                            onClick={() => handleSendCampaign(campaign.id)}
                            className="p-2 text-green-600 hover:text-green-700"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        )}
                        <button className="p-2 text-red-400 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Templates Tab */}
          {activeTab === "templates" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Notification Templates</h3>
                <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Template
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {templates.map((template) => (
                  <div key={template.id} className="border border-gray-200 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-gray-900">{template.name}</h4>
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${template.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}
                      >
                        {template.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">{template.subject}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">{template.type}</span>
                      <div className="flex items-center space-x-2">
                        <button className="text-blue-600 hover:text-blue-700">
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="text-red-600 hover:text-red-700">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === "settings" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Settings</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-900">Push Notifications</h4>
                      <p className="text-sm text-gray-600">Send push notifications to mobile apps</p>
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-900">Email Notifications</h4>
                      <p className="text-sm text-gray-600">Send email notifications</p>
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </label>
                  </div>
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div>
                      <h4 className="font-medium text-gray-900">SMS Notifications</h4>
                      <p className="text-sm text-gray-600">Send SMS notifications</p>
                    </div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        defaultChecked
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create New Campaign</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <AlertTriangle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campaign Title</label>
                <input
                  type="text"
                  value={newCampaign.title}
                  onChange={(e) => setNewCampaign({ ...newCampaign, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  placeholder="Enter campaign title"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                <textarea
                  value={newCampaign.message}
                  onChange={(e) => setNewCampaign({ ...newCampaign, message: e.target.value })}
                  rows={4}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  placeholder="Enter your message"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notification Type</label>
                  <select
                    value={newCampaign.type}
                    onChange={(e) => setNewCampaign({ ...newCampaign, type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  >
                    <option value="PUSH">Push Notification</option>
                    <option value="EMAIL">Email</option>
                    <option value="SMS">SMS</option>
                    <option value="IN_APP">In-App</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (Optional)</label>
                  <input
                    type="datetime-local"
                    value={newCampaign.scheduledAt}
                    onChange={(e) => setNewCampaign({ ...newCampaign, scheduledAt: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Audience</label>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-600 mb-2 block">User Types</label>
                    <div className="grid grid-cols-2 gap-2">
                      {["CUSTOMER", "VENDOR", "RIDER", "WHOLESALER"].map((userType) => (
                        <label key={userType} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={newCampaign.targetAudience.userTypes.includes(userType)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: {
                                    ...newCampaign.targetAudience,
                                    userTypes: [...newCampaign.targetAudience.userTypes, userType],
                                  },
                                })
                              } else {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: {
                                    ...newCampaign.targetAudience,
                                    userTypes: newCampaign.targetAudience.userTypes.filter((t) => t !== userType),
                                  },
                                })
                              }
                            }}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">{userType}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 mb-2 block">Modules</label>
                    <div className="grid grid-cols-3 gap-2">
                      {["PHARMACY", "AUTO_PARTS", "FOOD", "GROCERY", "RIDING"].map((module) => (
                        <label key={module} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={newCampaign.targetAudience.modules.includes(module)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: {
                                    ...newCampaign.targetAudience,
                                    modules: [...newCampaign.targetAudience.modules, module],
                                  },
                                })
                              } else {
                                setNewCampaign({
                                  ...newCampaign,
                                  targetAudience: {
                                    ...newCampaign.targetAudience,
                                    modules: newCampaign.targetAudience.modules.filter((m) => m !== module),
                                  },
                                })
                              }
                            }}
                            className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <span className="ml-2 text-sm text-gray-700">{module.replace("_", " ")}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Image URL (Optional)</label>
                  <input
                    type="url"
                    value={newCampaign.imageUrl}
                    onChange={(e) => setNewCampaign({ ...newCampaign, imageUrl: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="https://example.com/image.jpg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action URL (Optional)</label>
                  <input
                    type="url"
                    value={newCampaign.actionUrl}
                    onChange={(e) => setNewCampaign({ ...newCampaign, actionUrl: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="https://example.com/action"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateCampaign}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Create Campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
