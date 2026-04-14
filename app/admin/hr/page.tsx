"use client"

import { useState, useEffect } from "react"
import {
  Users,
  UserPlus,
  Clock,
  Calendar,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Filter,
  Search,
  Download,
  Edit,
  Trash2,
  Eye,
  Mail,
  Phone,
} from "lucide-react"

interface Staff {
  id: string
  name: string
  email: string
  phone: string
  role: string
  department: string
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE"
  joinedAt: string
  lastLogin: string
  avatar?: string
  permissions: string[]
  performance: {
    ticketsResolved: number
    responseTime: number
    rating: number
  }
}

interface LeaveRequest {
  id: string
  staffId: string
  staffName: string
  type: "SICK" | "VACATION" | "PERSONAL" | "EMERGENCY"
  startDate: string
  endDate: string
  reason: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  appliedAt: string
}

interface HRStats {
  totalStaff: number
  activeStaff: number
  onLeave: number
  pendingLeaveRequests: number
  averageResponseTime: number
  totalTicketsResolved: number
}

export default function HRManagement() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([])
  const [stats, setStats] = useState<HRStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("staff")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedDepartment, setSelectedDepartment] = useState("ALL")

  useEffect(() => {
    fetchHRData()
  }, [])

  const fetchHRData = async () => {
    try {
      const [staffResponse, leaveResponse, statsResponse] = await Promise.all([
        fetch("/api/admin/hr/staff"),
        fetch("/api/admin/hr/leave-requests"),
        fetch("/api/admin/hr/stats"),
      ])

      const [staffData, leaveData, statsData] = await Promise.all([
        staffResponse.json(),
        leaveResponse.json(),
        statsResponse.json(),
      ])

      setStaff(staffData.staff)
      setLeaveRequests(leaveData.requests)
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch HR data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveAction = async (requestId: string, action: "approve" | "reject") => {
    try {
      const response = await fetch(`/api/admin/hr/leave-requests/${requestId}/${action}`, {
        method: "POST",
      })
      if (response.ok) {
        fetchHRData()
      }
    } catch (error) {
      console.error(`Failed to ${action} leave request:`, error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800"
      case "INACTIVE":
        return "bg-red-100 text-red-800"
      case "ON_LEAVE":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getLeaveStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "bg-green-100 text-green-800"
      case "REJECTED":
        return "bg-red-100 text-red-800"
      case "PENDING":
        return "bg-yellow-100 text-yellow-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getLeaveTypeColor = (type: string) => {
    switch (type) {
      case "SICK":
        return "bg-red-100 text-red-800"
      case "VACATION":
        return "bg-blue-100 text-blue-800"
      case "PERSONAL":
        return "bg-purple-100 text-purple-800"
      case "EMERGENCY":
        return "bg-orange-100 text-orange-800"
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
          <h1 className="text-3xl font-bold text-gray-900">HR Management</h1>
          <p className="text-gray-600 mt-1">Manage internal staff, attendance, and operations</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export Report
          </button>
          <button className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Staff
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-4 w-4 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="text-xl font-bold text-gray-900">{stats?.totalStaff}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-xl font-bold text-gray-900">{stats?.activeStaff}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Calendar className="h-4 w-4 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">On Leave</p>
              <p className="text-xl font-bold text-gray-900">{stats?.onLeave}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Pending Requests</p>
              <p className="text-xl font-bold text-gray-900">{stats?.pendingLeaveRequests}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <Clock className="h-4 w-4 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Avg Response</p>
              <p className="text-xl font-bold text-gray-900">{stats?.averageResponseTime}m</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="h-8 w-8 bg-red-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-4 w-4 text-red-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-600">Tickets Resolved</p>
              <p className="text-xl font-bold text-gray-900">{stats?.totalTicketsResolved}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab("staff")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "staff"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Staff Management
            </button>
            <button
              onClick={() => setActiveTab("leave")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "leave"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Leave Requests
            </button>
            <button
              onClick={() => setActiveTab("attendance")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "attendance"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Attendance
            </button>
            <button
              onClick={() => setActiveTab("performance")}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === "performance"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              Performance
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "staff" && (
            <div className="space-y-6">
              {/* Search and Filters */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
                <div className="flex-1 max-w-lg">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      placeholder="Search staff by name, email, or role..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <select
                    value={selectedDepartment}
                    onChange={(e) => setSelectedDepartment(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                  >
                    <option value="ALL">All Departments</option>
                    <option value="SUPPORT">Support</option>
                    <option value="OPERATIONS">Operations</option>
                    <option value="MARKETING">Marketing</option>
                    <option value="FINANCE">Finance</option>
                  </select>
                  <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Filter className="h-4 w-4 mr-2" />
                    More Filters
                  </button>
                </div>
              </div>

              {/* Staff Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Staff Member
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role & Department
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Performance
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Login
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {staff?.map((member) => (
                      <tr key={member.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                              {member.avatar ? (
                                <img
                                  src={member.avatar || "/placeholder.svg"}
                                  alt={member.name}
                                  className="h-10 w-10 rounded-full"
                                />
                              ) : (
                                <Users className="h-5 w-5 text-gray-500" />
                              )}
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{member.name}</div>
                              <div className="text-sm text-gray-500 flex items-center">
                                <Mail className="h-3 w-3 mr-1" />
                                {member.email}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {member.phone}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{member.role}</div>
                          <div className="text-sm text-gray-500">{member.department}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(member.status)}`}
                          >
                            {member.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <div className="text-gray-900">{member.performance.ticketsResolved} tickets</div>
                            <div className="text-gray-500">{member.performance.responseTime}m avg response</div>
                            <div className="text-gray-500">⭐ {member.performance.rating.toFixed(1)} rating</div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-900">{member.lastLogin}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-2">
                            <button className="text-green-600 hover:text-green-900">
                              <Eye className="h-4 w-4" />
                            </button>
                            <button className="text-blue-600 hover:text-blue-900">
                              <Edit className="h-4 w-4" />
                            </button>
                            <button className="text-red-600 hover:text-red-900">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "leave" && (
            <div className="space-y-4">
              {leaveRequests?.map((request) => (
                <div key={request.id} className="border border-gray-200 rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{request.staffName}</h3>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getLeaveStatusColor(request.status)}`}
                        >
                          {request.status}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs font-semibold rounded-full ${getLeaveTypeColor(request.type)}`}
                        >
                          {request.type}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        <div>
                          <p className="text-sm font-medium text-gray-600">Start Date</p>
                          <p className="text-sm text-gray-900">{new Date(request.startDate).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">End Date</p>
                          <p className="text-sm text-gray-900">{new Date(request.endDate).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">Applied</p>
                          <p className="text-sm text-gray-900">{new Date(request.appliedAt).toLocaleDateString()}</p>
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-600 mb-1">Reason</p>
                        <p className="text-sm text-gray-900">{request.reason}</p>
                      </div>
                    </div>

                    {request.status === "PENDING" && (
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => handleLeaveAction(request.id, "approve")}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleLeaveAction(request.id, "reject")}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "attendance" && (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Attendance Tracking</h3>
              <p className="text-gray-600 mb-4">Track staff clock-in/clock-out times and attendance patterns</p>
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                View Attendance Records
              </button>
            </div>
          )}

          {activeTab === "performance" && (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Performance Analytics</h3>
              <p className="text-gray-600 mb-4">Detailed performance metrics and analytics for all staff members</p>
              <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                View Performance Reports
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
