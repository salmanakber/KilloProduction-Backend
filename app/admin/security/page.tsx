"use client"

import { useState, useEffect } from "react"
import {
  Shield,
  Eye,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Calendar,
  Search,
  Filter,
  Download,
  Key,
  Smartphone,
  Globe,
  Activity,
} from "lucide-react"

interface SecurityEvent {
  id: string
  type:
    | "LOGIN"
    | "LOGOUT"
    | "FAILED_LOGIN"
    | "PASSWORD_CHANGE"
    | "PERMISSION_CHANGE"
    | "DATA_ACCESS"
    | "SUSPICIOUS_ACTIVITY"
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  userId: string
  userName: string
  userRole: string
  description: string
  ipAddress: string
  userAgent: string
  location: string
  timestamp: string
  status: "RESOLVED" | "INVESTIGATING" | "OPEN"
}

interface AuditLog {
  id: string
  adminId: string
  adminName: string
  action: string
  module: string
  targetId?: string
  targetType?: string
  details: any
  timestamp: string
  ipAddress: string
}

interface SecuritySettings {
  passwordPolicy: {
    minLength: number
    requireUppercase: boolean
    requireLowercase: boolean
    requireNumbers: boolean
    requireSpecialChars: boolean
    maxAge: number
  }
  sessionSettings: {
    maxDuration: number
    idleTimeout: number
    maxConcurrentSessions: number
  }
  twoFactorAuth: {
    enabled: boolean
    required: boolean
    methods: string[]
  }
  ipWhitelist: string[]
  suspiciousActivityThresholds: {
    failedLoginAttempts: number
    timeWindow: number
    blockDuration: number
  }
}

interface SecurityStats {
  totalEvents: number
  criticalEvents: number
  resolvedEvents: number
  activeThreats: number
  usersWithMFA: number
  totalAuditLogs: number
}

