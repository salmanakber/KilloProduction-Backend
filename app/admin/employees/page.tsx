"use client"

import { useState, useEffect } from "react"
import {
  Users,
  UserPlus,
  Edit,
  Trash2,
  Eye,
  Search,
  Download,
  Settings,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Phone,
  Calendar,
  Activity,
} from "lucide-react"

interface Employee {
  id: string
  name: string
  email: string
  phone: string
  role: "SUPER_ADMIN" | "ADMIN" | "SUPPORT" | "OPERATIONS" | "FINANCE" | "MARKETING" | "HR"
  department: string
  permissions: string[]
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED"
  isVerified: boolean
  lastLogin: string
  joinedAt: string
  avatar?: string
  modules: string[]
}

interface AdminAccess {
  accessRole: string
  grants: string[]
  modules: string[]
}

interface EmployeeStats {
  totalEmployees: number
  activeEmployees: number
  inactiveEmployees: number
  pendingVerification: number
}

const ROLES = [
  { value: "SUPER_ADMIN", label: "Super Admin", color: "bg-red-100 text-red-800" },
  { value: "ADMIN", label: "Admin", color: "bg-purple-100 text-purple-800" },
  { value: "SUPPORT", label: "Support", color: "bg-blue-100 text-blue-800" },
  { value: "OPERATIONS", label: "Operations", color: "bg-green-100 text-green-800" },
  { value: "FINANCE", label: "Finance", color: "bg-yellow-100 text-yellow-800" },
  { value: "MARKETING", label: "Marketing", color: "bg-pink-100 text-pink-800" },
  { value: "HR", label: "HR", color: "bg-indigo-100 text-indigo-800" },
]

const PERMISSIONS = [
  "USER_MANAGEMENT",
  "VENDOR_APPROVAL",
  "PAYMENT_MANAGEMENT",
  "COMPLAINT_HANDLING",
  "MARKETING_CAMPAIGNS",
  "ANALYTICS_VIEW",
  "SYSTEM_SETTINGS",
  "AUDIT_LOGS",
  "COMMISSION_SETTINGS",
  "NOTIFICATION_MANAGEMENT",
]

