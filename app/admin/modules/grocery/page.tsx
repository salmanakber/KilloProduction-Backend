"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Store,
  ShoppingCart,
  Package,
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
  UserCheck,
  UserX,
  Loader2,
  AlertCircle
} from "lucide-react"

// --- Types ---
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

  // Pagination State (UI Consistency)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 1

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })

      if (response.ok) {
        fetchStores()
        fetchGroceryStats()
        if (viewOpen) setViewOpen(false)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED": return "bg-emerald-100 text-emerald-800 border-emerald-200"
      case "PENDING": return "bg-amber-100 text-amber-800 border-amber-200"
      case "REJECTED": return "bg-rose-100 text-rose-800 border-rose-200"
      case "SUSPENDED": return "bg-slate-100 text-slate-800 border-slate-200"
      default: return "bg-slate-100 text-slate-800 border-slate-200"
    }
  }

  const getStoreTypeColor = (type: string) => {
    switch (type) {
      case "Organic": return "bg-emerald-50 text-emerald-600 border-emerald-100"
      case "Supermarket": return "bg-blue-50 text-blue-600 border-blue-100"
      case "Convenience": return "bg-orange-50 text-orange-600 border-orange-100"
      case "Specialty": return "bg-purple-50 text-purple-600 border-purple-100"
      default: return "bg-slate-50 text-slate-600 border-slate-100"
    }
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200"

  if (loading && stores.length === 0) {
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Grocery Store Management</h1>
          <p className="text-slate-500 mt-1">Manage grocery vendors, inventory, and fulfillment performance</p>
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
              <p className="text-sm font-medium text-slate-500">Total Stores</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalStores || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-blue-100 to-blue-50 rounded-xl flex items-center justify-center shadow-inner">
              <ShoppingCart className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Active Stores</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.activeStores || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl flex items-center justify-center shadow-inner">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Products</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.totalProducts?.toLocaleString() || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-purple-100 to-purple-50 rounded-xl flex items-center justify-center shadow-inner">
              <Package className="h-7 w-7 text-purple-600" />
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
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Search stores, emails, or phones..."
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

      {/* Stores Table */}
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Store Details</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type & Min Order</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Inventory & Revenue</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredStores.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">No stores found matching your criteria.</td>
                </tr>
              ) : (
                filteredStores.map((store) => (
                  <tr key={store.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-5">
                      <div className="flex items-center">
                        <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center mr-4 text-slate-600 shadow-sm">
                          <Store className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900">{store.storeName}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{store.email}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{store.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {store.storeType.slice(0, 2).map((type, i) => (
                          <span key={i} className={`px-2 py-0.5 text-[10px] font-bold border rounded-md ${getStoreTypeColor(type)}`}>{type}</span>
                        ))}
                      </div>
                      <div className="text-xs text-slate-500 font-medium">Min Order: {stats?.currencySymbol ?? "₦"}{store.minOrderAmount.toLocaleString()}</div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold border rounded-full ${getStatusColor(store.status)}`}>
                          {store.status}
                        </span>
                        <div className="flex items-center text-xs text-slate-500 font-medium">
                          {store.isVerified ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-rose-500 mr-1.5" />
                          )}
                          {store.isVerified ? "Verified" : "Unverified"}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm space-y-1">
                        <div className="text-slate-900 font-medium">{store.totalProducts.toLocaleString()} items</div>
                        <div className="text-slate-500">{stats?.currencySymbol ?? "₦"}{store.revenue.toLocaleString()}</div>
                        <div className="flex items-center text-amber-500">
                           <span className="text-xs font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">★ {store.rating.toFixed(1)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => { setSelectedStore(store); setViewOpen(true); void loadGroceryDetail(store.id); }}
                          className="text-emerald-600 hover:text-white hover:bg-emerald-500 p-2 rounded-lg transition-colors border border-transparent hover:border-emerald-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/admin/modules/vendor-performance?vendorId=${encodeURIComponent(store.userId || "")}&module=GROCERY&label=${encodeURIComponent(store.storeName)}`}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          Metrics
                        </Link>
                        <button
                          onClick={() => { setSelectedStore(store); setEditOpen(true); void loadGroceryDetail(store.id); }}
                          className="text-blue-600 hover:text-white hover:bg-blue-500 p-2 rounded-lg transition-colors border border-transparent hover:border-blue-600"
                        >
                          <Edit className="h-4 w-4" />
                        </button>

                        {store.status === "PENDING" && (
                          <div className="flex gap-1 border-l pl-2 ml-1 border-slate-200">
                             <button onClick={() => handleStatusChange(store.id, "APPROVED")} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded-md transition-colors" title="Approve">
                                <UserCheck className="h-4 w-4" />
                             </button>
                             <button onClick={() => handleStatusChange(store.id, "REJECTED")} className="text-rose-600 hover:bg-rose-50 p-1.5 rounded-md transition-colors" title="Reject">
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

        {/* Pagination Footer */}
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

      {/* View Modal */}
      {viewOpen && selectedStore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">View Store — <span className="text-emerald-600">{selectedStore.storeName}</span></h2>
              <button onClick={() => setViewOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors">
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {detailLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
              ) : groceryDetail?.store ? (
                <div className="space-y-6">
                  {/* Quick Metrics */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Delivered Revenue</p>
                      <p className="text-xl font-bold text-slate-900">{stats?.currencySymbol ?? "₦"}{(groceryDetail.summary?.deliveredRevenue ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">Inventory</p>
                      <p className="text-xl font-bold text-slate-900">{groceryDetail.store._count?.products || 0} Products</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <p className="text-xs text-slate-500 font-medium mb-1 uppercase tracking-wider">History</p>
                      <p className="text-xl font-bold text-slate-900">{groceryDetail.store._count?.groceryOrders || 0} Orders</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm">
                    <div className="space-y-4">
                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Registration Info</h3>
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                           <p className="flex justify-between"><span className="text-slate-500">Vendor ID:</span> <span className="font-mono text-xs">{groceryDetail.store.userId}</span></p>
                           <p className="flex justify-between"><span className="text-slate-500">Address:</span> <span className="text-right font-medium">{selectedStore.address}</span></p>
                           <p className="flex justify-between"><span className="text-slate-500">Joined:</span> <span>{new Date(selectedStore.createdAt).toLocaleDateString()}</span></p>
                        </div>
                      </div>

                      <div>
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center"><TrendingUp className="h-3 w-3 mr-1" /> Recent Orders</h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                          {(groceryDetail.summary?.recentOrders || []).length > 0 ? (
                            groceryDetail.summary.recentOrders.map((o: any) => (
                              <div key={o.id} className="flex justify-between items-center border border-slate-100 bg-slate-50 rounded-lg px-3 py-2">
                                <span className="font-mono text-xs text-slate-600">{o.orderNumber}</span>
                                <span className="px-2 py-0.5 rounded-full bg-slate-200 text-[10px] font-bold">{o.status}</span>
                                <span className="font-bold">{stats?.currencySymbol ?? "₦"}{o.total?.toLocaleString()}</span>
                              </div>
                            ))
                          ) : <p className="italic text-slate-400">No recent orders found</p>}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                       <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Store Profile</h3>
                       <div className="grid grid-cols-1 gap-3">
                          <div className="p-3 border border-slate-200 rounded-xl">
                            <p className="text-xs text-slate-500 mb-1">Store Types</p>
                            <div className="flex flex-wrap gap-1">
                              {selectedStore.storeType.map((type, i) => (
                                <span key={i} className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${getStoreTypeColor(type)}`}>{type}</span>
                              ))}
                            </div>
                          </div>
                          <div className="p-3 border border-slate-200 rounded-xl flex justify-between items-center">
                             <span className="text-slate-500">Delivery Fee:</span>
                             <span className="font-bold">{stats?.currencySymbol ?? "₦"}{selectedStore.deliveryFee}</span>
                          </div>
                          <div className="p-3 border border-slate-200 rounded-xl flex justify-between items-center">
                             <span className="text-slate-500">Min Order:</span>
                             <span className="font-bold">{stats?.currencySymbol ?? "₦"}{selectedStore.minOrderAmount}</span>
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end space-x-3 mt-8 pt-5 border-t border-slate-100">
                    <button onClick={() => handleStatusChange(selectedStore.id, "REJECTED")} className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 font-medium rounded-xl hover:bg-rose-50 transition-colors shadow-sm">Reject / Suspend</button>
                    <button onClick={() => handleStatusChange(selectedStore.id, "APPROVED")} className={`px-5 py-2.5 rounded-xl ${gradientBtnClass}`}>Approve Store</button>
                  </div>
                </div>
              ) : <div className="text-center py-12 text-rose-500 flex flex-col items-center"><AlertCircle className="h-8 w-8 mb-2" /> Failed to load.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && selectedStore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Edit Store Profile</h2>
              <button onClick={() => setEditOpen(false)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors"><XCircle className="h-6 w-6" /></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {detailLoading || !groceryDetail?.store ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Store Details</h3>
                    <div className="space-y-3">
                       <div>
                         <label className="text-sm font-medium text-slate-700">Store Name</label>
                         <input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" value={groceryEdit.storeName} onChange={(e) => setGroceryEdit((x) => ({ ...x, storeName: e.target.value }))} />
                       </div>
                       <div>
                         <label className="text-sm font-medium text-slate-700">Address</label>
                         <input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow" value={groceryEdit.address} onChange={(e) => setGroceryEdit((x) => ({ ...x, address: e.target.value }))} />
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div><label className="text-sm font-medium text-slate-700">Phone</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.phone} onChange={(e) => setGroceryEdit((x) => ({ ...x, phone: e.target.value }))} /></div>
                         <div><label className="text-sm font-medium text-slate-700">Email</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.email} onChange={(e) => setGroceryEdit((x) => ({ ...x, email: e.target.value }))} /></div>
                       </div>
                       <div className="grid grid-cols-2 gap-4">
                         <div><label className="text-sm font-medium text-slate-700">Delivery Fee</label><input type="number" className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.deliveryFee} onChange={(e) => setGroceryEdit((x) => ({ ...x, deliveryFee: Number(e.target.value) }))} /></div>
                         <div><label className="text-sm font-medium text-slate-700">Min Order</label><input type="number" className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.minOrderAmount} onChange={(e) => setGroceryEdit((x) => ({ ...x, minOrderAmount: Number(e.target.value) }))} /></div>
                       </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-300 text-emerald-600" checked={groceryEdit.isOpen} onChange={(e) => setGroceryEdit((x) => ({ ...x, isOpen: e.target.checked }))} /> Currently Open
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <input type="checkbox" className="rounded border-slate-300 text-emerald-600" checked={groceryEdit.isVerified} onChange={(e) => setGroceryEdit((x) => ({ ...x, isVerified: e.target.checked }))} /> Verified Badge
                    </label>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Owner Details</h3>
                    <div className="space-y-3">
                      <div><label className="text-sm font-medium text-slate-700">Full Name</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.ownerName} onChange={(e) => setGroceryEdit((x) => ({ ...x, ownerName: e.target.value }))} /></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><label className="text-sm font-medium text-slate-700">Phone</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.ownerPhone} onChange={(e) => setGroceryEdit((x) => ({ ...x, ownerPhone: e.target.value }))} /></div>
                        <div><label className="text-sm font-medium text-slate-700">Email</label><input className="w-full border border-slate-300 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-emerald-500 outline-none" value={groceryEdit.ownerEmail} onChange={(e) => setGroceryEdit((x) => ({ ...x, ownerEmail: e.target.value }))} /></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button onClick={() => setEditOpen(false)} className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 shadow-sm transition-colors">Cancel</button>
              <button onClick={() => void saveGroceryEdit()} className={`px-6 py-2.5 rounded-xl ${gradientBtnClass}`}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}