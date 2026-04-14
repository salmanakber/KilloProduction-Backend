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
  Filter,
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
  DollarSign,
  AlertCircle,
  Star,
  MapPin,
  Phone,
  Mail,
  Globe,
  Building,
  FileText,
  Calendar,
  BarChart3,
  Activity,
  ShoppingCart,
  Truck,
  Award,
  Shield,
  Zap,
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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Wholesaler Management</h1>
          <p className="text-muted-foreground">
            Manage wholesalers, monitor performance, and oversee the supply chain
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Wholesaler
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Wholesalers</CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.verified} verified, {stats.pending} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalProducts}</div>
            <p className="text-xs text-muted-foreground">
              Across all wholesalers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-muted-foreground">
              From pharmacies
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageRating.toFixed(1)}</div>
            <p className="text-xs text-muted-foreground">
              Out of 5 stars
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search wholesalers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={exportData}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Wholesalers Table */}
      <Card>
        <CardHeader>
          <CardTitle>Wholesalers ({filteredWholesalers.length})</CardTitle>
          <CardDescription>
            Manage wholesaler accounts and monitor their performance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredWholesalers.map((wholesaler) => (
                <TableRow key={wholesaler.id}>
                  <TableCell>
                    <div className="flex items-center space-x-3">
                      {wholesaler.logo && (
                        <img
                          src={wholesaler.logo}
                          alt={wholesaler.companyName}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <div className="font-medium">{wholesaler.companyName}</div>
                        <div className="text-sm text-muted-foreground">
                          {wholesaler.licenseNumber}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center text-sm">
                        <Mail className="mr-1 h-3 w-3" />
                        {wholesaler.email}
                      </div>
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Phone className="mr-1 h-3 w-3" />
                        {wholesaler.phone}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <Badge variant={wholesaler.isVerified ? "default" : "secondary"}>
                        {wholesaler.isVerified ? "Verified" : "Pending"}
                      </Badge>
                      <Badge variant={wholesaler.user.isActive ? "default" : "destructive"}>
                        {wholesaler.user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                      <span className="font-medium">{wholesaler.rating.toFixed(1)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{wholesaler.totalOrders}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{wholesaler._count.wholesalerProducts}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {new Date(wholesaler.createdAt).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedWholesaler(wholesaler)
                          setShowViewDialog(true)
                          fetchWholesalerProducts(wholesaler.id)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
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
                        size="sm"
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
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleVerifyWholesaler(wholesaler.id, !wholesaler.isVerified)}
                      >
                        {wholesaler.isVerified ? (
                          <XCircle className="h-4 w-4 text-red-500" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedWholesaler(wholesaler)
                          setShowDeleteDialog(true)
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add Wholesaler Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle>Add New Wholesaler</DialogTitle>
            <DialogDescription>
              Create a new wholesaler account. The wholesaler will receive login credentials via email.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="licenseNumber">License Number</Label>
                <Input
                  id="licenseNumber"
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Payment Terms</Label>
              <Input
                id="paymentTerms"
                placeholder="e.g., Net 30, Net 60"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddWholesaler} disabled={isAddingWholesaler}>
              {isAddingWholesaler && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Wholesaler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Wholesaler Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-4xl bg-white">
          <DialogHeader>
            <DialogTitle>Wholesaler Details</DialogTitle>
            <DialogDescription>
              Complete information about the wholesaler
            </DialogDescription>
          </DialogHeader>
          {selectedWholesaler && (
            <div className="grid gap-6">
              <div className="grid grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Building className="mr-2 h-5 w-5" />
                      Company Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Company Name</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.companyName}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">License Number</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.licenseNumber}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Description</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.description}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Payment Terms</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.paymentTerms}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Users className="mr-2 h-5 w-5" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label className="text-sm font-medium">Email</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.email}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Phone</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.phone}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Address</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.address}</p>
                    </div>
                    <div>
                      <Label className="text-sm font-medium">Website</Label>
                      <p className="text-sm text-muted-foreground">{selectedWholesaler.website}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Star className="mr-2 h-5 w-5" />
                      Rating
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedWholesaler.rating.toFixed(1)}</div>
                    <p className="text-xs text-muted-foreground">Out of 5 stars</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <ShoppingCart className="mr-2 h-5 w-5" />
                      Orders
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedWholesaler.totalOrders}</div>
                    <p className="text-xs text-muted-foreground">Total orders</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Package className="mr-2 h-5 w-5" />
                      Products
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{selectedWholesaler._count.wholesalerProducts}</div>
                    <p className="text-xs text-muted-foreground">Active products</p>
                  </CardContent>
                </Card>
              </div>

              {/* Products Section */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center">
                        <Package className="mr-2 h-5 w-5" />
                        Product Inventory
                      </CardTitle>
                      <CardDescription>
                        Complete list of products offered by this wholesaler
                      </CardDescription>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => selectedWholesaler && fetchWholesalerProducts(selectedWholesaler.id)}
                      disabled={productsLoading}
                    >
                      <Activity className={`h-4 w-4 mr-2 ${productsLoading ? 'animate-spin' : ''}`} />
                      Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {productsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-muted-foreground">Loading products...</div>
                    </div>
                  ) : wholesalerProducts.length === 0 ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-sm text-muted-foreground">No products found</div>
                    </div>
                  ) : (
                    <>
                      {/* Products Summary */}
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="text-center p-3 bg-blue-50 rounded-lg">
                          <div className="text-2xl font-bold text-blue-600">
                            {wholesalerProducts.length}
                          </div>
                          <div className="text-sm text-blue-600">Total Products</div>
                        </div>
                        <div className="text-center p-3 bg-green-50 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">
                            {wholesalerProducts.filter(p => p.isActive).length}
                          </div>
                          <div className="text-sm text-green-600">Active Products</div>
                        </div>
                        <div className="text-center p-3 bg-yellow-50 rounded-lg">
                          <div className="text-2xl font-bold text-yellow-600">
                            {wholesalerProducts.filter(p => p.stock <= 10 && p.stock > 0).length}
                          </div>
                          <div className="text-sm text-yellow-600">Low Stock</div>
                        </div>
                        <div className="text-center p-3 bg-red-50 rounded-lg">
                          <div className="text-2xl font-bold text-red-600">
                            {wholesalerProducts.filter(p => p.stock === 0).length}
                          </div>
                          <div className="text-sm text-red-600">Out of Stock</div>
                        </div>
                      </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Brand</TableHead>
                            <TableHead>Stock</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Expiry Date</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wholesalerProducts.map((product) => (
                            <TableRow key={product.id}>
                              <TableCell>
                                <div>
                                  <div className="font-medium">{product.name}</div>
                                  {product.genericName && (
                                    <div className="text-sm text-muted-foreground">
                                      {product.genericName}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">{product.category}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">{product.brand || "N/A"}</div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  <span className="font-medium">{product.stock}</span>
                                  {product.stock <= 10 && product.stock > 0 && (
                                    <Badge variant="destructive" className="text-xs">Low Stock</Badge>
                                  )}
                                  {product.stock === 0 && (
                                    <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="font-medium">₦{product.unitPrice.toLocaleString()}</div>
                                <div className="text-sm text-muted-foreground">
                                  Min: {product.minOrderQuantity}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {new Date(product.expiryDate).toLocaleDateString()}
                                </div>
                                {new Date(product.expiryDate) <= new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) && (
                                  <Badge variant="destructive" className="text-xs mt-1">Expiring Soon</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {product.isActive ? (
                                  <Badge variant="default" className="bg-green-100 text-green-800">
                                    Active
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">Inactive</Badge>
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
        </DialogContent>
      </Dialog>

      {/* Edit Wholesaler Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl bg-white">
          <DialogHeader>
            <DialogTitle>Edit Wholesaler</DialogTitle>
            <DialogDescription>
              Update wholesaler information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-companyName">Company Name</Label>
                <Input
                  id="edit-companyName"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-licenseNumber">License Number</Label>
                <Input
                  id="edit-licenseNumber"
                  value={formData.licenseNumber}
                  onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-website">Website</Label>
                <Input
                  id="edit-website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-paymentTerms">Payment Terms</Label>
              <Input
                id="edit-paymentTerms"
                placeholder="e.g., Net 30, Net 60"
                value={formData.paymentTerms}
                onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateWholesaler}>Update Wholesaler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Wholesaler</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedWholesaler?.companyName}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteWholesaler}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
