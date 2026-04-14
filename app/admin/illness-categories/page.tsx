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
  Heart,
  Package,
  Calendar,
  Star,
  UserCheck,
  UserX,
  Trash2,
  Activity,
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

interface IllnessCategory {
  id: string
  name: string
  displayName: string
  description?: string
  icon?: string
  isCommon: boolean
  symptoms?: any
  medicines?: any
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function IllnessCategoryManagement() {
  const [illnessCategories, setIllnessCategories] = useState<IllnessCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCommon, setSelectedCommon] = useState("ALL")
  const [selectedStatus, setSelectedStatus] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedCategoryForModal, setSelectedCategoryForModal] = useState<IllnessCategory | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchIllnessCategories()
  }, [currentPage, searchTerm, selectedCommon, selectedStatus])

  const fetchIllnessCategories = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        search: searchTerm,
        common: selectedCommon,
        status: selectedStatus,
      })

      const response = await fetch(`/api/admin/illness-categories?${params}`)
      const data = await response.json()

      setIllnessCategories(data.illnesses)
      setTotalPages(data.pagination.pages)
    } catch (error) {
      console.error("Failed to fetch illness categories:", error)
      toast({
        title: "Error",
        description: "Failed to fetch illness categories. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (categoryId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/illness-categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })

      if (!response.ok) {
        throw new Error("Failed to update illness category status")
      }

      toast({
        title: "Status Updated",
        description: `Illness category has been ${isActive ? "activated" : "deactivated"}.`,
      })

      fetchIllnessCategories()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update illness category status.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this illness category?")) return

    try {
      const response = await fetch(`/api/admin/illness-categories/${categoryId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete illness category")
      }

      toast({
        title: "Illness Category Deleted",
        description: "Illness category has been successfully deleted.",
      })

      fetchIllnessCategories()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete illness category.",
        variant: "destructive",
      })
    }
  }

  const handleBulkAction = async (action: string) => {
    if (selectedCategories.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select illness categories to perform bulk actions.",
        variant: "destructive",
      })
      return
    }

    try {
      const response = await fetch("/api/admin/illness-categories/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, categoryIds: selectedCategories }),
      })

      if (!response.ok) {
        throw new Error("Failed to perform bulk action")
      }

      toast({
        title: "Bulk Action Completed",
        description: `Successfully ${action.toLowerCase()}ed ${selectedCategories.length} illness categories.`,
      })

      setSelectedCategories([])
      fetchIllnessCategories()
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

  const getCommonColor = (isCommon: boolean) => {
    return isCommon ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCategories(illnessCategories.map((c) => c.id))
    } else {
      setSelectedCategories([])
    }
  }

  const handleSelectCategory = (categoryId: string, checked: boolean) => {
    if (checked) {
      setSelectedCategories([...selectedCategories, categoryId])
    } else {
      setSelectedCategories(selectedCategories.filter((id) => id !== categoryId))
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
          <h1 className="text-3xl font-bold text-gray-900">Illness Category Management</h1>
          <p className="text-gray-600 mt-1">Manage illness categories and their associated medicines</p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            onClick={() => setShowCreateModal(true)}
            className="bg-green-600 hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Category
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
                placeholder="Search illness categories..."
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
            <Select value={selectedCommon} onValueChange={setSelectedCommon}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                <SelectItem value="true">Common Only</SelectItem>
                <SelectItem value="false">Not Common</SelectItem>
              </SelectContent>
            </Select>

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
      {selectedCategories.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-blue-800">
              {selectedCategories.length} category(ies) selected
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
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBulkAction("DELETE")}
                className="text-red-600 hover:text-red-700"
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Illness Categories Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <input
                    type="checkbox"
                    checked={selectedCategories.length === illnessCategories.length}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Common
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Medicines
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
              {illnessCategories.map((category) => (
                <tr key={category.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(category.id)}
                      onChange={(e) => handleSelectCategory(category.id, e.target.checked)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                          <Heart className="h-5 w-5 text-red-600" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{category.displayName}</div>
                        <div className="text-sm text-gray-500">{category.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {category.description || "No description"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getCommonColor(category.isCommon)}>
                      {category.isCommon ? "Common" : "Not Common"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {category.medicines?.length || 0} medicines
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Badge className={getStatusColor(category.isActive)}>
                      {category.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(category.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCategoryForModal(category)
                            setShowViewModal(true)
                          }}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedCategoryForModal(category)
                            setShowEditModal(true)
                          }}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleStatusChange(category.id, !category.isActive)}
                        >
                          {category.isActive ? (
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
                          onClick={() => handleDelete(category.id)}
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
        <IllnessCategoryCreateModal
          onSuccess={() => {
            setShowCreateModal(false)
            fetchIllnessCategories()
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showEditModal && selectedCategoryForModal && (
        <IllnessCategoryEditModal
          category={selectedCategoryForModal}
          onSuccess={() => {
            setShowEditModal(false)
            setSelectedCategoryForModal(null)
            fetchIllnessCategories()
          }}
          onClose={() => {
            setShowEditModal(false)
            setSelectedCategoryForModal(null)
          }}
        />
      )}

      {showViewModal && selectedCategoryForModal && (
        <IllnessCategoryViewModal
          category={selectedCategoryForModal}
          onClose={() => {
            setShowViewModal(false)
            setSelectedCategoryForModal(null)
          }}
        />
      )}
    </div>
  )
}

// Illness Category Create Modal Component
function IllnessCategoryCreateModal({
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
    icon: "",
    isCommon: false,
    symptoms: [] as string[],
    medicines: [] as string[],
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch("/api/admin/illness-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create illness category")
      }

      toast({
        title: "Illness Category Created",
        description: "Illness category has been successfully created.",
      })
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create illness category.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white">
        <DialogHeader>
          <DialogTitle>Add New Illness Category</DialogTitle>
          <DialogDescription>
            Add a new illness category to organize medicines and symptoms.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name (Internal)</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., malaria"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="e.g., Malaria"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              placeholder="Describe the illness category..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Icon</label>
              <Input
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="Icon name or URL"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isCommon"
                checked={formData.isCommon}
                onChange={(e) => setFormData({ ...formData, isCommon: e.target.checked })}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="isCommon" className="text-sm font-medium text-gray-700">
                Common Category (Show on home screen)
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Symptoms (comma separated)</label>
              <Input
                value={Array.isArray(formData.symptoms) ? formData.symptoms.join(", ") : ""}
                onChange={(e) => setFormData({ ...formData, symptoms: e.target.value.split(", ").filter(Boolean) })}
                placeholder="e.g., fever, headache, nausea"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Related Medicines (comma separated)</label>
              <Input
                value={Array.isArray(formData.medicines) ? formData.medicines.join(", ") : ""}
                onChange={(e) => setFormData({ ...formData, medicines: e.target.value.split(", ").filter(Boolean) })}
                placeholder="e.g., paracetamol, ibuprofen"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Illness Category Edit Modal Component
function IllnessCategoryEditModal({
  category,
  onSuccess,
  onClose,
}: {
  category: IllnessCategory
  onSuccess: () => void
  onClose: () => void
}) {
  const [formData, setFormData] = useState({
    name: category.name,
    displayName: category.displayName,
    description: category.description || "",
    icon: category.icon || "",
    isCommon: category.isCommon,
    symptoms: category.symptoms || [],
    medicines: category.medicines || [],
    isActive: category.isActive,
  })
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/admin/illness-categories/${category.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update illness category")
      }

      toast({
        title: "Illness Category Updated",
        description: "Illness category has been successfully updated.",
      })
      onSuccess()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update illness category.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Illness Category</DialogTitle>
          <DialogDescription>
            Update illness category information and settings.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name (Internal)</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., malaria"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <Input
                value={formData.displayName}
                onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                placeholder="e.g., Malaria"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              rows={3}
              placeholder="Describe the illness category..."
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Icon</label>
              <Input
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                placeholder="Icon name or URL"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isCommon"
                checked={formData.isCommon}
                onChange={(e) => setFormData({ ...formData, isCommon: e.target.checked })}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label htmlFor="isCommon" className="text-sm font-medium text-gray-700">
                Common Category (Show on home screen)
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Symptoms (comma separated)</label>
              <Input
                value={Array.isArray(formData.symptoms) ? formData.symptoms.join(", ") : ""}
                onChange={(e) => setFormData({ ...formData, symptoms: e.target.value.split(", ").filter(Boolean) })}
                placeholder="e.g., fever, headache, nausea"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Related Medicines (comma separated)</label>
              <Input
                value={Array.isArray(formData.medicines) ? formData.medicines.join(", ") : ""}
                onChange={(e) => setFormData({ ...formData, medicines: e.target.value.split(", ").filter(Boolean) })}
                placeholder="e.g., paracetamol, ibuprofen"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
              Active
            </label>
          </div>
          <div className="flex justify-end space-x-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Update Category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// Illness Category View Modal Component
function IllnessCategoryViewModal({
  category,
  onClose,
}: {
  category: IllnessCategory
  onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Illness Category Details</DialogTitle>
          <DialogDescription>View detailed information about the illness category.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name (Internal)</label>
              <p className="text-sm text-gray-900">{category.name}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Display Name</label>
              <p className="text-sm text-gray-900">{category.displayName}</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Description</label>
            <p className="text-sm text-gray-900">{category.description || "No description"}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Icon</label>
              <p className="text-sm text-gray-900">{category.icon || "No icon"}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Common Category</label>
              <Badge className={getCommonColor(category.isCommon)}>
                {category.isCommon ? "Yes" : "No"}
              </Badge>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <Badge className={getStatusColor(category.isActive)}>
              {category.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Symptoms</label>
            <p className="text-sm text-gray-900">
              {Array.isArray(category.symptoms) ? category.symptoms.join(", ") : "N/A"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Related Medicines</label>
            <p className="text-sm text-gray-900">
              {Array.isArray(category.medicines) ? category.medicines.join(", ") : "N/A"}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Created</label>
            <p className="text-sm text-gray-900">
              {new Date(category.createdAt).toLocaleDateString()}
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

function getCommonColor(isCommon: boolean) {
  return isCommon ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
} 