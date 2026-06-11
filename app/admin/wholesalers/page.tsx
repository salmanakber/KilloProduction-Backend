"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Search,
  Plus,
  Download,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Package,
  Users,
  AlertCircle,
  Star,
  MapPin,
  Phone,
  Mail,
  Globe,
  Building,
  FileText,
  Calendar,
  Activity,
  ShoppingCart,
  Shield,
  Loader2,
} from "lucide-react"

interface Wholesaler {
  id: string
  companyName: string
  licenseNumber: string
  description: string
  address: string
  phone: string
  email: string
  website: string
  logo: string
  rating: number
  totalOrders: number
  isVerified: boolean
  specialties: string[]
  deliveryZones: string[]
  paymentTerms: string
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
  }
  _count: {
    wholesalerProducts: number
    supplierOrders: number
  }
}

interface WholesalerStats {
  total: number
  verified: number
  pending: number
  active: number
  totalProducts: number
  totalOrders: number
  totalRevenue: number
  averageRating: number
}

interface WholesalerProduct {
  id: string
  name: string
  genericName: string
  brand: string
  manufacturer: string
  dosage: string
  form: string
  category: string
  unitPrice: number
  minOrderQuantity: number
  stock: number
  batchNumber: string
  manufacturingDate: string
  expiryDate: string
  countryOfOrigin: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export default function WholesalersPage() {
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([])
  const [stats, setStats] = useState<WholesalerStats>({
    total: 0,
    verified: 0,
    pending: 0,
    active: 0,
    totalProducts: 0,
    totalOrders: 0,
    totalRevenue: 0,
    averageRating: 0,
  })
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedWholesaler, setSelectedWholesaler] = useState<Wholesaler | null>(null)
  const [wholesalerProducts, setWholesalerProducts] = useState<WholesalerProduct[]>([])
  const [productsLoading, setProductsLoading] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [isAddingWholesaler, setIsAddingWholesaler] = useState(false)
  // Form states
  const [formData, setFormData] = useState({
    companyName: "",
    licenseNumber: "",
    description: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    specialties: [] as string[],
    deliveryZones: [] as string[],
    paymentTerms: "",
  })

  useEffect(() => {
    fetchWholesalers()
    fetchStats()
  }, [])

