"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Store,
  TrendingUp,
  CheckCircle,
  XCircle,
  Eye,
  Edit,
  MoreHorizontal,
  Download,
  Filter,
  Search,
  DollarSign,
  Clock,
  ChevronLeft,
  ChevronRight,
  Utensils,
  Star,
  AlertCircle,
  Loader2,
  UserCheck,
  UserX,
  Package
} from "lucide-react"

// --- Types ---
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
  
  // Modal States
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // Pagination State (Added for UI consistency)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 1 

  const fetchFoodStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/modules/food/stats")
      if (res.ok) setStats(await res.json())
    } catch (error) {
      console.error("Error fetching food stats:", error)
    }
  }, [])

  const fetchRestaurants = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/modules/food/list")
      if (res.ok) {
        const data = await res.json()
        setRestaurants(data.restaurants || [])
      }
    } catch (error) {
      console.error("Error fetching restaurants:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFoodStats()
    fetchRestaurants()
  }, [fetchFoodStats, fetchRestaurants])

  const handleStatusChange = async (restaurantId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/modules/food/${restaurantId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        fetchRestaurants()
        fetchFoodStats()
        if (viewOpen) setViewOpen(false)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED": return "bg-emerald-100 text-emerald-800 border-emerald-200"
      case "PENDING": return "bg-amber-100 text-amber-800 border-amber-200"
      case "REJECTED": return "bg-rose-100 text-rose-800 border-rose-200"
      case "SUSPENDED": return "bg-slate-100 text-slate-800 border-slate-200"
      default: return "bg-slate-100 text-slate-800 border-slate-200"
    }
  }

  const getPriceRangeColor = (range: string) => {
    switch (range) {
      case "BUDGET": return "bg-emerald-50 text-emerald-600 border-emerald-100"
      case "MODERATE": return "bg-blue-50 text-blue-600 border-blue-100"
      case "EXPENSIVE": return "bg-orange-50 text-orange-600 border-orange-100"
      case "LUXURY": return "bg-purple-50 text-purple-600 border-purple-100"
      default: return "bg-slate-50 text-slate-600 border-slate-100"
    }
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200"

  if (loading && restaurants.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Food & Restaurants</h1>
          <p className="text-slate-500 mt-1">Manage vendor approvals, menus, and performance metrics</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-colors shadow-sm">
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
              <p className="text-sm font-medium text-slate-500">Total Restaurants</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalRestaurants || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl flex items-center justify-center shadow-inner">
              <Store className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Vendors</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.activeRestaurants || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl flex items-center justify-center shadow-inner">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Revenue</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">
                {stats?.currencySymbol ?? "₦"}
                {(stats?.totalRevenue ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl flex items-center justify-center shadow-inner">
              <DollarSign className="h-7 w-7 text-amber-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Orders</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{(stats?.totalOrders || 0).toLocaleString()}</p>
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
                placeholder="Search restaurants, emails, or phones..."
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

      {/* Restaurants Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="overflow-x-auto relative min-h-[300px]">
          {loading ? (
             <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
               <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
             </div>
          ) : null}
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Restaurant Details</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cuisine & Price</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Performance</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredRestaurants.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">No restaurants found matching your criteria.</td>
                </tr>
              ) : (
                filteredRestaurants.map((restaurant) => (
                  <tr key={restaurant.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center mr-4 text-slate-600 shadow-sm">
                          <Utensils className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{restaurant.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{restaurant.email}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{restaurant.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {restaurant.cuisine.slice(0, 2).map((c, i) => (
                          <span key={i} className="px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md">{c}</span>
                        ))}
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] border font-bold ${getPriceRangeColor(restaurant.priceRange)}`}>
                        {restaurant.priceRange}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold border rounded-full ${getStatusColor(restaurant.status)}`}>
                          {restaurant.status}
                        </span>
                        <div className="flex items-center text-xs text-slate-500 font-medium">
                          {restaurant.isVerified ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-rose-500 mr-1.5" />
                          )}
                          {restaurant.isVerified ? "Verified" : "Unverified"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm space-y-1">
                        <div className="text-slate-900 font-medium">{restaurant.totalOrders.toLocaleString()} orders</div>
                        <div className="text-slate-500">{stats?.currencySymbol ?? "₦"}{restaurant.revenue.toLocaleString()}</div>
                        <div className="flex items-center text-amber-500">
                           <span className="text-xs font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">★ {restaurant.rating.toFixed(1)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => { setSelectedRestaurantId(restaurant.id); setViewOpen(true); }}
                          className="text-emerald-600 hover:text-white hover:bg-emerald-500 p-2 rounded-lg transition-colors border border-transparent hover:border-emerald-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/admin/modules/vendor-performance?vendorId=${encodeURIComponent(restaurant.userId || "")}&module=FOOD&label=${encodeURIComponent(restaurant.name)}`}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          Metrics
                        </Link>
                        <button
                          onClick={() => { setSelectedRestaurantId(restaurant.id); setEditOpen(true); }}
                          className="text-blue-600 hover:text-white hover:bg-blue-500 p-2 rounded-lg transition-colors border border-transparent hover:border-blue-600"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        {restaurant.status === "PENDING" && (
                          <div className="flex gap-1 border-l pl-2 ml-1 border-slate-200">
                             <button onClick={() => handleStatusChange(restaurant.id, "APPROVED")} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-md transition-colors" title="Approve">
                                <UserCheck className="h-4 w-4" />
                             </button>
                             <button onClick={() => handleStatusChange(restaurant.id, "REJECTED")} className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-md transition-colors" title="Reject">
                                <UserX className="h-4 w-4" />
                             </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between rounded-b-2xl">
          <div className="text-sm text-slate-500">
            Showing Page <span className="font-semibold text-slate-900">{currentPage}</span> of <span className="font-semibold text-slate-900">{totalPages}</span>
          </div>
          <div className="flex items-center space-x-2">
            <button disabled className="flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white opacity-50 cursor-not-allowed">
              <ChevronLeft className="h-4 w-4 mr-1" /> Prev
            </button>
            <button disabled className="flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white opacity-50 cursor-not-allowed">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedRestaurantId && (
        <>
          <ViewRestaurantModal
            open={viewOpen}
            onClose={() => setViewOpen(false)}
            restaurantId={selectedRestaurantId}
            baseRestaurant={restaurants.find(r => r.id === selectedRestaurantId)}
            currencySymbol={stats?.currencySymbol}
            onStatusChange={handleStatusChange}
            gradientBtnClass={gradientBtnClass}
          />
          <EditRestaurantModal
            open={editOpen}
            onClose={() => setEditOpen(false)}
            restaurantId={selectedRestaurantId}
            gradientBtnClass={gradientBtnClass}
            onSuccess={() => {
              fetchRestaurants()
              fetchFoodStats()
              setEditOpen(false)
            }}
          />
        </>
      )}
    </div>
  )
}

// --- View Modal Component ---
function ViewRestaurantModal({ open, onClose, restaurantId, baseRestaurant, currencySymbol = "₦", onStatusChange, gradientBtnClass }: any) {
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState("profile")

  useEffect(() => {
    if (open && restaurantId) {
      setLoading(true)
      fetch(`/api/admin/modules/food/${restaurantId}`)
        .then(res => res.json())
        .then(data => setDetail(data.error ? null : data))
        .catch(() => setDetail(null))
        .finally(() => setLoading(false))
    }
  }, [open, restaurantId])

  if (!open || !baseRestaurant) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
      <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Restaurant Details — <span className="text-emerald-600">{baseRestaurant.name}</span></h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors">
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
          ) : detail?.restaurant ? (
            <div className="space-y-6">
              {/* Quick Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Delivered Revenue</p>
                  <p className="text-xl font-bold text-slate-900">{currencySymbol}{(detail.summary?.deliveredRevenue ?? 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Menu Items</p>
                  <p className="text-xl font-bold text-slate-900">{detail.restaurant._count?.menuItems || 0}</p>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Total Orders</p>
                  <p className="text-xl font-bold text-slate-900">{detail.restaurant._count?.foodOrders || 0}</p>
                </div>
              </div>

              {/* Tabs */}
              <div className="border-b border-slate-200">
                <nav className="flex space-x-6">
                  {['profile', 'orders', 'menu'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`pb-3 text-sm font-semibold capitalize transition-colors relative ${activeTab === tab ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      {tab}
                      {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600 rounded-full" />}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="mt-4">
                {activeTab === 'profile' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4 text-sm">
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Vendor User ID</label><div className="font-mono mt-1 bg-slate-100 px-2 py-1 rounded w-fit">{detail.restaurant.userId}</div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Contact Info</label><div className="mt-1 text-slate-900 font-medium">{baseRestaurant.email}<br/>{baseRestaurant.phone}</div></div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Address</label><div className="mt-1 text-slate-600">{baseRestaurant.address}</div></div>
                    </div>
                    <div className="space-y-4 text-sm">
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Cuisines</label>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {baseRestaurant.cuisine.map((c: string, i: number) => <span key={i} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md border border-slate-200 text-xs font-medium">{c}</span>)}
                        </div>
                      </div>
                      <div><label className="text-xs font-bold text-slate-400 uppercase">Delivery Profile</label><div className="mt-1 text-slate-600 flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> {baseRestaurant.deliveryTime} average</div></div>
                    </div>
                  </div>
                )}

                {activeTab === 'orders' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50">
                        <tr><th className="px-4 py-3 text-left font-semibold text-slate-600">Order #</th><th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th><th className="px-4 py-3 text-right font-semibold text-slate-600">Total</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(detail.summary?.recentOrders || []).map((o: any) => (
                          <tr key={o.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-mono text-xs">{o.orderNumber}</td><td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold">{o.status}</span></td><td className="px-4 py-3 text-right font-bold">{currencySymbol}{o.total?.toLocaleString()}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'menu' && <div className="py-12 text-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400">Menu management interface coming soon</div>}
              </div>

              <div className="flex items-center justify-end space-x-3 mt-8 pt-5 border-t border-slate-100">
                <button onClick={() => onStatusChange(baseRestaurant.id, "REJECTED")} className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 font-medium rounded-xl hover:bg-rose-50 transition-colors shadow-sm">Reject / Suspend</button>
                <button onClick={() => onStatusChange(baseRestaurant.id, "APPROVED")} className={`px-5 py-2.5 rounded-xl ${gradientBtnClass}`}>Approve Vendor</button>
              </div>
            </div>
          ) : <div className="text-center py-12 text-rose-500">Failed to load detailed record.</div>}
        </div>
      </div>
    </div>
  )
}

// --- Edit Modal Component ---
function EditRestaurantModal({ open, onClose, restaurantId, gradientBtnClass, onSuccess }: any) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({
    name: "", address: "", phone: "", email: "", deliveryTime: "", deliveryFee: 0, minOrderAmount: 0,
    isOpen: true, isVerified: false, ownerName: "", ownerPhone: "", ownerEmail: ""
  })

  useEffect(() => {
    if (open && restaurantId) {
      setLoading(true)
      fetch(`/api/admin/modules/food/${restaurantId}`)
        .then(res => res.json())
        .then(data => {
          if (data && !data.error && data.restaurant) {
            const s = data.restaurant
            const u = s.user
            setFormData({
              name: s.name || "", address: s.address || "", phone: s.phone || "", email: s.email || "",
              deliveryTime: s.deliveryTime || "", deliveryFee: s.deliveryFee ?? 0, minOrderAmount: s.minOrderAmount ?? 0,
              isOpen: !!s.isOpen, isVerified: !!s.isVerified,
              ownerName: u?.name || "", ownerPhone: u?.phone || "", ownerEmail: u?.email || "",
            })
          }
        })
        .finally(() => setLoading(false))
    }
  }, [open, restaurantId])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/modules/food/${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name, address: formData.address, phone: formData.phone, email: formData.email || null,
          deliveryTime: formData.deliveryTime, deliveryFee: formData.deliveryFee, minOrderAmount: formData.minOrderAmount,
          isOpen: formData.isOpen, isVerified: formData.isVerified,
          user: { name: formData.ownerName, phone: formData.ownerPhone, email: formData.ownerEmail }
        })
      })
      if (res.ok) onSuccess()
    } catch (error) {
      console.error("Save failed", error)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Edit Restaurant Profile</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors"><XCircle className="h-6 w-6" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
             <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
          ) : (
            <div className="space-y-6">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Business Details</h3>
                <div className="space-y-3">
                   <div>
                     <label className="text-sm font-medium text-slate-700">Restaurant Name</label>
                     <input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                   </div>
                   <div>
                     <label className="text-sm font-medium text-slate-700">Address</label>
                     <input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div><label className="text-sm font-medium text-slate-700">Phone</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} /></div>
                     <div><label className="text-sm font-medium text-slate-700">Email</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} /></div>
                   </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-emerald-600" checked={formData.isOpen} onChange={e => setFormData({...formData, isOpen: e.target.checked})} /> Currently Open
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input type="checkbox" className="rounded border-slate-300 text-emerald-600" checked={formData.isVerified} onChange={e => setFormData({...formData, isVerified: e.target.checked})} /> Verified
                </label>
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Owner Details</h3>
                <div className="space-y-3">
                  <div><label className="text-sm font-medium text-slate-700">Full Name</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.ownerName} onChange={e => setFormData({...formData, ownerName: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-sm font-medium text-slate-700">Owner Phone</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.ownerPhone} onChange={e => setFormData({...formData, ownerPhone: e.target.value})} /></div>
                    <div><label className="text-sm font-medium text-slate-700">Owner Email</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={formData.ownerEmail} onChange={e => setFormData({...formData, ownerEmail: e.target.value})} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
          <button onClick={onClose} className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className={`px-6 py-2.5 rounded-xl ${gradientBtnClass} ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  )
}