const MODULES = ["PHARMACY", "AUTO_PARTS", "FOOD", "GROCERY", "RIDING"]

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [stats, setStats] = useState<EmployeeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [currentAccess, setCurrentAccess] = useState<AdminAccess | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [roleFilter, setRoleFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    phone: "",
    role: "SUPPORT",
    department: "",
    permissions: [] as string[],
    modules: [] as string[],
    password: "",
  })
  const [editEmployee, setEditEmployee] = useState({
    id: "",
    name: "",
    email: "",
    phone: "",
    role: "SUPPORT",
    department: "",
    permissions: [] as string[],
    modules: [] as string[],
  })

  useEffect(() => {
    fetchEmployeeData()
  }, [searchTerm, roleFilter, statusFilter])

  useEffect(() => {
    fetch("/api/admin/access/me")
      .then((r) => r.json())
      .then((data) => setCurrentAccess(data))
      .catch(() => setCurrentAccess(null))
  }, [])

  const fetchEmployeeData = async () => {
    try {
      const [employeesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/employees/list?search=${searchTerm}&role=${roleFilter}&status=${statusFilter}`),
        fetch("/api/admin/employees/stats"),
      ])

      const [employeesData, statsData] = await Promise.all([employeesResponse.json(), statsResponse.json()])

      setEmployees(employeesData.employees)
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch employee data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateEmployee = async () => {
    try {
      const response = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmployee),
      })

      if (response.ok) {
        fetchEmployeeData()
        setShowCreateModal(false)
        setNewEmployee({
          name: "",
          email: "",
          phone: "",
          role: "SUPPORT",
          department: "",
          permissions: [],
          modules: [],
          password: "",
        })
      }
    } catch (error) {
      console.error("Failed to create employee:", error)
    }
  }

  const handleOpenEditModal = (employee: Employee) => {
    setEditEmployee({
      id: employee.id,
      name: employee.name || "",
      email: employee.email || "",
      phone: employee.phone || "",
      role: employee.role,
      department: employee.department || "",
      permissions: employee.permissions || [],
      modules: employee.modules || [],
    })
    setShowEditModal(true)
  }

  const handleUpdateEmployee = async () => {
    try {
      const response = await fetch(`/api/admin/employees/${editEmployee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editEmployee),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "Failed to update employee")
      setShowEditModal(false)
      fetchEmployeeData()
    } catch (error) {
      alert((error as Error).message)
    }
  }

  const canDeleteEmployees = !!currentAccess && (currentAccess.accessRole === "SUPER_ADMIN" || currentAccess.grants?.includes("settings.manage"))

  const handleUpdateEmployeeStatus = async (employeeId: string, status: string) => {
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })

      if (response.ok) {
        fetchEmployeeData()
      }
    } catch (error) {
      console.error("Failed to update employee status:", error)
    }
  }

  const handleDeleteEmployee = async (employeeId: string) => {
    if (!confirm("Delete this employee? This action cannot be undone.")) return
    try {
      const response = await fetch(`/api/admin/employees/${employeeId}`, { method: "DELETE" })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error || "Failed to delete employee")
      setSelectedEmployee(null)
      fetchEmployeeData()
    } catch (error) {
      alert((error as Error).message)
    }
  }

  const handleExportEmployees = () => {
    const header = ["Name", "Email", "Phone", "Role", "Department", "Status", "Joined At"]
    const rows = employees.map((employee) => [
      employee.name,
      employee.email,
      employee.phone,
      employee.role,
      employee.department,
      employee.status,
      new Date(employee.joinedAt).toISOString(),
    ])
    const csv = [header, ...rows].map((row) => row.map((v) => `"${String(v || "").replaceAll('"', '""')}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "employees.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const getRoleColor = (role: string) => {
    const roleConfig = ROLES.find((r) => r.value === role)
    return roleConfig?.color || "bg-gray-100 text-gray-800"
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-800"
      case "INACTIVE":
        return "bg-gray-100 text-gray-800"
      case "SUSPENDED":
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
          <h1 className="text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-gray-600 mt-1">Manage admin staff, roles, and permissions</p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={handleExportEmployees} className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Employee
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Employees</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalEmployees}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.activeEmployees}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Inactive</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.inactiveEmployees}</p>
            </div>
            <div className="h-12 w-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <XCircle className="h-6 w-6 text-gray-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Verification</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.pendingVerification}</p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search employees by name, email, or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
            >
              <option value="ALL">All Roles</option>
              {ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>
      </div>

      {/* Employees Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role & Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Permissions & Modules
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Activity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="h-10 w-10 bg-gray-200 rounded-full flex items-center justify-center">
                        {employee.avatar ? (
                          <img
                            src={employee.avatar || "/placeholder.svg"}
                            alt={employee.name}
                            className="h-10 w-10 rounded-full"
                          />
                        ) : (
                          <span className="text-sm font-medium text-gray-600">
                            {employee.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        )}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{employee.name}</div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Mail className="h-3 w-3 mr-1" />
                          {employee.email}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center">
                          <Phone className="h-3 w-3 mr-1" />
                          {employee.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleColor(employee.role)}`}
                      >
                        {ROLES.find((r) => r.value === employee.role)?.label}
                      </span>
                      <div className="text-sm text-gray-500">{employee.department}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Permissions ({employee.permissions.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {employee.permissions.slice(0, 2).map((permission) => (
                            <span key={permission} className="px-1 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                              {permission.replace("_", " ")}
                            </span>
                          ))}
                          {employee.permissions.length > 2 && (
                            <span className="px-1 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                              +{employee.permissions.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Modules ({employee.modules.length})</div>
                        <div className="flex flex-wrap gap-1">
                          {employee.modules.slice(0, 2).map((module) => (
                            <span key={module} className="px-1 py-0.5 text-xs bg-green-100 text-green-800 rounded">
                              {module}
                            </span>
                          ))}
                          {employee.modules.length > 2 && (
                            <span className="px-1 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                              +{employee.modules.length - 2}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(employee.status)}`}
                      >
                        {employee.status}
                      </span>
                      <div className="flex items-center text-xs text-gray-500">
                        {employee.isVerified ? (
                          <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500 mr-1" />
                        )}
                        {employee.isVerified ? "Verified" : "Unverified"}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <div className="flex items-center text-gray-900">
                        <Activity className="h-3 w-3 mr-1" />
                        {employee.lastLogin}
                      </div>
                      <div className="flex items-center text-gray-500 mt-1">
                        <Calendar className="h-3 w-3 mr-1" />
                        Joined {new Date(employee.joinedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedEmployee(employee)}
                        className="text-green-600 hover:text-green-900"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(employee)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedEmployee(employee)
                          setShowSettingsModal(true)
                        }}
                        className="text-gray-600 hover:text-gray-900"
                        title="Settings"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteEmployee(employee.id)}
                        className={`text-red-600 hover:text-red-900 ${!canDeleteEmployees ? "opacity-40 pointer-events-none" : ""}`}
                        title="Delete"
                      >
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

      {/* Create Employee Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Add New Employee</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newEmployee.name}
                    onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newEmployee.email}
                    onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="Enter email address"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={newEmployee.phone}
                    onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="Enter phone number"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <input
                    type="text"
                    value={newEmployee.department}
                    onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="Enter department"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Initial Password</label>
                  <input
                    type="text"
                    value={newEmployee.password}
                    onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                    placeholder="Set temporary password"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={newEmployee.role}
                  onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
                >
                  {ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
                <div className="grid grid-cols-2 gap-2">
                  {PERMISSIONS.map((permission) => (
                    <label key={permission} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newEmployee.permissions.includes(permission)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewEmployee({
                              ...newEmployee,
                              permissions: [...newEmployee.permissions, permission],
                            })
                          } else {
                            setNewEmployee({
                              ...newEmployee,
                              permissions: newEmployee.permissions.filter((p) => p !== permission),
                            })
                          }
                        }}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">{permission.replace("_", " ")}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Module Access</label>
                <div className="grid grid-cols-3 gap-2">
                  {MODULES.map((module) => (
                    <label key={module} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newEmployee.modules.includes(module)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewEmployee({
                              ...newEmployee,
                              modules: [...newEmployee.modules, module],
                            })
                          } else {
                            setNewEmployee({
                              ...newEmployee,
                              modules: newEmployee.modules.filter((m) => m !== module),
                            })
                          }
                        }}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">{module}</span>
                    </label>
                  ))}
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
                onClick={handleCreateEmployee}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                Create Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View/Edit Employee Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-xl w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Employee Details</h2>
              <button onClick={() => setSelectedEmployee(null)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-700">
              <p><strong>Name:</strong> {selectedEmployee.name}</p>
              <p><strong>Email:</strong> {selectedEmployee.email}</p>
              <p><strong>Phone:</strong> {selectedEmployee.phone || "N/A"}</p>
              <p><strong>Role:</strong> {selectedEmployee.role}</p>
              <p><strong>Department:</strong> {selectedEmployee.department || "N/A"}</p>
              <p><strong>Status:</strong> {selectedEmployee.status}</p>
              <p><strong>Modules:</strong> {selectedEmployee.modules.join(", ") || "None"}</p>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => handleUpdateEmployeeStatus(selectedEmployee.id, selectedEmployee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Toggle Status
              </button>
              <button
                onClick={() => handleDeleteEmployee(selectedEmployee.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {showEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit Employee</h2>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input value={editEmployee.name} onChange={(e) => setEditEmployee({ ...editEmployee, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Name" />
              <input value={editEmployee.email} onChange={(e) => setEditEmployee({ ...editEmployee, email: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Email" />
              <input value={editEmployee.phone} onChange={(e) => setEditEmployee({ ...editEmployee, phone: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Phone" />
              <input value={editEmployee.department} onChange={(e) => setEditEmployee({ ...editEmployee, department: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="Department" />
              <select value={editEmployee.role} onChange={(e) => setEditEmployee({ ...editEmployee, role: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 md:col-span-2">
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={handleUpdateEmployee} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Save Changes</button>
            </div>
          </div>
        </div>
      )}
      {showSettingsModal && selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-xl w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Employee Settings</h2>
              <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">Manage account status for {selectedEmployee.name}.</p>
            <div className="flex items-center gap-2">
              <button onClick={() => handleUpdateEmployeeStatus(selectedEmployee.id, "ACTIVE")} className="px-4 py-2 bg-green-600 text-white rounded-lg">Set Active</button>
              <button onClick={() => handleUpdateEmployeeStatus(selectedEmployee.id, "INACTIVE")} className="px-4 py-2 bg-gray-600 text-white rounded-lg">Set Inactive</button>
              <button onClick={() => handleUpdateEmployeeStatus(selectedEmployee.id, "SUSPENDED")} className="px-4 py-2 bg-red-600 text-white rounded-lg">Suspend</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
