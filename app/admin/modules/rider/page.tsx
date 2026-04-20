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
  DialogTrigger,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CheckCircle, XCircle, Clock, Users, TrendingUp, AlertTriangle, Eye, UserCheck, UserX, Edit, Save, X, BarChart3, Wallet, Car, Package, Bike } from "lucide-react"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Currency } from "@prisma/client"

interface RiderStats {
  totalRiders: number
  activeRiders: number
  pendingApproval: number
  totalEarnings: number
  averageRating: number
  completionRate: number
}

interface Rider {
  id: string
  name: string
  email: string
  phone: string
  vehicleType: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  rating: number
  totalRides: number
  totalEarnings: number
  documentsVerified: boolean
  createdAt: string
  lastActive: string
  // Extended fields for editing
  vehicleBrand?: string
  vehicleModel?: string
  vehicleYear?: string
  vehicleColor?: string
  licensePlate?: string
  licenseNumber?: string
  licenseExpiry?: string
  insurance?: string
  insuranceExpiry?: string
  nationalId?: string
  maxDeliveryDistance?: number
  modules?: string[]
  rideType?: string
  serviceTypes?: any
}

interface RideType {
  id: string
  name: string
  description: string
  basePrice: number
  pricePerKm: number
  capacity: string
  vehicleType: string
}

interface ActivityData {
  rideBookings: {
    total: number
    completed: number
    cancelled: number
    earnings: number
    averageRating: number
  }
  courierBookings: {
    total: number
    completed: number
    cancelled: number
    earnings: number
  }
  wallet: {
    balance: number
    totalTransactions: number
    totalDeposits: number
    totalWithdrawals: number
  }
  modules: {
    name: string
    activityCount: number
    earnings: number
  }[]
}