  const fetchWholesalers = async () => {
    try {
      const response = await fetch("/api/admin/wholesalers")
      const data = await response.json()
      if (response.ok) {
        setWholesalers(data.wholesalers)
      } else {
        toast.error("Failed to fetch wholesalers")
      }
    } catch (error) {
      toast.error("Error fetching wholesalers")
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/admin/wholesalers/stats")
      const data = await response.json()
      if (response.ok) {
        setStats(data)
      }
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }

  const fetchWholesalerProducts = async (wholesalerId: string) => {
    try {
      setProductsLoading(true)
      const response = await fetch(`/api/admin/wholesalers/${wholesalerId}/products`)
      const data = await response.json()
      if (response.ok) {
        setWholesalerProducts(data.products)
      } else {
        toast.error("Failed to fetch wholesaler products")
      }
    } catch (error) {
      toast.error("Error fetching wholesaler products")
    } finally {
      setProductsLoading(false)
    }
  }

  const handleAddWholesaler = async () => {
    try {
      setIsAddingWholesaler(true)
      const response = await fetch("/api/admin/wholesalers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success("Wholesaler added successfully")
        setShowAddDialog(false)
        setFormData({
          companyName: "",
          licenseNumber: "",
          description: "",
          address: "",
          phone: "",
          email: "",
          website: "",
          specialties: [],
          deliveryZones: [],
          paymentTerms: "",
        })
        fetchWholesalers()
        fetchStats()
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to add wholesaler")
      }
    } catch (error) {
      toast.error("Error adding wholesaler")
    } finally {
      setIsAddingWholesaler(false)
    }
  }

  const handleUpdateWholesaler = async () => {
    if (!selectedWholesaler) return

    try {
      const response = await fetch(`/api/admin/wholesalers/${selectedWholesaler.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        toast.success("Wholesaler updated successfully")
        setShowEditDialog(false)
        fetchWholesalers()
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to update wholesaler")
      }
    } catch (error) {
      toast.error("Error updating wholesaler")
    }
  }

  const handleDeleteWholesaler = async () => {
    if (!selectedWholesaler) return

    try {
      const response = await fetch(`/api/admin/wholesalers/${selectedWholesaler.id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        toast.success("Wholesaler deleted successfully")
        setShowDeleteDialog(false)
        fetchWholesalers()
        fetchStats()
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to delete wholesaler")
      }
    } catch (error) {
      toast.error("Error deleting wholesaler")
    }
  }

  const handleVerifyWholesaler = async (wholesalerId: string, isVerified: boolean) => {
    try {
      const response = await fetch(`/api/admin/wholesalers/${wholesalerId}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVerified }),
      })

      if (response.ok) {
        toast.success(`Wholesaler ${isVerified ? "verified" : "unverified"} successfully`)
        fetchWholesalers()
        fetchStats()
      } else {
        const error = await response.json()
        toast.error(error.message || "Failed to update verification status")
      }
    } catch (error) {
      toast.error("Error updating verification status")
    }
  }

  const filteredWholesalers = wholesalers.filter((wholesaler) => {
    const matchesSearch = wholesaler.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         wholesaler.licenseNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         wholesaler.email.toLowerCase().includes(searchQuery.toLowerCase())
    
    const matchesStatus = statusFilter === "all" ||
                         (statusFilter === "verified" && wholesaler.isVerified) ||
                         (statusFilter === "pending" && !wholesaler.isVerified) ||
                         (statusFilter === "active" && wholesaler.user.isActive)

    return matchesSearch && matchesStatus
  })

  const exportData = () => {
    const csvContent = [
      ["Company Name", "License Number", "Email", "Phone", "Status", "Rating", "Total Orders", "Products", "Created At"],
      ...filteredWholesalers.map(w => [
        w.companyName,
        w.licenseNumber,
        w.email,
        w.phone,
        w.isVerified ? "Verified" : "Pending",
        w.rating.toString(),
        w.totalOrders.toString(),
        w._count.wholesalerProducts.toString(),
        new Date(w.createdAt).toLocaleDateString()
      ])
    ].map(row => row.join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "wholesalers.csv"
    a.click()
    window.URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
        <p className="text-sm font-medium text-slate-500">Syncing wholesaler records...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER - Consistent with the style of dashboard header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Wholesaler Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage wholesalers, monitor performance, and oversee the supply chain
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          <Button 
            onClick={() => setShowAddDialog(true)}
            className="bg-[#0f766e] hover:bg-[#0d615b] text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Wholesaler
          </Button>
        </div>
      </div>

      {/* STATS GRID - Structured with primary dark-teal gradient & standard borders */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        
        {/* Total Wholesalers - Custom Dark Gradient Card */}
        <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-6 rounded-2xl shadow-md border border-[#0f766e]/20 group relative overflow-hidden text-white">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl"></div>
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Building className="h-6 w-6 text-[#2dd4bf]" />
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-sm font-semibold text-teal-100 uppercase tracking-wider mb-1">Total Wholesalers</p>
            <p className="text-3xl font-black">{stats.total}</p>
            <p className="text-xs text-teal-100/70 mt-2 font-medium">
              {stats.verified} verified, {stats.pending} pending
            </p>
          </div>
        </div>

        {/* Total Products Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-slate-50 group-hover:bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-teal-100">
              <Package className="h-6 w-6 text-slate-600 group-hover:text-[#0f766e] transition-colors" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Products</p>
            <p className="text-3xl font-black text-slate-900">{stats.totalProducts}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Across all wholesalers</p>
          </div>
        </div>

        {/* Total Orders Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-slate-50 group-hover:bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-teal-100">
              <ShoppingCart className="h-6 w-6 text-slate-600 group-hover:text-[#0f766e] transition-colors" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Orders</p>
            <p className="text-3xl font-black text-slate-900">{stats.totalOrders}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Fulfilled from pharmacies</p>
          </div>
        </div>

        {/* Average Rating Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-amber-50 rounded-xl flex items-center justify-center border border-amber-100">
              <Star className="h-6 w-6 fill-amber-400 text-amber-400" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Average Rating</p>
            <p className="text-3xl font-black text-slate-900">{stats.averageRating.toFixed(1)}</p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Out of 5 star rating</p>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS CARD */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
        <div className="p-5 flex flex-col sm:flex-row gap-4 items-center bg-slate-50/50">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search wholesalers by name, license, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-white border-slate-200 focus-visible:ring-teal-600 rounded-xl text-sm"
            />
          </div>
          <div className="flex w-full sm:w-auto gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px] h-10 bg-white border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              onClick={exportData}
              className="h-10 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 text-xs font-bold rounded-xl"
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      {/* MAIN TABLE CARD */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-lg font-bold text-slate-900">Wholesaler Portfolios ({filteredWholesalers.length})</CardTitle>
          <CardDescription>
            Manage wholesaler credential reviews and inventory mappings.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow className="border-b border-slate-200">
                  <TableHead className="py-4 pl-6 text-xs font-semibold uppercase tracking-wider text-slate-500">Company</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Contact</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Rating</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Orders</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Products</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Created</TableHead>
                  <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredWholesalers.map((wholesaler) => (
                  <TableRow key={wholesaler.id} className="group hover:bg-slate-50/40 transition-colors border-b border-slate-100 last:border-0">
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center space-x-3">
                        {wholesaler.logo ? (
                          <img
                            src={wholesaler.logo}
                            alt={wholesaler.companyName}
                            className="h-9 w-9 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                            {wholesaler.companyName.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{wholesaler.companyName}</div>
                          <div className="text-xs text-slate-500">
                            Lic: {wholesaler.licenseNumber}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center text-xs text-slate-600">
                          <Mail className="mr-1.5 h-3 w-3 text-slate-400" />
                          {wholesaler.email}
                        </div>
                        <div className="flex items-center text-xs text-slate-500">
                          <Phone className="mr-1.5 h-3 w-3 text-slate-400" />
                          {wholesaler.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 items-start">
                        {wholesaler.isVerified ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100 font-bold px-2 py-0.5 text-[10px] rounded-md">
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 font-bold px-2 py-0.5 text-[10px] rounded-md">
                            Pending
                          </Badge>
                        )}
                        {wholesaler.user.isActive ? (
                          <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 font-bold px-2 py-0.5 text-[10px] rounded-md">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-100 font-bold px-2 py-0.5 text-[10px] rounded-md">
                            Inactive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400 mr-1" />
                        <span className="font-bold text-slate-800 text-sm">{wholesaler.rating.toFixed(1)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 text-sm">{wholesaler.totalOrders}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-bold text-slate-800 text-sm">{wholesaler._count.wholesalerProducts}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-slate-500">
                        {new Date(wholesaler.createdAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-[#0f766e] hover:bg-teal-50 rounded-lg transition-all"
                          onClick={() => {
                            setSelectedWholesaler(wholesaler)
                            setShowViewDialog(true)
                            fetchWholesalerProducts(wholesaler.id)
                          }}
                          title="View Info"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-[#0f766e] hover:bg-teal-50 rounded-lg transition-all"
                          onClick={() => {
                            setSelectedWholesaler(wholesaler)
                            setShowViewDialog(true)
                            fetchWholesalerProducts(wholesaler.id)
                          }}
                          title="View Products"
                        >
                          <Package className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-[#0f766e] hover:bg-teal-50 rounded-lg transition-all"
                          onClick={() => {
                            setSelectedWholesaler(wholesaler)
                            setFormData({
                              companyName: wholesaler.companyName,
                              licenseNumber: wholesaler.licenseNumber,
                              description: wholesaler.description,
                              address: wholesaler.address,
                              phone: wholesaler.phone,
                              email: wholesaler.email,
                              website: wholesaler.website,
                              specialties: wholesaler.specialties,
                              deliveryZones: wholesaler.deliveryZones,
                              paymentTerms: wholesaler.paymentTerms,
                            })
                            setShowEditDialog(true)
                          }}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg transition-all"
                          onClick={() => handleVerifyWholesaler(wholesaler.id, !wholesaler.isVerified)}
                          title={wholesaler.isVerified ? "Revoke Verification" : "Verify Profile"}
                        >
                          {wholesaler.isVerified ? (
                            <XCircle className="h-4 w-4 text-rose-500 hover:text-rose-600" />
                          ) : (
                            <CheckCircle className="h-4 w-4 text-teal-600 hover:text-teal-700" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          onClick={() => {
                            setSelectedWholesaler(wholesaler)
                            setShowDeleteDialog(true)
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Wholesaler Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl bg-white p-0 rounded-2xl overflow-hidden border-slate-200 shadow-2xl">
          <div className="p-6 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-bold">Add New Wholesaler</DialogTitle>
              <DialogDescription className="text-teal-100/70 text-xs mt-1">
                Create a new wholesaler account. The wholesaler will receive login credentials via email.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-xs font-semibold text-slate-700">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="licenseNumber" className="text-xs font-semibold text-slate-700">License Number</Label>
                <Input
                  id="licenseNumber"
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description" className="text-xs font-semibold text-slate-700">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="rounded-lg border-slate-200 min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">Phone Number</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="address" className="text-xs font-semibold text-slate-700">Physical Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="website" className="text-xs font-semibold text-slate-700">Website URL</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="paymentTerms" className="text-xs font-semibold text-slate-700">Payment Terms</Label>
              <Input
                id="paymentTerms"
                placeholder="e.g., Net 30, Net 60"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                className="rounded-lg border-slate-200"
              />
            </div>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="rounded-lg text-xs font-semibold">
              Cancel
            </Button>
            <Button 
              onClick={handleAddWholesaler} 
              disabled={isAddingWholesaler}
              className="bg-[#0f766e] hover:bg-[#0d615b] text-white font-semibold text-xs rounded-lg"
            >
              {isAddingWholesaler && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Create Wholesaler
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Wholesaler Details Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-4xl bg-white p-0 rounded-2xl overflow-hidden border-slate-200 shadow-2xl">
          <div className="p-6 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-bold">Wholesaler Portfolio Information</DialogTitle>
              <DialogDescription className="text-teal-100/70 text-xs mt-1">
                Complete operational and inventory details.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {selectedWholesaler && (
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-slate-150 shadow-none">
                  <CardHeader className="bg-slate-50 border-b border-slate-100 py-3.5">
                    <CardTitle className="text-sm font-bold flex items-center text-slate-800">
                      <Building className="mr-2 h-4 w-4 text-[#0f766e]" />
                      Company Profiles
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4 text-xs">
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Company Legal Name</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.companyName}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">License Registration</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.licenseNumber}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">General Description</Label>
                      <p className="text-slate-600 leading-relaxed">{selectedWholesaler.description || "—"}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Payment Terms Agreements</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.paymentTerms || "—"}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-150 shadow-none">
                  <CardHeader className="bg-slate-50 border-b border-slate-100 py-3.5">
                    <CardTitle className="text-sm font-bold flex items-center text-slate-800">
                      <Users className="mr-2 h-4 w-4 text-[#0f766e]" />
                      Contact Configurations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-4 text-xs">
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Primary Email</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.email}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Direct Line</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.phone}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Operational Address</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.address}</p>
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Website Domain</Label>
                      <p className="text-slate-800 font-semibold">{selectedWholesaler.website || "—"}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Performance Metrics Row */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="border-slate-150 shadow-none text-center py-4">
                  <Star className="h-5 w-5 fill-yellow-400 text-yellow-400 mx-auto mb-1.5" />
                  <span className="text-lg font-black text-slate-800 block leading-none">{selectedWholesaler.rating.toFixed(1)}</span>
                  <span className="text-[10px] uppercase text-slate-400 tracking-wider mt-1 block">Rating Performance</span>
                </Card>

                <Card className="border-slate-150 shadow-none text-center py-4">
                  <ShoppingCart className="h-5 w-5 text-[#0f766e] mx-auto mb-1.5" />
                  <span className="text-lg font-black text-slate-800 block leading-none">{selectedWholesaler.totalOrders}</span>
                  <span className="text-[10px] uppercase text-slate-400 tracking-wider mt-1 block">Total Orders</span>
                </Card>

                <Card className="border-slate-150 shadow-none text-center py-4">
                  <Package className="h-5 w-5 text-teal-600 mx-auto mb-1.5" />
                  <span className="text-lg font-black text-slate-800 block leading-none">{selectedWholesaler._count.wholesalerProducts}</span>
                  <span className="text-[10px] uppercase text-slate-400 tracking-wider mt-1 block">Active Products</span>
                </Card>
              </div>

              {/* Sub-table: Wholesaler Inventory Mappings */}
              <Card className="border-slate-200/85 overflow-hidden shadow-none">
                <CardHeader className="bg-slate-50 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-4">
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center text-slate-800">
                      <Package className="mr-2 h-4 w-4 text-[#0f766e]" />
                      Product Inventory Mappings
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-500 mt-0.5">
                      Operational list of drug products offered in network.
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => selectedWholesaler && fetchWholesalerProducts(selectedWholesaler.id)}
                    disabled={productsLoading}
                    className="h-8 text-xs border-slate-200"
                  >
                    <Activity className={`h-3.5 w-3.5 mr-1.5 text-slate-500 ${productsLoading ? 'animate-spin' : ''}`} />
                    Refresh Items
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {productsLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
                      <span className="text-xs text-slate-500">Retrieving catalog datasets...</span>
                    </div>
                  ) : wholesalerProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <Package className="h-8 w-8 text-slate-300 mb-2" />
                      <span className="text-xs">No catalog entries configured yet.</span>
                    </div>
                  ) : (
                    <>
                      {/* Products Summary Segment */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 border-b border-slate-100 bg-slate-50/40">
                        <div className="text-center p-2.5 bg-blue-50/50 rounded-lg border border-blue-100/30">
                          <div className="text-xl font-bold text-blue-600">
                            {wholesalerProducts.length}
                          </div>
                          <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mt-0.5">Total Products</div>
                        </div>
                        <div className="text-center p-2.5 bg-green-50/50 rounded-lg border border-green-100/30">
                          <div className="text-xl font-bold text-green-600">
                            {wholesalerProducts.filter(p => p.isActive).length}
                          </div>
                          <div className="text-[10px] font-semibold text-green-500 uppercase tracking-wider mt-0.5">Active Products</div>
                        </div>
                        <div className="text-center p-2.5 bg-yellow-50/50 rounded-lg border border-yellow-100/30">
                          <div className="text-xl font-bold text-yellow-600">
                            {wholesalerProducts.filter(p => p.stock <= 10 && p.stock > 0).length}
                          </div>
                          <div className="text-[10px] font-semibold text-yellow-500 uppercase tracking-wider mt-0.5">Low Stock</div>
                        </div>
                        <div className="text-center p-2.5 bg-red-50/50 rounded-lg border border-red-100/30">
                          <div className="text-xl font-bold text-red-600">
                            {wholesalerProducts.filter(p => p.stock === 0).length}
                          </div>
                          <div className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mt-0.5">Out of Stock</div>
                        </div>
                      </div>
                      
                      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                        <Table>
                          <TableHeader className="bg-slate-50 sticky top-0">
                            <TableRow className="border-b border-slate-150">
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Name</TableHead>
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Category</TableHead>
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Brand</TableHead>
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Stock</TableHead>
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Price</TableHead>
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Expiry</TableHead>
                              <TableHead className="text-xs font-semibold py-3 text-slate-500">Status</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {wholesalerProducts.map((product) => (
                              <TableRow key={product.id} className="border-b border-slate-100 last:border-0">
                                <TableCell className="py-2.5">
                                  <div>
                                    <div className="font-semibold text-xs text-slate-900">{product.name}</div>
                                    {product.genericName && (
                                      <div className="text-[10px] text-slate-400 truncate max-w-[130px]">
                                        {product.genericName}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2.5">
                                  <Badge variant="outline" className="text-[10px] font-bold py-0">{product.category}</Badge>
                                </TableCell>
                                <TableCell className="py-2.5 text-xs text-slate-600">{product.brand || "N/A"}</TableCell>
                                <TableCell className="py-2.5">
                                  <div className="flex items-center space-x-1.5">
                                    <span className="font-bold text-xs text-slate-800">{product.stock}</span>
                                    {product.stock <= 10 && product.stock > 0 && (
                                      <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">Low</Badge>
                                    )}
                                    {product.stock === 0 && (
                                      <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 bg-red-600">Zero</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="py-2.5">
                                  <div className="font-bold text-xs text-slate-800">₦{product.unitPrice.toLocaleString()}</div>
                                  <div className="text-[9px] text-slate-400">Min Order: {product.minOrderQuantity}</div>
                                </TableCell>
                                <TableCell className="py-2.5">
                                  <div className="text-[10px] text-slate-500">
                                    {new Date(product.expiryDate).toLocaleDateString()}
                                  </div>
                                  {new Date(product.expiryDate) <= new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) && (
                                    <Badge variant="destructive" className="text-[8px] mt-0.5 px-1 py-0 h-3.5 bg-red-500">Expiring</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="py-2.5">
                                  {product.isActive ? (
                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold text-[9px]">
                                      Active
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[9px]">Inactive</Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
          
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowViewDialog(false)}
                className="text-xs font-semibold border-slate-200 text-slate-600"
              >
                Close Audit Records
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Wholesaler Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl bg-white p-0 rounded-2xl overflow-hidden border-slate-200 shadow-2xl">
          <div className="p-6 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-lg font-bold">Edit Wholesaler Profile</DialogTitle>
              <DialogDescription className="text-teal-100/70 text-xs mt-1">
                Update basic information and terms associated with this distributor.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-companyName" className="text-xs font-semibold text-slate-700">Company Name</Label>
                <Input
                  id="edit-companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-licenseNumber" className="text-xs font-semibold text-slate-700">License Number</Label>
                <Input
                  id="edit-licenseNumber"
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-description" className="text-xs font-semibold text-slate-700">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="rounded-lg border-slate-200 min-h-[80px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-email" className="text-xs font-semibold text-slate-700">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone" className="text-xs font-semibold text-slate-700">Phone</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-address" className="text-xs font-semibold text-slate-700">Address</Label>
                <Input
                  id="edit-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-website" className="text-xs font-semibold text-slate-700">Website</Label>
                <Input
                  id="edit-website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  className="rounded-lg border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-paymentTerms" className="text-xs font-semibold text-slate-700">Payment Terms</Label>
              <Input
                id="edit-paymentTerms"
                placeholder="e.g., Net 30, Net 60"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                className="rounded-lg border-slate-200"
              />
            </div>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} className="rounded-lg text-xs font-semibold">
              Cancel
            </Button>
            <Button 
              onClick={handleUpdateWholesaler}
              className="bg-[#0f766e] hover:bg-[#0d615b] text-white font-semibold text-xs rounded-lg"
            >
              Update Wholesaler
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="rounded-2xl border-slate-200 bg-white shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-slate-900 font-bold text-lg">Remove Wholesaler Profile</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">
              Are you sure you want to delete <span className="font-semibold text-slate-800">{selectedWholesaler?.companyName}</span>? This action cannot be undone and will affect inventory records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="rounded-lg text-xs font-semibold border-slate-200 text-slate-600">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteWholesaler} className="rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700">
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}