export default function SecurityAudit() {
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)
  const [stats, setStats] = useState<SecurityStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("events")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedSeverity, setSelectedSeverity] = useState("ALL")
  const [selectedTimeRange, setSelectedTimeRange] = useState("24h")

  useEffect(() => {
    fetchSecurityData()
  }, [selectedTimeRange, selectedSeverity])

  const fetchSecurityData = async () => {
    try {
      const [eventsResponse, auditResponse, settingsResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/security/events?range=${selectedTimeRange}&severity=${selectedSeverity}`),
        fetch(`/api/admin/security/audit-logs?range=${selectedTimeRange}`),
        fetch("/api/admin/security/settings"),
        fetch("/api/admin/security/stats"),
      ])

      const [eventsData, auditData, settingsData, statsData] = await Promise.all([
        eventsResponse.json(),
        auditResponse.json(),
        settingsResponse.json(),
        statsResponse.json(),
      ])

      setSecurityEvents(eventsData.events)
      setAuditLogs(auditData.logs)
      setSecuritySettings(settingsData.settings)
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch security data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEventAction = async (eventId: string, action: "resolve" | "investigate") => {
    try {
      const response = await fetch(`/api/admin/security/events/${eventId}/${action}`, {
        method: "POST",
      })
      if (response.ok) {
        fetchSecurityData()
      }
    } catch (error) {
      console.error(`Failed to ${action} event:`, error)
    }
  }

  const updateSecuritySettings = async (newSettings: Partial<SecuritySettings>) => {
    try {
      const response = await fetch("/api/admin/security/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      })
      if (response.ok) {
        fetchSecurityData()
      }
    } catch (error) {
      console.error("Failed to update security settings:", error)
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800"
      case "HIGH":
        return "bg-orange-100 text-orange-800"
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800"
      case "LOW":
        return "bg-green-100 text-green-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "LOGIN":
        return <User className="h-4 w-4" />
      case "FAILED_LOGIN":
        return <AlertTriangle className="h-4 w-4" />
      case "PASSWORD_CHANGE":
        return <Key className="h-4 w-4" />
      case "SUSPICIOUS_ACTIVITY":
        return <Shield className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RESOLVED":
        return "bg-green-100 text-green-800"
      case "INVESTIGATING":
        return "bg-yellow-100 text-yellow-800"
      case "OPEN":
        return "bg-red-100 text-red-800"
      default:
        return "bg-gray-100 text-gray-800"
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
          <h1 className="text-3xl font-bold text-gray-900">Security & Audit</h1>
          <p className="text-gray-600 mt-1">Monitor security events, audit trails, and system access</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedTimeRange}
            onChange={(e) => setSelectedTimeRange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
          >
            <option value="1h">Last Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
          </select>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export Logs
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Activity className="h-4 w-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Total Events</p>
              <p className="text-xl font-bold text-gray-900">{stats?.totalEvents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Critical Events</p>
              <p className="text-xl font-bold text-gray-900">{stats?.criticalEvents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Resolved</p>
              <p className="text-xl font-bold text-gray-900">{stats?.resolvedEvents}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Active Threats</p>
              <p className="text-xl font-bold text-gray-900">{stats?.activeThreats}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Smartphone className="h-4 w-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Users with MFA</p>
              <p className="text-xl font-bold text-gray-900">{stats?.usersWithMFA}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-gray-100 rounded-lg flex items-center justify-center">
              <Eye className="h-4 w-4 text-gray-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Audit Logs</p>
              <p className="text-xl font-bold text-gray-900">{stats?.totalAuditLogs}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab("events")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "events"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Security Events
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "audit"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Audit Logs
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "settings"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Security Settings
            </button>
            <button
              onClick={() => setActiveTab("monitoring")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "monitoring"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Real-time Monitoring
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "events" && (
            <div className="space-y-6">
              {/* Filters */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div className="flex-1 max-w-lg">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder="Search events by user, IP, or description..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </select>
                  <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Filter className="h-4 w-4 mr-2" />
                    More Filters
                  </button>
                </div>
              </div>

              {/* Events List */}
              <div className="space-y-3">
                {securityEvents?.map((event) => (
                  <div key={event.id} className="bg-gray-50 p-4 rounded-lg border">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <div className="h-8 w-8 bg-white rounded-lg flex items-center justify-center">
                            {getEventTypeIcon(event.type)}
                          </div>
                          <h4 className="font-medium text-gray-900">{event.description}</h4>
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${getSeverityColor(event.severity)}`}
                          >
                            {event.severity}
                          </span>
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(event.status)}`}
                          >
                            {event.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                          <div className="flex items-center">
                            <User className="h-3 w-3 mr-1" />
                            {event.userName} ({event.userRole})
                          </div>
                          <div className="flex items-center">
                            <Globe className="h-3 w-3 mr-1" />
                            {event.ipAddress}
                          </div>
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {new Date(event.timestamp).toLocaleString()}
                          </div>
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            {event.location}
                          </div>
                        </div>
                      </div>

                      {event.status === "OPEN" && (
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleEventAction(event.id, "investigate")}
                            className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
                          >
                            Investigate
                          </button>
                          <button
                            onClick={() => handleEventAction(event.id, "resolve")}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                          >
                            Resolve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "audit" && (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Admin
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Module
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Target
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        IP Address
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {auditLogs?.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{log.adminName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{log.action.replace("_", " ")}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                            {log.module}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {log.targetType} {log.targetId ? `(${log.targetId})` : ""}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{new Date(log.timestamp).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{log.ipAddress}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "settings" && securitySettings && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Password Policy */}
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Password Policy</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Length</label>
                      <input
                        type="number"
                        value={securitySettings.passwordPolicy.minLength}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2"
                        onChange={(e) =>
                          setSecuritySettings({
                            ...securitySettings,
                            passwordPolicy: {
                              ...securitySettings.passwordPolicy,
                              minLength: Number.parseInt(e.target.value),
                            },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={securitySettings.passwordPolicy.requireUppercase}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          onChange={(e) =>
                            setSecuritySettings({
                              ...securitySettings,
                              passwordPolicy: {
                                ...securitySettings.passwordPolicy,
                                requireUppercase: e.target.checked,
                              },
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">Require uppercase letters</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={securitySettings.passwordPolicy.requireNumbers}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          onChange={(e) =>
                            setSecuritySettings({
                              ...securitySettings,
                              passwordPolicy: {
                                ...securitySettings.passwordPolicy,
                                requireNumbers: e.target.checked,
                              },
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">Require numbers</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={securitySettings.passwordPolicy.requireSpecialChars}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                          onChange={(e) =>
                            setSecuritySettings({
                              ...securitySettings,
                              passwordPolicy: {
                                ...securitySettings.passwordPolicy,
                                requireSpecialChars: e.target.checked,
                              },
                            })
                          }
                        />
                        <span className="ml-2 text-sm text-gray-700">Require special characters</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Two-Factor Authentication */}
                <div className="bg-gray-50 p-6 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Two-Factor Authentication</h3>
                  <div className="space-y-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={securitySettings.twoFactorAuth.enabled}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                        onChange={(e) =>
                          setSecuritySettings({
                            ...securitySettings,
                            twoFactorAuth: {
                              ...securitySettings.twoFactorAuth,
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      <span className="ml-2 text-sm text-gray-700">Enable 2FA</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={securitySettings.twoFactorAuth.required}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                        onChange={(e) =>
                          setSecuritySettings({
                            ...securitySettings,
                            twoFactorAuth: {
                              ...securitySettings.twoFactorAuth,
                              required: e.target.checked,
                            },
                          })
                        }
                      />
                      <span className="ml-2 text-sm text-gray-700">Require 2FA for all admins</span>
                    </label>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Available Methods</label>
                      <div className="space-y-1">
                        {["SMS", "EMAIL", "AUTHENTICATOR_APP"].map((method) => (
                          <label key={method} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={securitySettings.twoFactorAuth.methods.includes(method)}
                              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                              onChange={(e) => {
                                const methods = e.target.checked
                                  ? [...securitySettings.twoFactorAuth.methods, method]
                                  : securitySettings.twoFactorAuth.methods.filter((m) => m !== method)
                                setSecuritySettings({
                                  ...securitySettings,
                                  twoFactorAuth: {
                                    ...securitySettings.twoFactorAuth,
                                    methods,
                                  },
                                })
                              }}
                            />
                            <span className="ml-2 text-sm text-gray-700">{method.replace("_", " ")}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => updateSecuritySettings(securitySettings)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Save Settings
                </button>
              </div>
            </div>
          )}

          {activeTab === "monitoring" && (
            <div className="space-y-6">
              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Real-time Security Monitoring</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Active Sessions</p>
                        <p className="text-2xl font-bold text-gray-900">247</p>
                      </div>
                      <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <User className="h-4 w-4 text-green-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Failed Logins (1h)</p>
                        <p className="text-2xl font-bold text-gray-900">12</p>
                      </div>
                      <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Blocked IPs</p>
                        <p className="text-2xl font-bold text-gray-900">5</p>
                      </div>
                      <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
                        <Shield className="h-4 w-4 text-orange-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-6 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Security Alerts</h3>
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 p-4 rounded">
                    <div className="flex items-center">
                      <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                      <span className="font-medium text-red-800">Multiple failed login attempts detected</span>
                    </div>
                    <p className="text-sm text-red-700 mt-1">IP: 192.168.1.100 - 15 failed attempts in 5 minutes</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 p-4 rounded">
                    <div className="flex items-center">
                      <Clock className="h-5 w-5 text-yellow-600 mr-2" />
                      <span className="font-medium text-yellow-800">Unusual login time detected</span>
                    </div>
                    <p className="text-sm text-yellow-700 mt-1">Admin login at 3:00 AM from new location</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
