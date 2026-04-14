"use client"

import { useState, useEffect } from "react"
import {
  Search,
  Filter,
  Download,
  Plus,
  Edit,
  Eye,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Calendar,
  Star,
  UserCheck,
  UserX,
  Trash2,
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
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

interface MedicineOrigin {
  id: string
  name: string
  displayName: string
  description?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  _count: {
    centralMedicines: number
    pharmacySpecializations: number
  }
}

export default function MedicineOriginsManagement() {
  const [medicineOrigins, setMedicineOrigins] = useState<MedicineOrigin[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedOrigins, setSelectedOrigins] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedOriginForModal, setSelectedOriginForModal] = useState<MedicineOrigin | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchMedicineOrigins()
  }, [currentPage, searchTerm, selectedStatus])

  const fetchMedicineOrigins = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        search: searchTerm,
        status: selectedStatus,
      })

      const response = await fetch(`/api/admin/medicine-origins?${params}`)
      const data = await response.json()

      setMedicineOrigins(data.medicineOrigins)
      setTotalPages(data.pagination.pages)
    } catch (error) {
      console.error("Failed to fetch medicine origins:", error)
      toast({
        title: "Error",
        description: "Failed to fetch medicine origins. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (originId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/medicine-origins/${originId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })

      if (!response.ok) {
        throw new Error("Failed to update medicine origin status")
      }

      toast({
        title: "Status Updated",
        description: `Medicine origin has been ${isActive ? "activated" : "deactivated"}.`,
      })

      fetchMedicineOrigins()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update medicine origin status.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (originId: string) => {
    if (!confirm("Are you sure you want to delete this medicine origin?")) return

    try {
      const response = await fetch(`/api/admin/medicine-origins/${originId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to delete medicine origin")
      }

      toast({
        title: "Medicine Origin Deleted",
        description: "Medicine origin has been successfully deleted.",
      })

      fetchMedicineOrigins()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete medicine origin.",
        variant: "destructive",
      })
    }
  }

  const handleBulkAction = async (action: string) => {
    if (selectedOrigins.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select medicine origins to perform bulk actions.",
        variant: "destructive",
      })
      return
    }

    try {
      // For now, we'll handle bulk actions individually
      // In a real implementation, you'd have a bulk endpoint
      for (const originId of selectedOrigins) {
        if (action === "ACTIVATE") {
          await handleStatusChange(originId, true)
        } else if (action === "DEACTIVATE") {
          await handleStatusChange(originId, false)
        }
      }

      toast({
        title: "Bulk Action Completed",
        description: `Successfully ${action.toLowerCase()}ed ${selectedOrigins.length} medicine origins.`,
      })

      setSelectedOrigins([])
      fetchMedicineOrigins()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to perform bulk action.",
        variant: "destructive",
      })
    }
  }

  const getStatusColor = (status: boolean) => {
    return status ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrigins(medicineOrigins.map((o) => o.id))
    } else {
      setSelectedOrigins([])
    }
  }

  const handleSelectOrigin = (originId: string, checked: boolean) => {
    if (checked) {
      setSelectedOrigins([...selectedOrigins, originId])
    } else {
      setSelectedOrigins(selectedOrigins.filter((id) => id !== originId))
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
          <h1 className="text-3xl font-bold text-gray-900">Medicine Origins Management</h1>
          <p className="text-gray-600 mt-1">Manage medicine origins and their availability</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Medicine Origin
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search medicine origins..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" className="flex items-center space-x-2">
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedOrigins.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-blue-800">
              {selectedOrigins.length} medicine origin(s) selected
            </span>
            <div className="flex space-x-2">
              <Button
                size="sm"
                onClick={() => handleBulkAction("ACTIVATE")}
                className="bg-green-600 hover:bg-green-700"
              >
                Activate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("DEACTIVATE")}
              >
                Deactivate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Medicine Origins Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedOrigins.length > 0 && selectedOrigins.length === medicineOrigins.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Medicine Origin
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {medicineOrigins && medicineOrigins.length > 0 && medicineOrigins.map((origin) => (
                <tr key={origin.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedOrigins.includes(origin.id)}
                      onChange={(e) => handleSelectOrigin(origin.id, e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                          <Package className="h-5 w-5 text-blue-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{origin.displayName}</div>
                        <div className="text-sm text-gray-500">{origin.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 max-w-xs truncate" title={origin.description}>
                      {origin.description || "N/A"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <div>Medicines: {origin._count.centralMedicines}</div>
                      <div>Pharmacies: {origin._count.pharmacySpecializations}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getStatusColor(origin.isActive)}>
                      {origin.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(origin.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedOriginForModal(origin)
                            setShowViewModal(true)
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedOriginForModal(origin)
                            setShowEditModal(true)
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(origin.id, !origin.isActive)}
                        >
                          {origin.isActive ? (
                            <>
                              <XCircle className="mr-2 h-4 w-4" />
                              Deactivate
                            </>
                          ) : (
                            <>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Activate
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(origin.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <Button
                variant="outline"
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing page <span className="font-medium">{currentPage}</span> of{" "}
                  <span className="font-medium">{totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Next
                  </Button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <MedicineOriginCreateModal
          onSuccess={() => {
            setShowCreateModal(false)
            fetchMedicineOrigins()
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showEditModal && selectedOriginForModal && (
        <MedicineOriginEditModal
          origin={selectedOriginForModal}
          onSuccess={() => {
            setShowEditModal(false)
            setSelectedOriginForModal(null)
            fetchMedicineOrigins()
          }}
          onClose={() => {
            setShowEditModal(false)
            setSelectedOriginForModal(null)
          }}
        />
      )}

      {showViewModal && selectedOriginForModal && (
        <MedicineOriginViewModal
          origin={selectedOriginForModal}
          onClose={() => {
            setShowViewModal(false)
            setSelectedOriginForModal(null)
          }}
        />
      )}
    </div>
  )
}

// Medicine Origin Create Modal Component
function MedicineOriginCreateModal({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void
  onClose: () => void
}) {
  const [formData, setFormData] = useState({
    name: "",
    displayName: "",
    description: "",
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("/api/admin/medicine-origins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create medicine origin")
      }

      toast({
        title: "Medicine Origin Created",
        description: "Medicine origin has been successfully created.",
      })
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create medicine origin.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Add New Medicine Origin</DialogTitle>
          <DialogDescription>
            Add a new medicine origin to the system.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., NIGERIAN"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Display Name</label>
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="e.g., Nigerian"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              placeholder="Description of this medicine origin"
            />
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Medicine Origin"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Medicine Origin Edit Modal Component
function MedicineOriginEditModal({
  origin,
  onSuccess,
  onClose,
}: {
  origin: MedicineOrigin
  onSuccess: () => void
  onClose: () => void
}) {
  const [formData, setFormData] = useState({
    name: origin.name,
    displayName: origin.displayName,
    description: origin.description || "",
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/admin/medicine-origins/${origin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update medicine origin")
      }

      toast({
        title: "Medicine Origin Updated",
        description: "Medicine origin has been successfully updated.",
      })
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update medicine origin.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Edit Medicine Origin</DialogTitle>
          <DialogDescription>
            Update medicine origin information.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., NIGERIAN"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Display Name</label>
            <Input
              value={formData.displayName}
              onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
              placeholder="e.g., Nigerian"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              placeholder="Description of this medicine origin"
            />
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Medicine Origin"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Medicine Origin View Modal Component
function MedicineOriginViewModal({
  origin,
  onClose,
}: {
  origin: MedicineOrigin
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader>
          <DialogTitle>Medicine Origin Details</DialogTitle>
          <DialogDescription>View detailed information about the medicine origin.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <p className="text-sm text-gray-900">{origin.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Display Name</label>
            <p className="text-sm text-gray-900">{origin.displayName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <p className="text-sm text-gray-900">{origin.description || "N/A"}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Usage</label>
            <div className="text-sm text-gray-900">
              <div>Medicines: {origin._count.centralMedicines}</div>
              <div>Pharmacies: {origin._count.pharmacySpecializations}</div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <Badge className={getStatusColor(origin.isActive)}>
              {origin.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Created</label>
            <p className="text-sm text-gray-900">
              {new Date(origin.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function getStatusColor(status: boolean) {
  return status ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
}
