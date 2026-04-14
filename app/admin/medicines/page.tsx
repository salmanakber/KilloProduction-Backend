"use client"

import { useState, useEffect, useCallback } from "react"
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
  Pill,
  Trash2,
  AlertCircle,
  UploadCloud,
  FileText,
  ArrowRight
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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

// --- TYPES ---
interface Medicine {
  id: string
  name: string
  genericName?: string
  description?: string
  purpose?: string
  dosageInfo?: string
  warnings?: string
  sideEffects?: string[]
  category: string // The new category field
  illnessTypes?: string[] // Converted to array for multi-select
  medicineOrigins?: any[] 
  activeIngredients?: string[]
  form: string
  strength?: string
  manufacturer?: string
  images?: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface IllnessCategory {
  id: string
  name: string
  displayName: string
  description?: string
  icon?: string
  isCommon: boolean
  symptoms?: string[]
  medicines?: string[]
  isActive: boolean
}

type PharmacyCategory = { id: string; name: string; children?: Array<{ id: string; name: string }> }
type MedicineOriginOption = { id: string; name: string; displayName?: string | null; isActive?: boolean }

// --- MAIN COMPONENT ---
export default function MedicineManagement() {
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [illnessCategories, setIllnessCategories] = useState<IllnessCategory[]>([])
  const [pharmacyCategories, setPharmacyCategories] = useState<string[]>([])
  const [medicineOrigins, setMedicineOrigins] = useState<MedicineOriginOption[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters & Pagination
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("ALL")
  const [selectedForm, setSelectedForm] = useState("ALL")
  const [selectedStatus, setSelectedStatus] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  
  // State
  const [selectedMedicines, setSelectedMedicines] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  
  // Modals / Drawers
  const [drawerState, setDrawerState] = useState<{ type: 'create' | 'edit' | 'view' | null; data?: Medicine | null }>({
    type: null,
    data: null,
  })

  const { toast } = useToast()

  // Debounce Search Term
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Fetch Data
  const fetchMedicines = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        search: debouncedSearch,
        category: selectedCategory,
        form: selectedForm,
        status: selectedStatus,
      })

      const response = await fetch(`/api/admin/medicines?${params}`)
      const data = await response.json()

