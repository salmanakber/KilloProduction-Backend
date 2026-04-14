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
import { CheckCircle, Store, TrendingUp, DollarSign, Eye, Edit, UserCheck, UserX, Star } from "lucide-react"

interface FoodStats {
  totalRestaurants: number
  activeRestaurants: number
  pendingApproval: number
  totalRevenue: number
  averageRating: number
  totalOrders: number
  totalMenuItems?: number
  currencySymbol?: string
}

interface Restaurant {
  id: string
  userId: string
  name: string
  email: string
  phone: string
  cuisine: string[]
  address: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  rating: number
  totalOrders: number
  revenue: number
  isVerified: boolean
  createdAt: string
  lastActive: string
  deliveryTime: string
  priceRange: string
}

export default function FoodManagementPage() {
  const [stats, setStats] = useState<FoodStats | null>(null)
  const [restaurants, setRestaurants] = useState<Restaurant[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [foodDetail, setFoodDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [foodEdit, setFoodEdit] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    deliveryTime: "",
    deliveryFee: 0,
    minOrderAmount: 0,
    isOpen: true,
    isVerified: false,
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
  })

  const loadFoodDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/food/${id}`)
      const j = await r.json()
      setFoodDetail(j.error ? null : j)
    } catch {
      setFoodDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (!editOpen || !foodDetail?.restaurant) return
    const s = foodDetail.restaurant
    const u = s.user
    setFoodEdit({
      name: s.name || "",
      address: s.address || "",
      phone: s.phone || "",
      email: s.email || "",
      deliveryTime: s.deliveryTime || "",
      deliveryFee: s.deliveryFee ?? 0,
      minOrderAmount: s.minOrderAmount ?? 0,
      isOpen: !!s.isOpen,
      isVerified: !!s.isVerified,
      ownerName: u?.name || "",
      ownerPhone: u?.phone || "",
      ownerEmail: u?.email || "",
    })
  }, [editOpen, foodDetail])

  const saveFoodEdit = async () => {
    if (!selectedRestaurant) return
    const r = await fetch(`/api/admin/modules/food/${selectedRestaurant.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: foodEdit.name,
        address: foodEdit.address,
        phone: foodEdit.phone,
        email: foodEdit.email || null,
        deliveryTime: foodEdit.deliveryTime,
        deliveryFee: foodEdit.deliveryFee,
        minOrderAmount: foodEdit.minOrderAmount,
        isOpen: foodEdit.isOpen,
        isVerified: foodEdit.isVerified,
        user: {
          name: foodEdit.ownerName,
          phone: foodEdit.ownerPhone,
          email: foodEdit.ownerEmail,
        },
      }),
    })
    if (r.ok) {
      await fetchRestaurants()
      await fetchFoodStats()
      setEditOpen(false)
      setFoodDetail(null)
    }
  }

  useEffect(() => {
    fetchFoodStats()
    fetchRestaurants()
  }, [])

  const fetchFoodStats = async () => {
    try {
      const response = await fetch("/api/admin/modules/food/stats")
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error("Error fetching food stats:", error)
    }
  }

  const fetchRestaurants = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/modules/food/list")
      const data = await response.json()
      setRestaurants(data.restaurants || [])
    } catch (error) {
      console.error("Error fetching restaurants:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (restaurantId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/modules/food/${restaurantId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        fetchRestaurants()
        fetchFoodStats()
      }
    } catch (error) {
      console.error("Error updating restaurant status:", error)
    }
  }

  const filteredRestaurants = restaurants.filter((restaurant) => {
    const matchesSearch =
      restaurant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      restaurant.phone.includes(searchTerm)
    const matchesStatus = statusFilter === "ALL" || restaurant.status === statusFilter
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

  const getPriceRangeBadge = (priceRange: string) => {
    const colors = {
      BUDGET: "bg-green-100 text-green-800",
      MODERATE: "bg-blue-100 text-blue-800",
      EXPENSIVE: "bg-orange-100 text-orange-800",
      LUXURY: "bg-purple-100 text-purple-800",
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[priceRange as keyof typeof colors]}`}>
        {priceRange}
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
          <h1 className="text-3xl font-bold">Food & Restaurant Management</h1>
          <p className="text-muted-foreground">Manage restaurants, approvals, and food services</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Restaurants</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRestaurants || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Restaurants</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeRestaurants || 0}</div>
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalOrders?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Restaurants Table */}
      <Card>
        <CardHeader>
          <CardTitle>Restaurants</CardTitle>
          <CardDescription>Manage and monitor all restaurants</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search restaurants..."
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
                <TableHead>Restaurant</TableHead>
                <TableHead>Cuisine</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Orders</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Price Range</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRestaurants.map((restaurant) => (
                <TableRow key={restaurant.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{restaurant.name}</div>
                      <div className="text-sm text-muted-foreground">{restaurant.email}</div>
                      <div className="text-sm text-muted-foreground">{restaurant.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {restaurant.cuisine.slice(0, 2).map((c, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                      {restaurant.cuisine.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{restaurant.cuisine.length - 2}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(restaurant.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Star className="h-4 w-4 text-yellow-400 mr-1" />
                      {restaurant.rating.toFixed(1)}
                    </div>
                  </TableCell>
                  <TableCell>{restaurant.totalOrders.toLocaleString()}</TableCell>
                  <TableCell>
                    {stats?.currencySymbol ?? "₦"}
                    {restaurant.revenue.toLocaleString()}
                  </TableCell>
                  <TableCell>{getPriceRangeBadge(restaurant.priceRange)}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        title="View"
                        onClick={() => {
                          setSelectedRestaurant(restaurant)
                          setViewOpen(true)
                          void loadFoodDetail(restaurant.id)
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        title="Edit"
                        onClick={() => {
                          setSelectedRestaurant(restaurant)
                          setEditOpen(true)
                          void loadFoodDetail(restaurant.id)
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>

                      {restaurant.status === "PENDING" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(restaurant.id, "APPROVED")}
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(restaurant.id, "REJECTED")}
                          >
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

      <Dialog open={viewOpen} onOpenChange={(o) => { setViewOpen(o); if (!o) setFoodDetail(null) }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>View restaurant</DialogTitle>
            <DialogDescription>Full record and recent orders</DialogDescription>
          </DialogHeader>
          {detailLoading ? (
            <p className="text-muted-foreground py-6">Loading…</p>
          ) : foodDetail?.restaurant ? (
            <div className="space-y-4 text-sm">
              <p>
                <span className="text-muted-foreground">Vendor user ID:</span>{" "}
                <span className="font-mono text-xs">{foodDetail.restaurant.userId}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Delivered revenue:</span> {stats?.currencySymbol ?? "₦"}
                {(foodDetail.summary?.deliveredRevenue ?? 0).toLocaleString()}
              </p>
              <p>
                <span className="text-muted-foreground">Menu items / orders:</span>{" "}
                {foodDetail.restaurant._count?.menuItems} · {foodDetail.restaurant._count?.foodOrders}
              </p>
              <div>
                <p className="font-medium mb-2">Recent orders</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {(foodDetail.summary?.recentOrders || []).map((o: any) => (
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
              {selectedRestaurant && (
                <RestaurantDetailsModal
                  restaurant={selectedRestaurant}
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

      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (!o) setFoodDetail(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit restaurant</DialogTitle>
            <DialogDescription>Update restaurant and linked user</DialogDescription>
          </DialogHeader>
          {detailLoading || !foodDetail?.restaurant ? (
            <p className="text-muted-foreground py-4">{detailLoading ? "Loading…" : "Could not load."}</p>
          ) : (
            <div className="grid gap-3">
              <div>
                <label className="text-sm text-muted-foreground">Name</label>
                <Input value={foodEdit.name} onChange={(e) => setFoodEdit((x) => ({ ...x, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Address</label>
                <Input
                  value={foodEdit.address}
                  onChange={(e) => setFoodEdit((x) => ({ ...x, address: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-muted-foreground">Phone</label>
                  <Input
                    value={foodEdit.phone}
                    onChange={(e) => setFoodEdit((x) => ({ ...x, phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Email</label>
                  <Input
                    value={foodEdit.email}
                    onChange={(e) => setFoodEdit((x) => ({ ...x, email: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Delivery time</label>
                <Input
                  value={foodEdit.deliveryTime}
                  onChange={(e) => setFoodEdit((x) => ({ ...x, deliveryTime: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-muted-foreground">Delivery fee</label>
                  <Input
                    type="number"
                    value={foodEdit.deliveryFee}
                    onChange={(e) => setFoodEdit((x) => ({ ...x, deliveryFee: Number(e.target.value) }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Min order</label>
                  <Input
                    type="number"
                    value={foodEdit.minOrderAmount}
                    onChange={(e) => setFoodEdit((x) => ({ ...x, minOrderAmount: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={foodEdit.isOpen}
                    onChange={(e) => setFoodEdit((x) => ({ ...x, isOpen: e.target.checked }))}
                  />
                  Open
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={foodEdit.isVerified}
                    onChange={(e) => setFoodEdit((x) => ({ ...x, isVerified: e.target.checked }))}
                  />
                  Verified
                </label>
              </div>
              <p className="font-medium pt-2">User</p>
              <Input
                placeholder="Owner name"
                value={foodEdit.ownerName}
                onChange={(e) => setFoodEdit((x) => ({ ...x, ownerName: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Owner phone"
                  value={foodEdit.ownerPhone}
                  onChange={(e) => setFoodEdit((x) => ({ ...x, ownerPhone: e.target.value }))}
                />
                <Input
                  placeholder="Owner email"
                  value={foodEdit.ownerEmail}
                  onChange={(e) => setFoodEdit((x) => ({ ...x, ownerEmail: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void saveFoodEdit()}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RestaurantDetailsModal({
  restaurant,
  onStatusChange,
  currencySymbol = "₦",
}: {
  restaurant: Restaurant
  onStatusChange: (id: string, status: string) => void
  currencySymbol?: string
}) {
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="menu">Menu</TabsTrigger>
        <TabsTrigger value="orders">Orders</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Restaurant Name</label>
            <p className="text-sm text-muted-foreground">{restaurant.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <p className="text-sm text-muted-foreground">{restaurant.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <p className="text-sm text-muted-foreground">{restaurant.phone}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Address</label>
            <p className="text-sm text-muted-foreground">{restaurant.address}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Cuisine Types</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {restaurant.cuisine.map((c, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Delivery Time</label>
            <p className="text-sm text-muted-foreground">{restaurant.deliveryTime}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="mt-1">{getStatusBadge(restaurant.status)}</div>
          </div>
          <div>
            <label className="text-sm font-medium">Joined</label>
            <p className="text-sm text-muted-foreground">{new Date(restaurant.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={() => onStatusChange(restaurant.id, "APPROVED")} disabled={restaurant.status === "APPROVED"}>
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => onStatusChange(restaurant.id, "REJECTED")}
            disabled={restaurant.status === "REJECTED"}
          >
            Reject
          </Button>
          <Button
            variant="destructive"
            onClick={() => onStatusChange(restaurant.id, "SUSPENDED")}
            disabled={restaurant.status === "SUSPENDED"}
          >
            Suspend
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="menu" className="space-y-4">
        <div className="text-center py-8">
          <p className="text-muted-foreground">Menu management coming soon...</p>
        </div>
      </TabsContent>

      <TabsContent value="orders" className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{restaurant.totalOrders}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currencySymbol}
                {restaurant.revenue.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{restaurant.rating.toFixed(1)}</div>
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
