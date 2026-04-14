"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Filter,
  Download,
  RefreshCw,
  Eye,
  Calendar,
  User,
  Activity,
  ChevronDown,
} from "lucide-react"

interface AuditLog {
  id: string
  action: string
  entityType: string
  entityId: string
  details?: any
  performedBy: string
  performer?: {
    name?: string
    email?: string
  }
  ipAddress?: string | null
  userAgent?: string | null
  createdAt: string
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterAction, setFilterAction] = useState<string>("")
  const [filterEntityType, setFilterEntityType] = useState<string>("")
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const itemsPerPage = 50

  useEffect(() => {
    fetchLogs()
  }, [page, filterAction, filterEntityType])

  const fetchLogs = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: page.toString(),
        limit: itemsPerPage.toString(),
        ...(filterAction && { action: filterAction }),
        ...(filterEntityType && { entityType: filterEntityType }),
      })

      const response = await fetch(`/api/admin/audit-logs?${params}`)
      if (response.ok) {
        const data = await response.json()
        setLogs(data.logs || [])
        setTotalPages(data.totalPages || 1)
      }
    } catch (error) {
      console.error("Failed to fetch audit logs:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.entityId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.performer?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.performer?.email?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  const uniqueActions = Array.from(new Set(logs.map((log) => log.action))).sort()
  const uniqueEntityTypes = Array.from(new Set(logs.map((log) => log.entityType))).sort()

  const getActionColor = (action: string) => {
    if (action.includes("CREATE") || action.includes("ADD")) return "bg-green-100 text-green-800"
    if (action.includes("UPDATE") || action.includes("EDIT")) return "bg-blue-100 text-blue-800"
    if (action.includes("DELETE") || action.includes("REMOVE")) return "bg-red-100 text-red-800"
    if (action.includes("LOGIN") || action.includes("AUTH")) return "bg-purple-100 text-purple-800"
    return "bg-gray-100 text-gray-800"
  }

  if (loading && logs.length === 0) {
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
          <h1 className="text-3xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-600 mt-1">Track all system activities and changes</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchLogs}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Logs</p>
              <p className="text-3xl font-bold text-gray-900">{logs.length}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Actions</p>
              <p className="text-3xl font-bold text-gray-900">{uniqueActions.length}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Entity Types</p>
              <p className="text-3xl font-bold text-gray-900">{uniqueEntityTypes.length}</p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Activity className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today</p>
              <p className="text-3xl font-bold text-gray-900">
                {logs.filter(
                  (log) => new Date(log.createdAt).toDateString() === new Date().toDateString(),
                ).length}
              </p>
            </div>
            <div className="h-12 w-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Actions</option>
              {uniqueActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filterEntityType}
              onChange={(e) => setFilterEntityType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
            >
              <option value="">All Entity Types</option>
              {uniqueEntityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                setFilterAction("")
                setFilterEntityType("")
                setSearchQuery("")
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performed By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      {new Date(log.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${getActionColor(
                        log.action,
                      )}`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{log.entityType}</div>
                    <div className="text-sm text-gray-500">ID: {log.entityId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <User className="h-4 w-4 mr-2 text-gray-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {log.performer?.name || "Unknown"}
                        </div>
                        {log.performer?.email && (
                          <div className="text-sm text-gray-500">{log.performer.email}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.ipAddress || "N/A"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <Activity className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No audit logs found</h3>
            <p className="mt-1 text-sm text-gray-500">Try adjusting your filters.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-700">
              Page {page} of {totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold">Audit Log Details</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <ChevronDown className="h-6 w-6 transform rotate-180" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Action</label>
                  <p className="text-sm text-gray-900">{selectedLog.action}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Entity Type</label>
                  <p className="text-sm text-gray-900">{selectedLog.entityType}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Entity ID</label>
                  <p className="text-sm text-gray-900">{selectedLog.entityId}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Timestamp</label>
                  <p className="text-sm text-gray-900">
                    {new Date(selectedLog.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Performed By</label>
                  <p className="text-sm text-gray-900">
                    {selectedLog.performer?.name || selectedLog.performedBy}
                  </p>
                  {selectedLog.performer?.email && (
                    <p className="text-sm text-gray-500">{selectedLog.performer.email}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">IP Address</label>
                  <p className="text-sm text-gray-900">{selectedLog.ipAddress || "N/A"}</p>
                </div>
              </div>
              {selectedLog.userAgent && (
                <div>
                  <label className="text-sm font-medium text-gray-500">User Agent</label>
                  <p className="text-sm text-gray-900 break-all">{selectedLog.userAgent}</p>
                </div>
              )}
              {selectedLog.details && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Details</label>
                  <pre className="mt-2 p-4 bg-gray-50 rounded-lg text-sm overflow-x-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
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