      setMedicines(data.medicines || [])
      setTotalPages(data.pagination?.pages || 1)
    } catch (error) {
      console.error("Failed to fetch medicines:", error)
      toast({ title: "Error", description: "Failed to fetch medicines.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [currentPage, debouncedSearch, selectedCategory, selectedForm, selectedStatus, toast])

  const fetchIllnessCategories = async () => {
    try {
      const response = await fetch("/api/admin/illness-categories")
      const data = await response.json()
      setIllnessCategories(data.illnesses || [])
    } catch (error) {
      console.error("Failed to fetch illness categories:", error)
    }
  }

  const fetchPharmacyCategories = async () => {
    try {
      const res = await fetch("/api/admin/categories?module=PHARMACY&parentId=null&limit=200&status=true")
      const data = await res.json().catch(() => ({}))
      const list: PharmacyCategory[] = Array.isArray(data?.categories) ? data.categories : []

      const names: string[] = []
      for (const c of list) {
        if (c?.name) names.push(String(c.name))
        const children = Array.isArray(c?.children) ? c.children : []
        for (const cc of children) {
          if (cc?.name) names.push(String(cc.name))
        }
      }
      const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
      setPharmacyCategories(unique)
    } catch (error) {
      console.error("Failed to fetch pharmacy categories:", error)
      setPharmacyCategories([])
    }
  }

  const fetchMedicineOrigins = async () => {
    try {
      const res = await fetch("/api/admin/medicine-origins?limit=200&status=true")
      const data = await res.json().catch(() => ({}))
      const list: MedicineOriginOption[] = Array.isArray(data?.medicineOrigins) ? data.medicineOrigins : []
      setMedicineOrigins(list)
    } catch (error) {
      console.error("Failed to fetch medicine origins:", error)
      setMedicineOrigins([])
    }
  }

  useEffect(() => { fetchMedicines() }, [fetchMedicines])
  useEffect(() => { fetchIllnessCategories() }, [])
  useEffect(() => { fetchPharmacyCategories() }, [])
  useEffect(() => { fetchMedicineOrigins() }, [])

  // Actions
  const handleStatusChange = async (medicineId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/medicines/${medicineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      })
      if (!response.ok) throw new Error("Failed to update status")
      toast({ title: "Updated", description: `Medicine ${isActive ? "activated" : "deactivated"}.` })
      fetchMedicines()
    } catch (error) {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" })
    }
  }

  const handleDelete = async (medicineId: string) => {
    if (!confirm("Are you sure you want to delete this medicine?")) return
    try {
      const response = await fetch(`/api/admin/medicines/${medicineId}`, { method: "DELETE" })
      if (!response.ok) throw new Error("Failed to delete")
      toast({ title: "Deleted", description: "Medicine deleted successfully." })
      fetchMedicines()
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete medicine.", variant: "destructive" })
    }
  }

  const handleBulkAction = async (action: string) => {
    if (selectedMedicines.length === 0) return
    try {
      const response = await fetch("/api/admin/medicines/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, medicineIds: selectedMedicines }),
      })
      if (!response.ok) throw new Error("Failed bulk action")
      toast({ title: "Success", description: `Applied to ${selectedMedicines.length} medicines.` })
      setSelectedMedicines([])
      fetchMedicines()
    } catch (error) {
      toast({ title: "Error", description: "Failed bulk action.", variant: "destructive" })
    }
  }

  const handleSelectAll = (checked: boolean) => setSelectedMedicines(checked ? medicines.map((m) => m.id) : [])
  const handleSelectMedicine = (medicineId: string, checked: boolean) => {
    setSelectedMedicines((prev) => checked ? [...prev, medicineId] : prev.filter((id) => id !== medicineId))
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Medicine Management</h1>
          <p className="text-gray-500 mt-1">Manage central medicines, inventory, and illness mappings</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={() => setShowImportModal(true)} variant="outline" className="bg-white">
            <UploadCloud className="h-4 w-4 mr-2 text-blue-600" /> Import
          </Button>
          <Button onClick={() => setDrawerState({ type: 'create' })} className="bg-green-600 hover:bg-green-700 shadow-sm">
            <Plus className="h-4 w-4 mr-2" /> Add Medicine
          </Button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search medicines by name, generic name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-50/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant={showFilters ? "secondary" : "outline"} onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filters
            </Button>
            <Button variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-4">
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger><SelectValue placeholder="All Categories" /></SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="ALL">All Categories</SelectItem>
                {pharmacyCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedForm} onValueChange={setSelectedForm}>
              <SelectTrigger><SelectValue placeholder="All Forms" /></SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="ALL">All Forms</SelectItem>
                {['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS'].map((form) => (
                  <SelectItem key={form} value={form}>{form.charAt(0) + form.slice(1).toLowerCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedMedicines.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">{selectedMedicines.length} medicine(s) selected</span>
            <div className="flex space-x-2">
              <Button size="sm" onClick={() => handleBulkAction("ACTIVATE")} className="bg-green-600 hover:bg-green-700">Activate</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction("DEACTIVATE")} className="bg-white">Deactivate</Button>
              <Button size="sm" variant="outline" onClick={() => handleBulkAction("DELETE")} className="text-red-600 hover:text-red-700 hover:bg-red-50 bg-white">Delete</Button>
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  <input type="checkbox" checked={medicines.length > 0 && selectedMedicines.length === medicines.length} onChange={(e) => handleSelectAll(e.target.checked)} className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4"/>
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Medicine</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category & Form</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Illnesses Covered</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                      <p className="text-sm text-gray-500">Loading medicines...</p>
                    </div>
                  </td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    <AlertCircle className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p>No medicines found.</p>
                  </td>
                </tr>
              ) : (
                medicines.map((medicine) => (
                  <tr key={medicine.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input type="checkbox" checked={selectedMedicines.includes(medicine.id)} onChange={(e) => handleSelectMedicine(medicine.id, e.target.checked)} className="rounded border-gray-300 text-green-600 focus:ring-green-500 w-4 h-4"/>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
                          <Pill className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900">{medicine.name}</div>
                          <div className="text-xs text-gray-500">{medicine.genericName || "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1.5 items-start">
                        <span className="text-sm text-gray-900">{medicine.category || "Uncategorized"}</span>
                        <Badge variant="secondary" className={getFormColor(medicine.form)}>{medicine.form}</Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex flex-wrap gap-1 max-w-[200px]">
                         {medicine.illnessTypes?.length 
                            ? medicine.illnessTypes.slice(0, 2).map(i => <Badge key={i} variant="outline" className="text-xs">{i}</Badge>) 
                            : <span className="text-sm text-gray-400">—</span>}
                         {medicine.illnessTypes && medicine.illnessTypes.length > 2 && (
                           <Badge variant="outline" className="text-xs bg-gray-50">+{medicine.illnessTypes.length - 2}</Badge>
                         )}
                       </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="outline" className={getStatusColor(medicine.isActive)}>{medicine.isActive ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setDrawerState({ type: 'view', data: medicine })}><Eye className="mr-2 h-4 w-4 text-blue-500" /> View Details</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDrawerState({ type: 'edit', data: medicine })}><Edit className="mr-2 h-4 w-4 text-orange-500" /> Edit Medicine</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleStatusChange(medicine.id, !medicine.isActive)}>
                            {medicine.isActive ? <><XCircle className="mr-2 h-4 w-4 text-yellow-500" /> Deactivate</> : <><CheckCircle className="mr-2 h-4 w-4 text-green-500" /> Activate</>}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDelete(medicine.id)} className="text-red-600 focus:bg-red-50 focus:text-red-700"><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem>
                        </DropdownMenuContent>  
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-gray-50/50 px-6 py-4 flex items-center justify-between border-t border-gray-100">
            <p className="text-sm text-gray-600">Showing page <span className="font-semibold text-gray-900">{currentPage}</span> of <span className="font-semibold text-gray-900">{totalPages}</span></p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</Button>
            </div>
          </div>
        )}
      </div>

      {/* Drawers / Modals */}
      {(drawerState.type === 'create' || drawerState.type === 'edit') && (
        <MedicineFormDrawer
          isOpen={true}
          mode={drawerState.type}
          initialData={drawerState.data}
          illnessCategories={illnessCategories}
          pharmacyCategories={pharmacyCategories}
          medicineOrigins={medicineOrigins}
          onClose={() => setDrawerState({ type: null })}
          onSuccess={() => { setDrawerState({ type: null }); fetchMedicines(); }}
        />
      )}

      {drawerState.type === 'view' && drawerState.data && (
        <MedicineViewDrawer medicine={drawerState.data} onClose={() => setDrawerState({ type: null })} />
      )}

      {showImportModal && (
        <ImportMedicinesModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          pharmacyCategories={pharmacyCategories}
          medicineOrigins={medicineOrigins}
        />
      )}
    </div>
  )
}

function normalizeMedicineImages(data: any): { primary: string; secondary: string; img1: string } {
  const im = data?.images
  if (im && typeof im === "object" && !Array.isArray(im)) {
    return {
      primary: String((im as any).primary || (im as any).Primary || ""),
      secondary: String((im as any).secondary || (im as any).secondry || (im as any).Secondary || ""),
      img1: String((im as any).img1 || (im as any).gallery?.[0] || ""),
    }
  }
  if (Array.isArray(im)) {
    return { primary: im[0] || "", secondary: im[1] || "", img1: im[2] || "" }
  }
  return { primary: "", secondary: "", img1: "" }
}

// --- LEFT-SIDE DRAWER: CREATE / EDIT ---
function MedicineFormDrawer({ isOpen, mode, initialData, illnessCategories, pharmacyCategories, medicineOrigins, onClose, onSuccess }: any) {
  const isEdit = mode === 'edit'
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [imageUploadKey, setImageUploadKey] = useState<"primary" | "secondary" | "img1" | null>(null)
  
  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    genericName: initialData?.genericName || "",
    description: initialData?.description || "",
    purpose: initialData?.purpose || "",
    dosageInfo: initialData?.dosageInfo || "",
    warnings: initialData?.warnings || "",
    sideEffects: initialData?.sideEffects || [],
    category: initialData?.category || "", // String category
    illnessTypes: initialData?.illnessTypes || [], // Array of illnesses
    medicineOriginIds: initialData?.medicineOrigins?.map((o: any) => o?.medicineOriginId || o?.medicineOrigin?.id).filter(Boolean) || [],
    activeIngredients: initialData?.activeIngredients || [],
    form: initialData?.form || "",
    strength: initialData?.strength || "",
    manufacturer: initialData?.manufacturer || "",
  })

  const [medicineImages, setMedicineImages] = useState(() => normalizeMedicineImages(initialData))

  useEffect(() => {
    setMedicineImages(normalizeMedicineImages(initialData))
  }, [initialData?.id])

  const uploadMedicineImageFile = async (field: "primary" | "secondary" | "img1", file: File | undefined) => {
    if (!file) return
    setImageUploadKey(field)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/medicines/upload-image", { method: "POST", body: fd })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || "Upload failed")
      if (j.url) {
        setMedicineImages((prev) => ({ ...prev, [field]: j.url as string }))
        toast({ title: "Image uploaded", description: `${field} set from Cloudinary.` })
      }
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message || "Could not upload image", variant: "destructive" })
    } finally {
      setImageUploadKey(null)
    }
  }

  const handleArrayInput = (field: keyof typeof formData, value: string) => {
    const arr = value.split(',').map(item => item.trim()).filter(Boolean)
    setFormData(prev => ({ ...prev, [field]: arr }))
  }

  const toggleArrayItem = (field: 'illnessTypes' | 'medicineOriginIds', value: string) => {
    setFormData(prev => {
      const arr = prev[field]
      return { ...prev, [field]: arr.includes(value) ? arr.filter(i => i !== value) : [...arr, value] }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = isEdit ? `/api/admin/medicines/${initialData!.id}` : "/api/admin/medicines"
      const method = isEdit ? "PATCH" : "POST"
      
      const imagesPayload: Record<string, string> = {}
      if (medicineImages.primary?.trim()) imagesPayload.primary = medicineImages.primary.trim()
      if (medicineImages.secondary?.trim()) imagesPayload.secondary = medicineImages.secondary.trim()
      if (medicineImages.img1?.trim()) imagesPayload.img1 = medicineImages.img1.trim()

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          ...(Object.keys(imagesPayload).length > 0 ? { images: imagesPayload } : {}),
        }),
      })
      if (!response.ok) throw new Error((await response.json()).error || `Failed to ${isEdit ? "update" : "create"} medicine`)
      toast({ title: `Success`, description: `Medicine successfully ${isEdit ? "updated" : "created"}.` })
      onSuccess()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "An unexpected error occurred.", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      {/* Note: side="left" ensures it opens from the left side */}
      <SheetContent side="left" className="w-full sm:max-w-2xl flex flex-col p-0 bg-gray-50/50 overflow-y-auto bg-white">
        <SheetHeader className="p-6 border-b bg-white">
          <SheetTitle className="text-2xl">{isEdit ? "Edit Medicine" : "Add New Medicine"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Update medicine inventory details below." : "Enter details to catalog a new medicine."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <form id="medicine-form" onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Details */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Basic Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name *</label>
                  <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
                  <Input value={formData.genericName} onChange={(e) => setFormData({ ...formData, genericName: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Classification Category *</label>
                  {Array.isArray(pharmacyCategories) && pharmacyCategories.length > 0 ? (
                    <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })} required>
                      <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                      <SelectContent className="bg-white">
                        {pharmacyCategories.map((c: string) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Enter category (no categories found)"
                      required
                    />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Form *</label>
                  <Select value={formData.form} onValueChange={(val) => setFormData({ ...formData, form: val })} required>
                    <SelectTrigger><SelectValue placeholder="Select form..." /></SelectTrigger>
                    <SelectContent className="bg-white">
                      {['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS'].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Strength</label>
                  <Input placeholder="e.g. 500mg" value={formData.strength} onChange={(e) => setFormData({ ...formData, strength: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                  <Input value={formData.manufacturer} onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Images (Cloudinary) — stored as JSON e.g. { primary, secondary, img1 } */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Images (Cloudinary)</h3>
              <p className="text-xs text-gray-500">Upload to Cloudinary or paste URLs. Saved on the central medicine record.</p>
              {(["primary", "secondary", "img1"] as const).map((key) => (
                <div key={key} className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 capitalize">{key}</label>
                  <Input
                    value={medicineImages[key]}
                    onChange={(e) => setMedicineImages((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="https://..."
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      className="max-w-full text-sm text-gray-600 file:mr-2 file:rounded-md file:border file:border-gray-200 file:bg-gray-50 file:px-3 file:py-1.5"
                      disabled={imageUploadKey !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        void uploadMedicineImageFile(key, f)
                        e.target.value = ""
                      }}
                    />
                    {imageUploadKey === key ? <span className="text-xs text-gray-500">Uploading…</span> : null}
                  </div>
                </div>
              ))}
            </div>

            {/* Medical Info */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Medical Information</h3>
              
              {/* Illness Types Multi-Select Array */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Illnesses (Multi-select)</label>
                <Select onValueChange={(val) => toggleArrayItem('illnessTypes', val)}>
                  <SelectTrigger><SelectValue placeholder="Add an illness..." /></SelectTrigger>
                  <SelectContent className="bg-white" >
                    {illnessCategories.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.illnessTypes.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formData.illnessTypes.map((illness) => (
                      <Badge key={illness} variant="secondary" className="px-3 py-1 bg-blue-50 text-blue-700 cursor-pointer hover:bg-red-100 hover:text-red-700"
                        onClick={() => toggleArrayItem('illnessTypes', illness)}>
                        {illness} &times;
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purpose</label>
                <textarea className="w-full flex min-h-[60px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" value={formData.purpose} onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dosage Information</label>
                <textarea className="w-full flex min-h-[60px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" value={formData.dosageInfo} onChange={(e) => setFormData({ ...formData, dosageInfo: e.target.value })}/>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warnings</label>
                <textarea className="w-full flex min-h-[60px] rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500" value={formData.warnings} onChange={(e) => setFormData({ ...formData, warnings: e.target.value })}/>
              </div>
            </div>

            {/* Arrays & Tags */}
            <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">Ingredients & Origins</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Active Ingredients <span className="text-gray-400 font-normal">(comma sep)</span></label>
                  <Input value={formData.activeIngredients.join(', ')} onChange={(e) => handleArrayInput('activeIngredients', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Side Effects <span className="text-gray-400 font-normal">(comma sep)</span></label>
                  <Input value={formData.sideEffects && formData.sideEffects.length > 0 ? formData.sideEffects.join(', ') : ''} onChange={(e) => handleArrayInput('sideEffects', e.target.value)} />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Medicine Origins</label>
                <Select onValueChange={(val) => toggleArrayItem('medicineOriginIds', val)}>
                  <SelectTrigger><SelectValue placeholder="Add an origin..." /></SelectTrigger>
                  <SelectContent className="bg-white">
                    {(Array.isArray(medicineOrigins) ? medicineOrigins : []).map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>{o.displayName || o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.medicineOriginIds.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formData.medicineOriginIds.map((originId: string) => {
                      const origin = (Array.isArray(medicineOrigins) ? medicineOrigins : []).find((o: any) => o.id === originId)
                      const label = origin?.displayName || origin?.name || originId
                      return (
                        <Badge
                          key={originId}
                          variant="secondary"
                          className="px-3 py-1 bg-blue-50 text-blue-700 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                          onClick={() => toggleArrayItem('medicineOriginIds', originId)}
                        >
                          {label} &times;
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </form>
        </div>
        
        {/* Sticky Footer for Drawer */}
        <div className="p-4 border-t bg-white sticky bottom-0 flex justify-end space-x-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="medicine-form" disabled={loading} className="bg-green-600 hover:bg-green-700 w-32 text-white">
            {loading ? "Saving..." : (isEdit ? "Update" : "Create")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// --- LEFT-SIDE DRAWER: VIEW ---
function MedicineViewDrawer({ medicine, onClose }: any) {
  return (
    <Sheet open={true} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="p-6 border-b bg-green-50/50">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-white border border-green-100 flex items-center justify-center shadow-sm">
               <Pill className="h-7 w-7 text-green-600" />
            </div>
            <div className="flex-1">
              <SheetTitle className="text-2xl">{medicine.name}</SheetTitle>
              <SheetDescription className="mt-1 text-sm">{medicine.genericName || "No generic name"}</SheetDescription>
            </div>
            <Badge className={getStatusColor(medicine.isActive)}>{medicine.isActive ? "Active" : "Inactive"}</Badge>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">General Specifications</h4>
            <div className="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
              <div><span className="text-gray-500 block text-xs">Category</span><span className="font-medium">{medicine.category || "—"}</span></div>
              <div><span className="text-gray-500 block text-xs">Form</span><Badge variant="outline" className={`mt-1 ${getFormColor(medicine.form)}`}>{medicine.form}</Badge></div>
              <div><span className="text-gray-500 block text-xs">Strength</span><span className="font-medium">{medicine.strength || "—"}</span></div>
              <div><span className="text-gray-500 block text-xs">Manufacturer</span><span className="font-medium">{medicine.manufacturer || "—"}</span></div>
            </div>
          </section>

          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">Medical & Usage Info</h4>
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-gray-500 block text-xs mb-1">Target Illnesses</span>
                <div className="flex flex-wrap gap-2">
                  {medicine.illnessTypes?.length ? medicine.illnessTypes.map((i:string) => <Badge key={i} variant="secondary">{i}</Badge>) : "—"}
                </div>
              </div>
              <div><span className="text-gray-500 block text-xs mb-1">Purpose</span><div className="text-gray-900 bg-gray-50 p-3 rounded-lg border border-gray-100">{medicine.purpose || "—"}</div></div>
              <div><span className="text-gray-500 block text-xs mb-1">Dosage</span><div className="text-gray-900 bg-gray-50 p-3 rounded-lg border border-gray-100">{medicine.dosageInfo || "—"}</div></div>
              <div><span className="text-gray-500 block text-xs mb-1">Warnings</span><div className="text-red-900 bg-red-50 border border-red-100 p-3 rounded-lg">{medicine.warnings || "—"}</div></div>
            </div>
          </section>

          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 border-b pb-2">Composition & Tags</h4>
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-gray-500 block text-xs mb-1">Active Ingredients</span>
                <div className="flex flex-wrap gap-2">{medicine.activeIngredients?.length ? medicine.activeIngredients.map((i:string) => <Badge key={i} variant="outline">{i}</Badge>) : "—"}</div>
              </div>
              <div>
                <span className="text-gray-500 block text-xs mb-1">Side Effects</span>
                <div className="flex flex-wrap gap-2">{medicine.sideEffects?.length ? medicine.sideEffects.map((s:string) => <Badge key={s} variant="outline" className="text-orange-700 bg-orange-50 border-orange-200">{s}</Badge>) : "—"}</div>
              </div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// --- IMPORT MAPPING MODAL ---
function ImportMedicinesModal({ isOpen, onClose, pharmacyCategories, medicineOrigins }: any) {
  const [step, setStep] = useState(1); // 1: Upload, 2: Mapping, 3: Success
  const [file, setFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Array<Record<string, string>>>([])
  const [mapping, setMapping] = useState<Record<string, string>>({
    name: "",
    category: "",
    form: "",
    genericName: "",
    description: "",
    purpose: "",
    dosageInfo: "",
    warnings: "",
    manufacturer: "",
    strength: "",
    illnessTypes: "",
    medicineOrigins: "",
  })
  const [defaultCategory, setDefaultCategory] = useState<string>("")

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setStep(2); // Proceed to mock mapping step
    }
  }

  const parseCsv = (text: string) => {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0)
    if (lines.length === 0) return { headers: [], rows: [] as Array<Record<string, string>> }

    const parseLine = (line: string) => {
      const out: string[] = []
      let cur = ""
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          const next = line[i + 1]
          if (inQuotes && next === '"') {
            cur += '"'
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (ch === "," && !inQuotes) {
          out.push(cur)
          cur = ""
        } else {
          cur += ch
        }
      }
      out.push(cur)
      return out.map((v) => v.trim())
    }

    const header = parseLine(lines[0]).map((h) => h.replace(/^"|"$/g, "").trim())
    const dataRows: Array<Record<string, string>> = []
    for (const line of lines.slice(1)) {
      const cols = parseLine(line)
      const obj: Record<string, string> = {}
      for (let i = 0; i < header.length; i++) obj[header[i]] = cols[i] ?? ""
      dataRows.push(obj)
    }
    return { headers: header, rows: dataRows }
  }

  useEffect(() => {
    const load = async () => {
      if (!file) return
      const name = file.name.toLowerCase()
      if (!name.endsWith(".csv")) {
        toast({ title: "Unsupported file", description: "Only CSV import is supported right now.", variant: "destructive" })
        setFile(null)
        setStep(1)
        return
      }
      const text = await file.text()
      const parsed = parseCsv(text)
      setHeaders(parsed.headers)
      setRows(parsed.rows)
      // Default mapping guesses
      const lowerMap = new Map(parsed.headers.map((h) => [h.toLowerCase(), h] as const))
      const guess = (keys: string[]) => {
        for (const k of keys) {
          const v = lowerMap.get(k)
          if (v) return v
        }
        return ""
      }
      setMapping((prev) => ({
        ...prev,
        name: prev.name || guess(["name", "medicine", "brand", "brand name", "product name"]),
        category: prev.category || guess(["category", "type", "classification"]),
        form: prev.form || guess(["form", "dosage form"]),
        illnessTypes: prev.illnessTypes || guess(["illness", "illnesses", "target illnesses", "diseases", "target diseases"]),
        genericName: prev.genericName || guess(["generic", "generic name"]),
      }))
      if (!defaultCategory && Array.isArray(pharmacyCategories) && pharmacyCategories.length > 0) {
        setDefaultCategory(pharmacyCategories[0])
      }
    }
    load().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  const toArray = (raw: string) =>
    String(raw || "")
      .split(/[,;|]/g)
      .map((s) => s.trim())
      .filter(Boolean)

  const handleImport = async () => {
    try {
      setIsImporting(true)
      if (!mapping.name) {
        toast({ title: "Missing mapping", description: "Please map the Name column.", variant: "destructive" })
        return
      }

      const items = rows
        .map((r) => {
          const name = String(r[mapping.name] || "").trim()
          if (!name) return null
          const catFromFile = mapping.category ? String(r[mapping.category] || "").trim() : ""
          const category = (catFromFile || defaultCategory || "").trim()
          const form = mapping.form ? String(r[mapping.form] || "").trim() : ""
          const illnessTypes = mapping.illnessTypes ? toArray(String(r[mapping.illnessTypes] || "")) : []
          const originNames = mapping.medicineOrigins ? toArray(String(r[mapping.medicineOrigins] || "")) : []
          return {
            name,
            category,
            form: form || null,
            genericName: mapping.genericName ? String(r[mapping.genericName] || "").trim() : null,
            description: mapping.description ? String(r[mapping.description] || "").trim() : null,
            purpose: mapping.purpose ? String(r[mapping.purpose] || "").trim() : null,
            dosageInfo: mapping.dosageInfo ? String(r[mapping.dosageInfo] || "").trim() : null,
            warnings: mapping.warnings ? String(r[mapping.warnings] || "").trim() : null,
            manufacturer: mapping.manufacturer ? String(r[mapping.manufacturer] || "").trim() : null,
            strength: mapping.strength ? String(r[mapping.strength] || "").trim() : null,
            illnessTypes,
            medicineOrigins: originNames,
          }
        })
        .filter(Boolean)

      if (items.length === 0) {
        toast({ title: "No rows", description: "No valid rows found to import.", variant: "destructive" })
        return
      }

      const res = await fetch("/api/admin/medicines/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || "Import failed")

      toast({
        title: "Import complete",
        description: `Created: ${data.created || 0}, Updated: ${data.updated || 0}, Skipped: ${data.skipped || 0}`,
      })
      setStep(3)
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message || "Failed to import", variant: "destructive" })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import Medicines (CSV/Excel)</DialogTitle>
          <DialogDescription>Bulk import medicines and map file columns to database fields.</DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {step === 1 && (
            <div className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative">
              <input type="file" accept=".csv, .xlsx" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
              <UploadCloud className="h-10 w-10 text-gray-400 mb-4" />
              <h3 className="font-medium text-gray-900">Click or drag file to this area to upload</h3>
              <p className="text-sm text-gray-500 mt-1">Support for a single or bulk upload. Strictly prohibit from uploading company data or other band files.</p>
            </div>
          )}

          {step === 2 && file && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                <FileText className="h-6 w-6 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-blue-900">{file.name}</p>
                  <p className="text-xs text-blue-700">{(file.size / 1024).toFixed(2)} KB</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-sm text-gray-900 mb-3">Map Columns</h4>
                <div className="space-y-3">
                  {[
                    { key: "name", label: "name (Brand Name) *" },
                    { key: "category", label: "category (CentralMedicine.category)" },
                    { key: "form", label: "form (TABLET/CAPSULE/...)" },
                    { key: "illnessTypes", label: "illnessTypes (comma-separated)" },
                    { key: "medicineOrigins", label: "medicineOrigins (comma-separated: NIGERIAN, INDIAN, ...)" },
                    { key: "genericName", label: "genericName" },
                    { key: "description", label: "description" },
                    { key: "purpose", label: "purpose" },
                    { key: "dosageInfo", label: "dosageInfo" },
                    { key: "warnings", label: "warnings" },
                    { key: "manufacturer", label: "manufacturer" },
                    { key: "strength", label: "strength" },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center gap-4 text-sm">
                      <div className="flex-1 bg-gray-50 px-3 py-2 border rounded-md font-medium text-gray-700">{row.label}</div>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                      <Select
                        value={mapping[row.key] || ""}
                        onValueChange={(v) => setMapping((p) => ({ ...p, [row.key]: v }))}
                      >
                        <SelectTrigger className="flex-1"><SelectValue placeholder="-- Select column --" /></SelectTrigger>
                        <SelectContent className="bg-white max-h-[240px]">
                          <SelectItem value="">-- Ignore --</SelectItem>
                          {headers.map((h) => (
                            <SelectItem key={`${row.key}:${h}`} value={h}>{h}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {!mapping.category && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Default Category (used when CSV has no category column)</p>
                  {Array.isArray(pharmacyCategories) && pharmacyCategories.length > 0 ? (
                    <Select value={defaultCategory} onValueChange={setDefaultCategory}>
                      <SelectTrigger><SelectValue placeholder="Select default category" /></SelectTrigger>
                      <SelectContent className="bg-white max-h-[240px]">
                        {pharmacyCategories.map((c: string) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value)} placeholder="Enter default category" />
                  )}
                </div>
              )}

              {rows.length > 0 && (
                <div className="border rounded-lg p-4 bg-white">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Preview (first 3 rows)</p>
                  <div className="space-y-2 text-xs text-gray-700">
                    {rows.slice(0, 3).map((r, i) => (
                      <pre key={i} className="bg-gray-50 border rounded-md p-2 overflow-auto">
{JSON.stringify(r, null, 2)}
                      </pre>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-10">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Import Complete</h3>
              <p className="text-gray-500 mt-2 text-center">Successfully imported and mapped medicines to your central inventory.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleImport} disabled={isImporting} className="bg-blue-600 hover:bg-blue-700">
                {isImporting ? "Processing..." : "Start Import"}
              </Button>
            </>
          )}
          {step === 3 && <Button onClick={onClose} className="w-full">Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- UTILITIES ---
function getFormColor(form: string) {
  const colors: Record<string, string> = {
    TABLET: "bg-blue-50 text-blue-700 border-blue-200",
    CAPSULE: "bg-purple-50 text-purple-700 border-purple-200",
    SYRUP: "bg-orange-50 text-orange-700 border-orange-200",
    INJECTION: "bg-red-50 text-red-700 border-red-200",
    CREAM: "bg-yellow-50 text-yellow-700 border-yellow-200",
    DROPS: "bg-teal-50 text-teal-700 border-teal-200",
  }
  return colors[form?.toUpperCase()] || "bg-gray-100 text-gray-800"
}

function getStatusColor(status: boolean) {
  return status ? "bg-green-50 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"
}