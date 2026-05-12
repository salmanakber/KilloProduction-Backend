"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Filter,
  Download,
  Edit,
  Eye,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Phone,
  Calendar,
  Star,
  UserCheck,
  UserX,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { UserEditModal } from "@/components/components/admin/UserEditModal"
import { UserViewModal } from "@/components/components/admin/UserViewModal"
import { useToast } from "../../../hooks/use-toast"
import type { User } from "../../type/index"

interface AdminUser extends User {
  deletedAt?: string | null
  recoverableUntil?: string | null
}

export default function UserManagement() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedRole, setSelectedRole] = useState("ALL")
  const [selectedModule, setSelectedModule] = useState("ALL")
  const [selectedStatus, setSelectedStatus] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedUserForModal, setSelectedUserForModal] = useState<AdminUser | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchUsers()
  }, [currentPage, searchTerm, selectedRole, selectedModule, selectedStatus])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        search: searchTerm,
        role: selectedRole,
        module: selectedModule,
        status: selectedStatus,
      })

      const response = await fetch(`/api/admin/users/list?${params}`)
      const data = await response.json()

      setUsers(data.users)
      setTotalPages(data.pagination.pages)
    } catch (error) {
      console.error("Failed to fetch users:", error)
      toast({
        title: "Error",
        description: "Failed to fetch users. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (userId: string, newStatus: User["status"]) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        toast({
          title: "User Status Updated",
          description: `User status changed to ${newStatus.toLowerCase()}.`,
        })
        fetchUsers()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update user status")
      }
    } catch (error: any) {
      console.error("Failed to update user status:", error)
      toast({
        title: "Error",
        description: error.message || "There was an error updating user status.",
        variant: "destructive",
      })
    }
  }

  const handleVerificationChange = async (userId: string, isVerified: boolean) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVerified }),
      })

      if (response.ok) {
        toast({
          title: "User Verification Updated",
          description: `User verification status changed to ${isVerified ? "verified" : "unverified"}.`,
        })
        fetchUsers()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update user verification")
      }
    } catch (error: any) {
      console.error("Failed to update user verification:", error)
      toast({
        title: "Error",
        description: error.message || "There was an error updating user verification.",
        variant: "destructive",
      })
    }
  }

  const handleAccountAction = async (userId: string, accountAction: "RESTORE_ACCOUNT" | "ACTIVATE_ACCOUNT" | "DEACTIVATE_ACCOUNT") => {
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountAction }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to apply account action")
      }

      toast({
        title: "Account Updated",
        description:
          accountAction === "RESTORE_ACCOUNT"
            ? "Account was recovered successfully."
            : accountAction === "ACTIVATE_ACCOUNT"
            ? "Account was activated successfully."
            : "Account was deactivated successfully.",
      })
      fetchUsers()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Unable to update account.",
        variant: "destructive",
      })
    }
  }

  const handleBulkAction = async (action: string) => {
    try {
      const response = await fetch("/api/admin/users/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedUsers, action }),
      })

      if (response.ok) {
        toast({
          title: "Bulk Action Successful",
          description: `Bulk action '${action}' applied to selected users.`,
        })
        setSelectedUsers([])
        fetchUsers()
      } else {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to perform bulk action")
      }
    } catch (error: any) {
      console.error("Failed to perform bulk action:", error)
      toast({
        title: "Error",
        description: error.message || "There was an error performing the bulk action.",
        variant: "destructive",
      })
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "INACTIVE":
        return "bg-slate-50 text-slate-700 border-slate-200"
      case "SUSPENDED":
        return "bg-red-50 text-red-700 border-red-200"
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-200"
      default:
        return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  const getStatusDot = (status: string) => {
    switch (status) {
      case "ACTIVE": return "bg-emerald-500"
      case "INACTIVE": return "bg-slate-400"
      case "SUSPENDED": return "bg-red-500"
      case "PENDING": return "bg-amber-500"
      default: return "bg-slate-400"
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case "CUSTOMER":
        return "bg-blue-50 text-blue-700 border-blue-200"
      case "VENDOR":
        return "bg-purple-50 text-purple-700 border-purple-200"
      case "RIDER":
        return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "WHOLESALER":
        return "bg-orange-50 text-orange-700 border-orange-200"
      default:
        return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">User Management</h1>
          <p className="text-slate-500 mt-1.5 text-sm font-medium">Manage all users across the Kilo Super App platform</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" className="flex items-center bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm rounded-xl h-10 font-semibold transition-all">
            <Download className="h-4 w-4 mr-2 text-slate-500" />
            Export
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0 gap-4">
          <div className="flex-1 max-w-lg">
            <div className="relative group">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 group-focus-within:text-emerald-500 transition-colors" />
              <Input
                type="text"
                placeholder="Search users by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 h-11 w-full bg-slate-50/50 border-slate-200 rounded-xl focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Button 
              variant="outline" 
              onClick={() => setShowFilters(!showFilters)} 
              className={`flex items-center h-11 rounded-xl font-semibold border-slate-200 transition-all ${showFilters ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <Filter className={`h-4 w-4 mr-2 ${showFilters ? 'text-emerald-600' : 'text-slate-500'}`} />
              Filters
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-5 pt-5 border-t border-slate-100 animate-in slide-in-from-top-2 fade-in duration-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:ring-emerald-500 focus:bg-white">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-xl shadow-lg border-slate-100">
                  <SelectItem value="ALL">All Roles</SelectItem>
                  <SelectItem value="CUSTOMER">Customer</SelectItem>
                  <SelectItem value="VENDOR">Vendor</SelectItem>
                  <SelectItem value="RIDER">Rider</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:ring-emerald-500 focus:bg-white">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-xl shadow-lg border-slate-100">
                  <SelectItem value="ALL">All Modules</SelectItem>
                  <SelectItem value="PHARMACY">Pharmacy</SelectItem>
                  <SelectItem value="AUTO_PARTS">Auto Parts</SelectItem>
                  <SelectItem value="FOOD">Food</SelectItem>
                  <SelectItem value="GROCERY">Grocery</SelectItem>
                  <SelectItem value="RIDING">Riding</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 focus:ring-emerald-500 focus:bg-white">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent className="bg-white rounded-xl shadow-lg border-slate-100">
                  <SelectItem value="ALL">All Status</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="INACTIVE">Inactive</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedRole("ALL")
                  setSelectedModule("ALL")
                  setSelectedStatus("ALL")
                  setSearchTerm("")
                }}
                className="h-11 rounded-xl text-slate-500 font-semibold hover:text-slate-900 hover:bg-slate-100"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions Banner */}
      {selectedUsers.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 shadow-sm animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <span className="text-emerald-800 font-semibold flex items-center">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-200 text-emerald-700 text-xs mr-3">
                {selectedUsers.length}
              </span>
              User{selectedUsers.length > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center space-x-2">
              <Button
                size="sm"
                onClick={() => handleBulkAction("activate")}
                className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg shadow-sm font-semibold border-0"
              >
                Activate
              </Button>
              <Button
                size="sm"
                onClick={() => handleBulkAction("suspend")}
                className="bg-red-500 text-white hover:bg-red-600 rounded-lg shadow-sm font-semibold border-0"
              >
                Suspend
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedUsers([])}
                className="bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-slate-200 rounded-lg font-semibold"
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/80">
              <tr>
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUsers(users.map((u) => u.id))
                      } else {
                        setSelectedUsers([])
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Role & Module</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Activity</th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Performance</th>
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-50">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center space-y-4">
                      <div className="animate-spin rounded-full h-10 w-10 border-4 border-slate-100 border-t-emerald-500"></div>
                      <p className="text-slate-500 font-medium">Loading users...</p>
                    </div>
                  </td>
                </tr>
              ) : users && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center text-slate-500 font-medium">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center">
                        <Search className="h-6 w-6 text-slate-300" />
                      </div>
                      <p>No users found matching your criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/80 transition-colors duration-150 group">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(user.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedUsers([...selectedUsers, user.id])
                          } else {
                            setSelectedUsers(selectedUsers.filter((id) => id !== user.id))
                          }
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-11 w-11 rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200 shrink-0 shadow-sm">
                          {user.avatar ? (
                            <img
                              src={user.avatar || "/placeholder.svg"}
                              alt={user.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <Mail className="h-4 w-4 text-slate-400" />
                          )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-bold text-slate-900">{user.name}</div>
                          <div className="text-xs font-medium text-slate-500 mt-0.5 flex items-center">
                            <Mail className="h-3 w-3 mr-1.5 opacity-70" />
                            {user.email}
                          </div>
                          <div className="text-xs font-medium text-slate-500 mt-0.5 flex items-center">
                            <Phone className="h-3 w-3 mr-1.5 opacity-70" />
                            {user.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-1.5">
                        <span className={`inline-flex px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide border rounded-md ${getRoleColor(user.role)}`}>
                          {user.role}
                        </span>
                        {user.module && <div className="text-xs font-medium text-slate-500 capitalize">{user.module.replace("_", " ").toLowerCase()}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="space-y-2">
                        <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide border rounded-full ${getStatusColor(user.status)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${getStatusDot(user.status)}`} />
                          {user.status}
                        </span>
                        <div className="flex items-center text-xs font-medium text-slate-600">
                          {user.isVerified ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                              Verified
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
                              Unverified
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-slate-700 font-medium space-y-1">
                        <div className="flex items-center">
                          <Calendar className="h-3.5 w-3.5 mr-2 text-slate-400" />
                          {new Date(user.joinedAt).toLocaleDateString()}
                        </div>
                        <div className="flex items-center text-slate-500 text-xs">
                          <Clock className="h-3 w-3 mr-2 opacity-70" />
                          Active {new Date(user.lastActive).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="text-slate-900 font-bold">{user.totalOrders} <span className="text-slate-500 font-medium text-xs">orders</span></div>
                        <div className="text-slate-700 font-semibold mt-0.5">₦{user.totalSpent.toLocaleString()} <span className="text-slate-500 font-medium text-xs">spent</span></div>
                        {user.rating > 0 && (
                          <div className="flex items-center mt-1.5">
                            <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400 mr-1" />
                            <span className="text-xs font-bold text-slate-700">{user.rating.toFixed(1)}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-1 opacity-100 lg:opacity-50 group-hover:opacity-100 transition-opacity">
                        <Dialog
                          open={showViewModal && selectedUserForModal?.id === user.id}
                          onOpenChange={setShowViewModal}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg" onClick={() => { setSelectedUserForModal(user); setShowViewModal(true); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white border-0 shadow-2xl rounded-2xl">
                            <DialogHeader>
                              <DialogTitle className="text-2xl font-bold text-slate-900">User Details</DialogTitle>
                              <DialogDescription className="text-slate-500 font-medium">Comprehensive information for {selectedUserForModal?.name}</DialogDescription>
                            </DialogHeader>
                            {selectedUserForModal && (
                              <UserViewModal userId={selectedUserForModal.id} onClose={() => setShowViewModal(false)} />
                            )}
                          </DialogContent>
                        </Dialog>

                        <Dialog
                          open={showEditModal && selectedUserForModal?.id === user.id}
                          onOpenChange={setShowEditModal}
                        >
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg" onClick={() => { setSelectedUserForModal(user); setShowEditModal(true); }}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-md bg-white border-0 shadow-2xl rounded-2xl">
                            <DialogHeader>
                              <DialogTitle className="text-xl font-bold text-slate-900">Edit User</DialogTitle>
                              <DialogDescription className="text-slate-500 font-medium">Update profile info for {selectedUserForModal?.name}</DialogDescription>
                            </DialogHeader>
                            {selectedUserForModal && (
                              <UserEditModal
                                user={selectedUserForModal}
                                onSuccess={() => {
                                  fetchUsers()
                                  setShowEditModal(false)
                                }}
                                onClose={() => setShowEditModal(false)}
                              />
                            )}
                          </DialogContent>
                        </Dialog>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-white rounded-xl shadow-lg border-slate-100 p-1 min-w-[180px]">
                            <DropdownMenuLabel className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 py-1.5">Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator className="bg-slate-100" />
                            <DropdownMenuItem onClick={() => { setSelectedUserForModal(user); setShowViewModal(true); }} className="rounded-md font-medium cursor-pointer focus:bg-slate-50 focus:text-slate-900">
                              <Eye className="h-4 w-4 mr-2 text-slate-400" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setSelectedUserForModal(user); setShowEditModal(true); }} className="rounded-md font-medium cursor-pointer focus:bg-slate-50 focus:text-slate-900">
                              <Edit className="h-4 w-4 mr-2 text-slate-400" /> Edit User
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-100" />
                            <DropdownMenuItem onClick={() => handleStatusChange(user.id, "ACTIVE")} disabled={user.status === "ACTIVE"} className="rounded-md font-medium cursor-pointer focus:bg-emerald-50 focus:text-emerald-700">
                              <CheckCircle className="h-4 w-4 mr-2 text-emerald-500" /> Activate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(user.id, "INACTIVE")} disabled={user.status === "INACTIVE"} className="rounded-md font-medium cursor-pointer focus:bg-slate-50 focus:text-slate-700">
                              <XCircle className="h-4 w-4 mr-2 text-slate-400" /> Deactivate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAccountAction(user.id, "ACTIVATE_ACCOUNT")} className="rounded-md font-medium cursor-pointer focus:bg-emerald-50 focus:text-emerald-700">
                              <UserCheck className="h-4 w-4 mr-2 text-emerald-500" /> Force Activate
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleAccountAction(user.id, "DEACTIVATE_ACCOUNT")} className="rounded-md font-medium cursor-pointer focus:bg-slate-50 focus:text-slate-700">
                              <UserX className="h-4 w-4 mr-2 text-slate-400" /> Force Deactivate
                            </DropdownMenuItem>
                            {!!user.deletedAt && (
                              <DropdownMenuItem onClick={() => handleAccountAction(user.id, "RESTORE_ACCOUNT")} className="rounded-md font-medium cursor-pointer focus:bg-blue-50 focus:text-blue-700">
                                <CheckCircle className="h-4 w-4 mr-2 text-blue-500" /> Recover Deleted (30d)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => handleStatusChange(user.id, "SUSPENDED")} disabled={user.status === "SUSPENDED"} className="rounded-md font-medium cursor-pointer focus:bg-red-50 focus:text-red-700 text-red-600">
                              <Clock className="h-4 w-4 mr-2 text-red-500" /> Suspend
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="bg-slate-100" />
                            <DropdownMenuItem onClick={() => handleVerificationChange(user.id, true)} disabled={user.isVerified} className="rounded-md font-medium cursor-pointer focus:bg-blue-50 focus:text-blue-700">
                              <UserCheck className="h-4 w-4 mr-2 text-blue-500" /> Verify User
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleVerificationChange(user.id, false)} disabled={!user.isVerified} className="rounded-md font-medium cursor-pointer focus:bg-orange-50 focus:text-orange-700 text-orange-600">
                              <UserX className="h-4 w-4 mr-2 text-orange-500" /> Unverify User
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="bg-slate-50/50 px-6 py-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-slate-500">
              Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-lg font-semibold text-slate-600 border-slate-200 hover:bg-white disabled:opacity-50"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg font-semibold text-slate-600 border-slate-200 hover:bg-white disabled:opacity-50"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}