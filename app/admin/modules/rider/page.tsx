"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  CheckCircle,
  XCircle,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  Eye,
  UserCheck,
  UserX,
  Edit,
  Save,
  X,
  BarChart3,
  Wallet,
  Car,
  Package,
  Bike,
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Shield,
  MoreHorizontal,
  Loader2
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

// --- Types ---
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
  const [currency, setCurrency] = useState<string>("₦")

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 1

  const getCurrency = async () => {
    try {
      const res = await fetch('/api/currencies')
      const data = await res.json()
      setCurrency(data.defaultCurrency?.symbol || '₦')
    } catch (err) {
      console.error('Error fetching default currency:', err)
    }
  }

  useEffect(() => {
    fetchRiderStats()
    fetchRiders()
    fetchRideTypes()
    getCurrency()
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        fetchRiders()
        fetchRiderStats()
        setSelectedRider(null)
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (response.ok) {
        fetchRiders()
        setIsEditMode(false)
        setEditingRider(null)
      }
    } catch (error) {
      console.error("Error updating rider:", error)
    }
  }

  const startEditMode = (rider: Rider) => {
    const riderWithDefaults = {
      ...rider,
      modules: rider.modules || [],
      rideType: rider.rideType || '',
      serviceTypes: rider.serviceTypes || {}
    }
    setEditingRider(riderWithDefaults)
    setIsEditMode(true)
  }

  const filteredRiders = riders.filter((rider) => {
    const matchesSearch =
      rider.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rider.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rider.phone.includes(searchTerm)
    const matchesStatus = statusFilter === "ALL" || rider.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED": return "bg-emerald-100 text-emerald-800 border-emerald-200"
      case "PENDING": return "bg-amber-100 text-amber-800 border-amber-200"
      case "REJECTED": return "bg-rose-100 text-rose-800 border-rose-200"
      case "SUSPENDED": return "bg-slate-100 text-slate-800 border-slate-200"
      default: return "bg-slate-100 text-slate-800 border-slate-200"
    }
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200"

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Rider Management</h1>
          <p className="text-slate-500 mt-1">Manage delivery personnel, KYC approvals, and logistics performance</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors shadow-sm font-medium">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Riders</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalRiders || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl flex items-center justify-center shadow-inner">
              <Users className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Riders</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.activeRiders || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl flex items-center justify-center shadow-inner">
              <Bike className="h-7 w-7 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Pending KYC</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.pendingApproval || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl flex items-center justify-center shadow-inner">
              <Clock className="h-7 w-7 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Avg Rating</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.averageRating?.toFixed(1) || "0.0"}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl flex items-center justify-center shadow-inner">
              <TrendingUp className="h-7 w-7 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search riders by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-11 pr-4 py-2.5 w-full border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-300 rounded-xl px-4 py-2.5 bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-sm text-slate-700 outline-none"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <button className="flex items-center px-4 py-2.5 border border-slate-300 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors shadow-sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto relative min-h-[300px]">
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
            </div>
          )}
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rider Details</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehicle</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Earnings & Perf</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredRiders.map((rider) => (
                <tr key={rider.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-6 py-5">
                    <div className="flex items-center">
                      <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center mr-4 text-slate-600">
                        <Users className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-900">{rider.name}</div>
                        <div className="text-xs text-slate-500">{rider.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm font-medium text-slate-700 flex items-center gap-2">
                       <Car className="h-4 w-4 text-slate-400" /> {rider.vehicleType}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                       <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold border rounded-full ${getStatusColor(rider.status)}`}>
                         {rider.status}
                       </span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="text-sm space-y-1">
                       <div className="font-bold text-slate-900">{currency}{rider.totalEarnings.toLocaleString()}</div>
                       <div className="text-xs text-slate-500">{rider.totalRides} trips completed</div>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => { setSelectedRider(rider); fetchRiderActivity(rider.id); }}
                        className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg transition-colors border border-transparent hover:border-emerald-600"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => startEditMode(rider)}
                        className="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors border border-transparent hover:border-blue-600"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      {rider.status === "PENDING" && (
                        <div className="flex gap-1 border-l pl-2 ml-1 border-slate-200">
                          <button onClick={() => handleStatusChange(rider.id, "APPROVED")} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-md"><UserCheck className="h-4 w-4" /></button>
                          <button onClick={() => handleStatusChange(rider.id, "REJECTED")} className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-md"><UserX className="h-4 w-4" /></button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
          <div className="text-sm text-slate-500">
            Page <span className="font-semibold text-slate-900">{currentPage}</span> of <span className="font-semibold text-slate-900">{totalPages}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button disabled className="flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-400 bg-white cursor-not-allowed">
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </button>
            <button disabled className="flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-400 bg-white cursor-not-allowed">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Details Dialog */}
      <Dialog open={!!selectedRider && !isEditMode} onOpenChange={(open) => { if (!open) setSelectedRider(null); }}>
        <DialogContent className="max-w-4xl bg-white rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          {selectedRider && (
            <div className="flex flex-col h-[85vh]">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                   <div className="h-12 w-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-emerald-600 shadow-sm"><Bike className="h-6 w-6" /></div>
                   <div>
                     <h2 className="text-xl font-bold text-slate-900">{selectedRider.name}</h2>
                     <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{selectedRider.vehicleType} • Rider Profile</p>
                   </div>
                </div>
                <button onClick={() => setSelectedRider(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="h-6 w-6" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <RiderDetailsTabs 
                   rider={selectedRider} 
                   activityData={activityData} 
                   currency={currency} 
                   onStatusChange={handleStatusChange} 
                   onEdit={startEditMode}
                   gradientBtnClass={gradientBtnClass}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditMode} onOpenChange={setIsEditMode}>
        <DialogContent className="max-w-3xl bg-white rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="flex flex-col h-[85vh]">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Edit Rider</h2>
              <button onClick={() => setIsEditMode(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X className="h-6 w-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {editingRider && (
                <EditRiderForm 
                   rider={editingRider} 
                   onSave={handleEditRider} 
                   onCancel={() => setIsEditMode(false)} 
                   rideTypes={rideTypes} 
                   currency={currency} 
                   gradientBtnClass={gradientBtnClass}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RiderDetailsTabs({ rider, activityData, currency, onStatusChange, onEdit, gradientBtnClass }: any) {
  const [activeTab, setActiveTab] = useState("profile")
  const getIcon = (n: string) => n === "RIDING" ? <Bike className="h-4 w-4" /> : n === "COURIER" ? <Package className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />

  return (
    <div className="space-y-6">
      <div className="bg-slate-100 p-1 rounded-xl inline-flex">
        {['profile', 'documents', 'analytics'].map(t => (
          <button 
            key={t} 
            onClick={() => setActiveTab(t)}
            className={cn("px-6 py-2 text-xs font-bold uppercase rounded-lg transition-all", activeTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}
          >
            {t}
          </button>
        ))}
      </div>

      {activeTab === "profile" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in duration-300">
           <div className="space-y-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                 <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Core Information</h4>
                 <div className="space-y-3 text-sm">
                    <p className="flex justify-between"><span className="text-slate-500">Name</span><span className="font-bold">{rider.name}</span></p>
                    <p className="flex justify-between"><span className="text-slate-500">Email</span><span className="font-medium">{rider.email}</span></p>
                    <p className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-medium">{rider.phone}</span></p>
                 </div>
              </div>
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                 <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Vehicle Specs</h4>
                 <div className="space-y-3 text-sm">
                    <p className="flex justify-between"><span className="text-slate-500">Vehicle</span><span className="font-bold">{rider.vehicleType}</span></p>
                    <p className="flex justify-between"><span className="text-slate-500">Make</span><span className="font-medium">{rider.vehicleBrand} {rider.vehicleModel}</span></p>
                 </div>
              </div>
           </div>
           <div className="space-y-6">
              <div>
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Capabilities</h4>
                <div className="flex flex-wrap gap-2">
                  {rider.modules?.map((m: string) => (
                    <span key={m} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold flex items-center gap-2">
                      {getIcon(m)} {m}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-10">
                 <button onClick={() => onStatusChange(rider.id, "APPROVED")} className={cn(gradientBtnClass, "px-6 py-2.5 rounded-xl font-bold text-sm flex-1")}>Approve</button>
                 <button onClick={() => onEdit(rider)} className="px-6 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-xl flex-1">Edit Info</button>
              </div>
           </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-2">
           {["License", "Registration", "Insurance"].map(d => (
             <div key={d} className="p-4 border border-slate-200 rounded-2xl flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400"><Shield className="h-5 w-5" /></div>
                   <span className="font-bold text-slate-900">{d}</span>
                </div>
                {rider.documentsVerified ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
             </div>
           ))}
        </div>
      )}

      {activeTab === "analytics" && (
        <div className="space-y-6 animate-in fade-in">
           {activityData ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-900 text-white p-6 rounded-2xl col-span-full">
                   <div className="flex items-center gap-2 mb-6"><Wallet className="h-5 w-5 text-emerald-400" /> <h4 className="font-bold text-xs uppercase tracking-widest">Financial Summary</h4></div>
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div><p className="text-[10px] text-slate-400 uppercase mb-1">Balance</p><p className="text-xl font-black text-emerald-400">{currency}{activityData.wallet.balance.toLocaleString()}</p></div>
                      <div><p className="text-[10px] text-slate-400 uppercase mb-1">Total Trips</p><p className="text-xl font-black">{activityData.rideBookings.total + activityData.courierBookings.total}</p></div>
                      <div><p className="text-[10px] text-slate-400 uppercase mb-1">Deposits</p><p className="text-xl font-black text-blue-400">{currency}{activityData.wallet.totalDeposits.toLocaleString()}</p></div>
                      <div><p className="text-[10px] text-slate-400 uppercase mb-1">Withdraws</p><p className="text-xl font-black text-rose-400">{currency}{activityData.wallet.totalWithdrawals.toLocaleString()}</p></div>
                   </div>
                </div>
             </div>
           ) : <div className="text-center py-10 text-slate-500">Processing Activity Data...</div>}
        </div>
      )}
    </div>
  )
}

function EditRiderForm({ rider, onSave, onCancel, rideTypes, currency, gradientBtnClass }: any) {
  const [formData, setFormData] = useState(rider)
  const inputClass = "w-full border border-slate-200 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow text-sm"
  const labelClass = "text-xs font-bold text-slate-500 uppercase ml-1"

  return (
    <div className="space-y-6">
       <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div><label className={labelClass}>Name</label><input className={inputClass} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} /></div>
          <div><label className={labelClass}>Email</label><input className={inputClass} value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
          <div><label className={labelClass}>Phone</label><input className={inputClass} value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
          <div><label className={labelClass}>Plate Number</label><input className={inputClass} value={formData.licensePlate || ''} onChange={e => setFormData({...formData, licensePlate: e.target.value})} /></div>
       </div>
       <div className="pt-4 border-t border-slate-100">
          <label className={labelClass}>Ride Type & Pricing</label>
          <select className={cn(inputClass, "bg-white")} value={formData.rideType || ''} onChange={e => setFormData({...formData, rideType: e.target.value})}>
             <option value="">Select Category</option>
             {rideTypes.map((rt: any) => <option key={rt.id} value={rt.id}>{rt.name} ({currency}{rt.pricePerKm}/km)</option>)}
          </select>
       </div>
       <div className="flex gap-4 pt-6 border-t border-slate-100">
          <button onClick={onCancel} className="px-6 py-2.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-700 flex-1">Cancel</button>
          <button onClick={() => onSave(formData)} className={cn(gradientBtnClass, "px-6 py-2.5 rounded-xl text-sm font-bold flex-1")}>Save Changes</button>
       </div>
    </div>
  )
}