export default function RiderManagementPage() {
  const [stats, setStats] = useState<RiderStats | null>(null)
  const [riders, setRiders] = useState<Rider[]>([])
  const [rideTypes, setRideTypes] = useState<RideType[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null)
  const [editingRider, setEditingRider] = useState<Rider | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [activityData, setActivityData] = useState<ActivityData | null>(null)
  const [currencies, setCurrencies] = useState<Currency[]>([])

  const [currency, setCurrency] = useState<string>("₦")

  const getCurrency = async () => {
    const currency = await fetch('/api/currencies').then(res => res.json()).then(data => data.defaultCurrency).catch(err => {
      console.error('Error fetching default currency:', err)
      return null
    })
    setCurrency(currency?.symbol || '₦')
  }


  useEffect(() => {
    fetchRiderStats()
    fetchRiders()
    fetchRideTypes()
    fetchCurrencies()
    void getCurrency()
  }, [])

  const fetchRiderStats = async () => {
    try {
      const response = await fetch("/api/admin/modules/rider/stats")
      const data = await response.json()
      setStats(data)
    } catch (error) {
      console.error("Error fetching rider stats:", error)
    }
  }

  const fetchRiders = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/modules/rider/list")
      const data = await response.json()
      setRiders(data.riders || [])
    } catch (error) {
      console.error("Error fetching riders:", error)
    } finally {
      setLoading(false)
    }
  }

  const fetchCurrencies = async () => {

    try {
      const response = await fetch("/api/currencies")
      const data = await response.json()
      setCurrencies(data || [])
    } catch (error) {
      console.error("Error fetching currencies:", error)
    }
  }

  const fetchRideTypes = async () => {
    try {
      const response = await fetch("/api/admin/modules/rider/ride-types")
      const data = await response.json()
      setRideTypes(data.rideTypes || [])
    } catch (error) {
      console.error("Error fetching ride types:", error)
    }
  }

  const fetchRiderActivity = async (riderId: string) => {
    try {
      const response = await fetch(`/api/admin/modules/rider/${riderId}/activity`)
      const data = await response.json()
      setActivityData(data)
    } catch (error) {
      console.error("Error fetching rider activity:", error)
    }
  }

  const handleStatusChange = async (riderId: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/admin/modules/rider/${riderId}/kyc`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        fetchRiders()
        fetchRiderStats()
      }
    } catch (error) {
      console.error("Error updating rider status:", error)
    }
  }

  const handleEditRider = async (formData: Rider) => {
    if (!formData) return

    try {
      const response = await fetch(`/api/admin/modules/rider/${formData.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      if (response.ok) {
        fetchRiders()
        setIsEditMode(false)
        setEditingRider(null)
        setSelectedRider(null)
      }
    } catch (error) {
      console.error("Error updating rider:", error)
    }
  }

  const startEditMode = (rider: Rider) => {
    // Ensure all fields are properly initialized
    const riderWithDefaults = {
      ...rider,
      modules: rider.modules || [],
      rideType: rider.rideType || '',
      serviceTypes: rider.serviceTypes || {}
    }
    setEditingRider(riderWithDefaults)
    setIsEditMode(true)
  }

  const cancelEdit = () => {
    setIsEditMode(false)
    setEditingRider(null)
  }

  const filteredRiders = riders.filter((rider) => {
    const matchesSearch =
      rider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rider.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rider.phone.includes(searchTerm)
    const matchesStatus = statusFilter === "ALL" || rider.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status: string) => {
    const variants = {
      PENDING: "secondary",
      APPROVED: "default",
      REJECTED: "destructive",
      SUSPENDED: "outline",
    } as const
    return <Badge variant={variants[status as keyof typeof variants]}>{status}</Badge>
  }

  const getModuleIcon = (moduleName: string) => {
    switch (moduleName) {
      case "RIDING":
        return <Bike className="h-4 w-4" />
      case "COURIER":
        return <Package className="h-4 w-4" />
      case "PHARMACY":
        return <Car className="h-4 w-4" />
      default:
        return <BarChart3 className="h-4 w-4" />
    }
  }

  if (loading && !stats) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Rider Management</h1>
          <p className="text-muted-foreground">Manage riders, approvals, and performance</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Riders</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRiders || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Riders</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeRiders || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pendingApproval || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.averageRating?.toFixed(1) || "0.0"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Riders</CardTitle>
          <CardDescription>Manage and monitor all riders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <Input
              placeholder="Search riders..."
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

          {/* Riders Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rider</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Total Rides</TableHead>
                <TableHead>Earnings</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRiders.map((rider) => (
                <TableRow key={rider.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{rider.name}</div>
                      <div className="text-sm text-muted-foreground">{rider.email}</div>
                      <div className="text-sm text-muted-foreground">{rider.phone}</div>
                    </div>
                  </TableCell>
                  <TableCell>{rider.vehicleType}</TableCell>
                  <TableCell>{getStatusBadge(rider.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <span className="mr-1">⭐</span>
                      {rider.rating.toFixed(1)}
                    </div>
                  </TableCell>
                  <TableCell>{rider.totalRides}</TableCell>
                  <TableCell>{currency} {rider.totalEarnings.toLocaleString()}</TableCell>
                  <TableCell>
                    {rider.documentsVerified ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRider(rider)
                              fetchRiderActivity(rider.id)
                              void (async () => {
                                try {
                                  const res = await fetch(`/api/admin/modules/rider/${rider.id}`)
                                  const data = await res.json()
                                  if (data.rider) setSelectedRider(data.rider as Rider)
                                } catch {
                                  /* keep list payload */
                                }
                              })()
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl bg-white" >
                          <DialogHeader>
                            <DialogTitle>Rider Details</DialogTitle>
                            <DialogDescription>View and manage rider information</DialogDescription>
                          </DialogHeader>
                          {selectedRider && (
                            <RiderDetailsModal 
                              rider={selectedRider} 
                              onStatusChange={handleStatusChange}
                              onEdit={startEditMode}
                              rideTypes={rideTypes}
                              activityData={activityData}
                              currencies={currencies}
                              currency={currency}
                            />
                          )}
                        </DialogContent>
                      </Dialog>

                      {rider.status === "PENDING" && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => handleStatusChange(rider.id, "APPROVED")}>
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleStatusChange(rider.id, "REJECTED")}>
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

      {/* Edit Rider Dialog */}
      {editingRider && (
        <Dialog open={isEditMode} onOpenChange={setIsEditMode}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white">
            <DialogHeader>
              <DialogTitle>Edit Rider Information</DialogTitle>
              <DialogDescription>Update rider details and preferences</DialogDescription>
            </DialogHeader>
            <EditRiderForm
              rider={editingRider}
              onSave={(formData) => handleEditRider(formData)}
              onCancel={cancelEdit}
              rideTypes={rideTypes}
              currencies={currencies}
              currency={currency}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function RiderDetailsModal({
  rider,
  onStatusChange,
  onEdit,
  rideTypes,
  activityData,
  currencies,
  currency,
}: { 
  rider: Rider; 
  onStatusChange: (id: string, status: string) => void;
  onEdit: (rider: Rider) => void;
  rideTypes: RideType[];
  activityData: ActivityData | null;
  currencies: Currency[];
  currency: string;
  currency: string;
}) {
  const getModuleIcon = (moduleName: string) => {
    switch (moduleName) {
      case "RIDING":
        return <Bike className="h-4 w-4" />
      case "COURIER":
        return <Package className="h-4 w-4" />
      case "PHARMACY":
        return <Car className="h-4 w-4" />
      default:
        return <BarChart3 className="h-4 w-4" />
    }
  }
  return (
    <Tabs defaultValue="profile" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">Rider Profile</h3>
          <Button onClick={() => onEdit(rider)} variant="outline" size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Name</label>
            <p className="text-sm text-muted-foreground">{rider.name}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <p className="text-sm text-muted-foreground">{rider.email}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <p className="text-sm text-muted-foreground">{rider.phone}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Vehicle Type</label>
            <p className="text-sm text-muted-foreground">{rider.vehicleType}</p>
          </div>
          <div>
            <label className="text-sm font-medium">Status</label>
            <div className="mt-1">{getStatusBadge(rider.status)}</div>
          </div>
          <div>
            <label className="text-sm font-medium">Joined</label>
            <p className="text-sm text-muted-foreground">{new Date(rider.createdAt).toLocaleDateString()}</p>
          </div>
          {rider.vehicleBrand && (
            <div>
              <label className="text-sm font-medium">Vehicle Brand</label>
              <p className="text-sm text-muted-foreground">{rider.vehicleBrand}</p>
            </div>
          )}
          {rider.vehicleModel && (
            <div>
              <label className="text-sm font-medium">Vehicle Model</label>
              <p className="text-sm text-muted-foreground">{rider.vehicleModel}</p>
            </div>
          )}
          {rider.modules && rider.modules.length > 0 && (
            <div className="col-span-2">
              <label className="text-sm font-medium">Active Modules</label>
              <div className="flex gap-2 mt-1">
                {rider?.modules?.map((module) => (
                  <Badge key={module} variant="secondary" className="flex items-center gap-1">
                    {getModuleIcon(module)}
                    {module}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {rider.rideType && (
            <div>
              <label className="text-sm font-medium">Ride Type</label>
              <p className="text-sm text-muted-foreground">
                {rideTypes.find(rt => rt.id === rider.rideType)?.name || rider.rideType}
              </p>
            </div>
          )}
          {rider.serviceTypes && Object.keys(rider.serviceTypes).length > 0 && (
            <div className="col-span-2">
              <label className="text-sm font-medium">Service Types</label>
              <div className="flex gap-2 mt-1">
                {Object.entries(rider.serviceTypes).map(([key, value]) => 
                  value && (
                    <Badge key={key} variant="outline" className="flex items-center gap-1">
                      {key === 'MODULE_DELIVERY' ? '📦' : '🚗'}
                      {key === 'MODULE_DELIVERY' ? 'Module Delivery' : 'External'}
                    </Badge>
                  )
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-4">
          <Button onClick={() => onStatusChange(rider.id, "APPROVED")} disabled={rider.status === "APPROVED"}>
            Approve
          </Button>
          <Button
            variant="outline"
            onClick={() => onStatusChange(rider.id, "REJECTED")}
            disabled={rider.status === "REJECTED"}
          >
            Reject
          </Button>
          <Button
            variant="destructive"
            onClick={() => onStatusChange(rider.id, "SUSPENDED")}
            disabled={rider.status === "SUSPENDED"}
          >
            Suspend
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="documents" className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h4 className="font-medium">Driver's License</h4>
              <p className="text-sm text-muted-foreground">Required for verification</p>
            </div>
            {rider.documentsVerified ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h4 className="font-medium">Vehicle Registration</h4>
              <p className="text-sm text-muted-foreground">Vehicle ownership proof</p>
            </div>
            {rider.documentsVerified ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <h4 className="font-medium">Insurance</h4>
              <p className="text-sm text-muted-foreground">Valid insurance coverage</p>
            </div>
            {rider.documentsVerified ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600" />
            )}
          </div>
        </div>
      </TabsContent>

      <TabsContent value="performance" className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Rides</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rider.totalRides}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Rating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rider.rating.toFixed(1)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Total Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{currency} {rider.totalEarnings.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Last Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm">{new Date(rider.lastActive).toLocaleDateString()}</div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="analytics" className="space-y-4">
        {activityData ? (
          <div className="space-y-6">
            {/* Ride Bookings Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bike className="h-5 w-5" />
                  Ride Bookings Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{activityData.rideBookings.total}</div>
                    <div className="text-sm text-muted-foreground">Total Rides</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{activityData.rideBookings.completed}</div>
                    <div className="text-sm text-muted-foreground">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{activityData.rideBookings.cancelled}</div>
                    <div className="text-sm text-muted-foreground">Cancelled</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{currency} {activityData.rideBookings.earnings.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Earnings</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Courier Bookings Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Courier Bookings Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{activityData.courierBookings.total}</div>
                    <div className="text-sm text-muted-foreground">Total Deliveries</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{activityData.courierBookings.completed}</div>
                    <div className="text-sm text-muted-foreground">Completed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{activityData.courierBookings.cancelled}</div>
                    <div className="text-sm text-muted-foreground">Cancelled</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{currency} {activityData.courierBookings.earnings.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Earnings</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Wallet Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Wallet Analytics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">{currency} {activityData.wallet.balance.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Current Balance</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold">{activityData.wallet.totalTransactions}</div>
                    <div className="text-sm text-muted-foreground">Total Transactions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{currency} {activityData.wallet.totalDeposits.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Deposits</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">{currency} {activityData.wallet.totalWithdrawals.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Withdrawals</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Module Activity */}
            {activityData?.modules && activityData?.modules?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Module Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {activityData?.modules?.map((module) => (
                      <div key={module.name} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-2">
                          {getModuleIcon(module.name)}
                          <span className="font-medium">{module.name}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <div className="text-sm font-medium">{module.activityCount}</div>
                            <div className="text-xs text-muted-foreground">Activities</div>
                          </div>
                          <div className="text-center">
                            <div className="text-sm font-medium">{currency} {module.earnings.toLocaleString()}</div>
                            <div className="text-xs text-muted-foreground">Earnings</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-32">
            <div className="text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">Loading analytics...</p>
            </div>
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}

function EditRiderForm({
  rider,
  onSave,
  onCancel,
  rideTypes,
  currencies,
  currency,
}: {
  rider: Rider;
  onSave: (formData: Rider) => void;
  onCancel: () => void;
  rideTypes: RideType[];
  currencies: Currency[];
  currency: string;
  currency: string;
  }) {
  const [formData, setFormData] = useState(rider)

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleModuleToggle = (module: string) => {
    const currentModules = formData.modules || []
    const newModules = currentModules.includes(module)
      ? currentModules.filter(m => m !== module)
      : [...currentModules, module]
    handleInputChange('modules', newModules)
  }

  const handleRideTypeChange = (rideTypeId: string) => {
    const selectedRideType = rideTypes.find(rt => rt.id === rideTypeId)
    handleInputChange('rideType', rideTypeId)
    if (selectedRideType) {
      handleInputChange('vehicleType', selectedRideType.vehicleType)
    }
  }

  const handleServiceTypeToggle = (serviceType: string) => {
    const currentServiceTypes = formData.serviceTypes || {}
    const newServiceTypes = {
      ...currentServiceTypes,
      [serviceType]: !currentServiceTypes[serviceType]
    }
    handleInputChange('serviceTypes', newServiceTypes)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="vehicleType">Vehicle Type</Label>
          <Select value={formData.vehicleType} onValueChange={(value) => handleInputChange('vehicleType', value)}>
            <SelectTrigger>
              <SelectValue placeholder="Select vehicle type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BICYCLE">Bicycle</SelectItem>
              <SelectItem value="MOTORCYCLE">Motorcycle</SelectItem>
              <SelectItem value="SCOOTER">Scooter</SelectItem>
              <SelectItem value="CAR">Car</SelectItem>
              <SelectItem value="VAN">Van</SelectItem>
              <SelectItem value="TRUCK">Truck</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="vehicleBrand">Vehicle Brand</Label>
          <Input
            id="vehicleBrand"
            value={formData.vehicleBrand || ''}
            onChange={(e) => handleInputChange('vehicleBrand', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="vehicleModel">Vehicle Model</Label>
          <Input
            id="vehicleModel"
            value={formData.vehicleModel || ''}
            onChange={(e) => handleInputChange('vehicleModel', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="licensePlate">License Plate</Label>
          <Input
            id="licensePlate"
            value={formData.licensePlate || ''}
            onChange={(e) => handleInputChange('licensePlate', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="maxDeliveryDistance">Max Delivery Distance (km)</Label>
          <Input
            id="maxDeliveryDistance"
            type="number"
            value={formData.maxDeliveryDistance || 15}
            onChange={(e) => handleInputChange('maxDeliveryDistance', parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div>
        <Label className="text-base font-medium">Active Modules</Label>
        <div className="grid grid-cols-3 gap-3 mt-2">
          {['AUTO_PARTS', 'PHARMACY', 'FOOD', 'GROCERY', 'RIDING', 'COURIER', 'WHOLESALER'].map((module) => (
            <div key={module} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <Switch
                id={module}
                checked={(formData.modules || []).includes(module)}
                onCheckedChange={() => handleModuleToggle(module)}
                className="data-[state=checked]:bg-[#4ade80] data-[state=unchecked]:bg-gray-200"
              />
              <Label htmlFor={module} className="text-sm font-medium cursor-pointer">{module.replace('_', ' ')}</Label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-base font-medium">Service Types</Label>
        <div className="grid grid-cols-2 gap-3 mt-2">
          {['MODULE_DELIVERY', 'EXTERNAL'].map((serviceType) => (
            <div key={serviceType} className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-gray-50 transition-colors">
              <Switch
                id={serviceType}
                checked={(formData.serviceTypes || {})[serviceType] || false}
                onCheckedChange={() => handleServiceTypeToggle(serviceType)}
                className="data-[state=checked]:bg-[#4ade80] data-[state=unchecked]:bg-gray-200"
              />
              <Label htmlFor={serviceType} className="text-sm font-medium cursor-pointer">
                {serviceType === 'MODULE_DELIVERY' ? '📦 Module Delivery' : '🚗 External'}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-base font-medium">Ride Type</Label>
        <Select value={formData.rideType || ''} onValueChange={handleRideTypeChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a ride type" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            {rideTypes.map((rideType) => (
              <SelectItem key={rideType.id} value={rideType.id}>
                {rideType.name} - {currency} {rideType.pricePerKm}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        <Button onClick={() => onSave(formData)}>
          <Save className="h-4 w-4 mr-2" />
          Save Changes
        </Button>
      </div>
    </div>
  )
}

function getStatusBadge(status: string) {
  const variants = {
    PENDING: "secondary",
    APPROVED: "default",
    REJECTED: "destructive",
    SUSPENDED: "outline",
  } as const
  return <Badge variant={variants[status as keyof typeof variants]}>{status}</Badge>
}
