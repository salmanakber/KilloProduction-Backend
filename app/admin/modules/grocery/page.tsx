"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle, ShoppingCart, DollarSign, Eye, Edit, UserCheck, UserX, Package } from "lucide-react"

interface GroceryStats {
  totalStores: number
  activeStores: number
  pendingApproval: number
  totalRevenue: number
  totalProducts: number
  totalOrders: number
  averageRating?: number
  currencySymbol?: string
}

interface GroceryStore {
  id: string
  userId: string
  storeName: string
  email: string
  phone: string
  address: string
  storeType: string[]
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  rating: number
  totalOrders: number
  revenue: number
  totalProducts: number
  isVerified: boolean
  createdAt: string
  lastActive: string
  deliveryFee: number
  minOrderAmount: number
}

export default function GroceryManagementPage() {
  const [stats, setStats] = useState<GroceryStats | null>(null)
  const [stores, setStores] = useState<GroceryStore[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [selectedStore, setSelectedStore] = useState<GroceryStore | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [groceryDetail, setGroceryDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [groceryEdit, setGroceryEdit] = useState({
    storeName: "",
    address: "",
    phone: "",
    email: "",
    deliveryFee: 0,
    minOrderAmount: 0,
    isOpen: true,
    isVerified: false,
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
  })

  const loadGroceryDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/grocery/${id}`)
      const j = await r.json()
      setGroceryDetail(j.error ? null : j)
    } catch {
      setGroceryDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!editOpen || !groceryDetail?.store) return
    const s = groceryDetail.store
    const u = s.user
    setGroceryEdit({
      storeName: s.storeName || "",
      address: s.address || "",
      phone: s.phone || "",
      email: s.email || "",
      deliveryFee: s.deliveryFee ?? 0,
      minOrderAmount: s.minOrderAmount ?? 0,
      isOpen: !!s.isOpen,
      isVerified: !!s.isVerified,
      ownerName: u?.name || "",
      ownerPhone: u?.phone || "",
      ownerEmail: u?.email || "",
    })
  }, [editOpen, groceryDetail])

  const saveGroceryEdit = async () => {
    if (!selectedStore) return
    const r = await fetch(`/api/admin/modules/grocery/${selectedStore.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: groceryEdit.storeName,
        address: groceryEdit.address,
        phone: groceryEdit.phone,
        email: groceryEdit.email || null,
        deliveryFee: groceryEdit.deliveryFee,
        minOrderAmount: groceryEdit.minOrderAmount,
        isOpen: groceryEdit.isOpen,
        isVerified: groceryEdit.isVerified,
        user: {
          name: groceryEdit.ownerName,
          phone: groceryEdit.ownerPhone,
          email: groceryEdit.ownerEmail,
        },
      }),
    })
    if (r.ok) {
      await fetchStores()
      await fetchGroceryStats()
      setEditOpen(false)
      setGroceryDetail(null)
    }
  }

  useEffect(() => {
    fetchGroceryStats()
    fetchStores()
  }, [])

  const fetchGroceryStats = async () => {
    try {
      const response = await fetch("/api/admin/modules/grocery/stats")
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error("Error fetching grocery stats:", error)
    }
  }

  const fetchStores = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/modules/grocery/list")
      const data = await response.json()
      setStores(data.stores || [])
    } catch (error) {
      console.error("Error fetching stores:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (storeId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/modules/grocery/${storeId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        fetchStores()
        fetchGroceryStats()
      }
    } catch (error) {
      console.error("Error updating store status:", error)
    }
  }

  const filteredStores = stores.filter((store) => {
    const matchesSearch =
      store.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.phone.includes(searchTerm)
    const matchesStatus = statusFilter === "ALL" || store.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const variants = {
      PENDING: "secondary",
      APPROVED: "default",
      REJECTED: "destructive",
      SUSPENDED: "outline",
    }
    return <Badge variant={variants[status as keyof typeof variants] as any}>{status}</Badge>
  }

  const getStoreTypeBadge = (type: string) => {
    const colors = {
      Organic: "bg-green-100 text-green-800",
      Supermarket: "bg-blue-100 text-blue-800",
      Convenience: "bg-orange-100 text-orange-800",
      Specialty: "bg-purple-100 text-purple-800",
    }
    return (
      <span
        className={`px-2 py-1 rounded-full text-xs ${colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"}`}
      >
        {type}
      </span>
    )
  }

  if (loading && !stats) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Grocery Store Management</h1>
          <p className="text-muted-foreground">Manage grocery stores, products, and orders</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stores</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalStores || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Stores</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeStores || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProducts?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.currencySymbol ?? "₦"}
              {stats?.totalRevenue?.toLocaleString() || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stores Table */}
      <Card>
        <CardHeader>
          <CardTitle>Grocery Stores</CardTitle>
          <CardDescription>Manage and monitor all grocery stores</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search stores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Status</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="SUSPENDED">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Products</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Min Order</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStores.map((store) => (
                <TableRow key={store.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{store.storeName}</div>
                      <div className="text-sm text-muted-foreground">{store.email}</div>
                      <div className="text-sm text-muted-foreground">{store.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {store.storeType.slice(0, 2).map((type, i) => (
                        <div key={i}>{getStoreTypeBadge(type)}</div>
                      ))}
                      {store.storeType.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{store.storeType.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(store.status)}</TableCell>
                  <TableCell>{store.totalProducts.toLocaleString()}</TableCell>
                  <TableCell>{store.totalOrders.toLocaleString()}</TableCell>
                  <TableCell>
                    {stats?.currencySymbol ?? "₦"}
                    {store.revenue.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {stats?.currencySymbol ?? "₦"}
                    {store.minOrderAmount.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        title="View"
                        onClick={() => {
                          setSelectedStore(store)
                          setViewOpen(true)
                          void loadGroceryDetail(store.id)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Edit"
                        onClick={() => {
                          setSelectedStore(store)
                          setEditOpen(true)
                          void loadGroceryDetail(store.id)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      {store.status === "PENDING" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleStatusChange(store.id, "APPROVED")}>
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleStatusChange(store.id, "REJECTED")}>
                            <UserX className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={viewOpen} onOpenChange={(o) => { setViewOpen(o); if (!o) setGroceryDetail(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View grocery store</DialogTitle>
            <DialogDescription>Full record and recent orders</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-muted-foreground py-6">Loading…</p>
          ) : groceryDetail?.store ? (
            <div className="space-y-4 text-sm">
              <p>
                <span className="text-muted-foreground">Vendor user ID:</span>{" "}
                <span className="font-mono text-xs">{groceryDetail.store.userId}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Delivered revenue:</span> {stats?.currencySymbol ?? "₦"}
                {(groceryDetail.summary?.deliveredRevenue ?? 0).toLocaleString()}
              </p>
              <p>
                <span className="text-muted-foreground">Products / orders:</span>{" "}
                {groceryDetail.store._count?.products} · {groceryDetail.store._count?.groceryOrders}
              </p>
              <div>
                <p className="font-medium mb-2">Recent orders</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(groceryDetail.summary?.recentOrders || []).map((o: any) => (
                    <div key={o.id} className="flex justify-between border rounded px-2 py-1">
                      <span>{o.orderNumber}</span>
                      <span>{o.status}</span>
                      <span>
                        {stats?.currencySymbol ?? "₦"}
                        {o.total?.toLocaleString?.()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {selectedStore && (
                <StoreDetailsModal
                  store={selectedStore}
                  onStatusChange={handleStatusChange}
                  currencySymbol={stats?.currencySymbol ?? "₦"}
                />
              )}
            </div>
          ) : (
            <p className="text-destructive">Failed to load.</p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setGroceryDetail(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit grocery store</DialogTitle>
            <DialogDescription>Update store and linked user contact</DialogDescription>
          </DialogHeader>
          {detailLoading || !groceryDetail?.store ? (
            <p className="text-muted-foreground py-4">{detailLoading ? "Loading…" : "Could not load."}</p>
          ) : (
            <div className="grid gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Store name</label>
                <Input
                  value={groceryEdit.storeName}
                  onChange={(e) => setGroceryEdit((x) => ({ ...x, storeName: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Address</label>
                <Input
                  value={groceryEdit.address}
                  onChange={(e) => setGroceryEdit((x) => ({ ...x, address: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-muted-foreground">Phone</label>
                  <Input
                    value={groceryEdit.phone}
                    onChange={(e) => setGroceryEdit((x) => ({ ...x, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Email</label>
                  <Input
                    value={groceryEdit.email}
                    onChange={(e) => setGroceryEdit((x) => ({ ...x, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-muted-foreground">Delivery fee</label>
                  <Input
                    type="number"
                    value={groceryEdit.deliveryFee}
                    onChange={(e) => setGroceryEdit((x) => ({ ...x, deliveryFee: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Min order</label>
                  <Input
                    type="number"
                    value={groceryEdit.minOrderAmount}
                    onChange={(e) => setGroceryEdit((x) => ({ ...x, minOrderAmount: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={groceryEdit.isOpen}
                    onChange={(e) => setGroceryEdit((x) => ({ ...x, isOpen: e.target.checked }))}
                  />
                  Open
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={groceryEdit.isVerified}
                    onChange={(e) => setGroceryEdit((x) => ({ ...x, isVerified: e.target.checked }))}
                  />
                  Verified
                </label>
              </div>
              <p className="font-medium pt-2">User</p>
              <Input
                placeholder="Owner name"
                value={groceryEdit.ownerName}
                onChange={(e) => setGroceryEdit((x) => ({ ...x, ownerName: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Owner phone"
                  value={groceryEdit.ownerPhone}
                  onChange={(e) => setGroceryEdit((x) => ({ ...x, ownerPhone: e.target.value }))}
                />
                <Input
                  placeholder="Owner email"
                  value={groceryEdit.ownerEmail}
                  onChange={(e) => setGroceryEdit((x) => ({ ...x, ownerEmail: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void saveGroceryEdit()}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StoreDetailsModal({
  store,
  onStatusChange,
  currencySymbol = "₦",
}: {
  store: GroceryStore
  onStatusChange: (id: string, status: string) => void
  currencySymbol?: string
}) {
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="products">Products</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Store Name</label>
            <p className="text-sm text-muted-foreground">{store.storeName}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <p className="text-sm text-muted-foreground">{store.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <p className="text-sm text-muted-foreground">{store.phone}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Address</label>
            <p className="text-sm text-muted-foreground">{store.address}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Store Types</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {store.storeType.map((type, i) => (
                <div key={i}>{getStoreTypeBadge(type)}</div>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Delivery Fee</label>
            <p className="text-sm text-muted-foreground">
              {currencySymbol}
              {store.deliveryFee}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="mt-1">{getStatusBadge(store.status)}</div>
          </div>
          <div>
            <label className="text-sm font-medium">Joined</label>
            <p className="text-sm text-muted-foreground">{new Date(store.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={() => onStatusChange(store.id, "APPROVED")} disabled={store.status === "APPROVED"}>
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => onStatusChange(store.id, "REJECTED")}
            disabled={store.status === "REJECTED"}
          >
            Reject
          </Button>
          <Button
            variant="destructive"
            onClick={() => onStatusChange(store.id, "SUSPENDED")}
            disabled={store.status === "SUSPENDED"}
          >
            Suspend
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="products" className="space-y-4">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Product management coming soon...</p>
        </div>
      </TabsContent>

      <TabsContent value="orders" className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{store.totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencySymbol}
                {store.revenue.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{store.totalProducts}</div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="analytics" className="space-y-4">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Analytics dashboard coming soon...</p>
        </div>
      </TabsContent>
    </Tabs>
  )
}

function getStatusBadge(status: string) {
  const variants = {
    PENDING: "secondary",
    APPROVED: "default",
    REJECTED: "destructive",
    SUSPENDED: "outline",
  }
  return <Badge variant={variants[status as keyof typeof variants] as any}>{status}</Badge>
}

function getStoreTypeBadge(type: string) {
  const colors = {
    Organic: "bg-green-100 text-green-800",
    Supermarket: "bg-blue-100 text-blue-800",
    Convenience: "bg-orange-100 text-orange-800",
    Specialty: "bg-purple-100 text-purple-800",
  }
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs ${colors[type as keyof typeof colors] || "bg-gray-100 text-gray-800"}`}
    >
      {type}
    </span>
  )
}
