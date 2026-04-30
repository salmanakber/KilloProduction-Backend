"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Store,
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
  Car,
  Clock,
  Wrench,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface AutoPartsStoreData {
  id: string
  userId: string
  businessName: string
  ownerName: string
  email: string
  phone: string
  address: string
  businessType: string
  registrationNumber: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  isVerified: boolean
  registrationDate: string
  totalOrders: number
  totalRevenue: number
  rating: number
  specializations: string[]
  brandsCarried: string[]
  documents: {
    businessLicense: string
    storeFront: string
    inventory: string
  }
}

interface AutoPartsStats {
  totalStores: number
  pendingApprovals: number
  activeStores: number
  suspendedStores: number
  totalRevenue: number
  totalOrders: number
  averageRating: number
  currencySymbol?: string
}

export default function AutoPartsManagement() {
  const [stores, setStores] = useState<AutoPartsStoreData[]>([])
  const [stats, setStats] = useState<AutoPartsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStore, setSelectedStore] = useState<AutoPartsStoreData | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    storeName: "",
    address: "",
    phone: "",
    email: "",
    isVerified: false,
    storeActive: true,
    taxId: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchAutoPartsData()
  }, [currentPage, searchTerm, statusFilter])

  const loadAutoPartsDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/auto-parts/${id}`)
      const j = await r.json()
      setDetail(j.error ? null : j)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const openView = (s: AutoPartsStoreData) => {
    setSelectedStore(s)
    setShowViewModal(true)
    void loadAutoPartsDetail(s.id)
  }

  const openEdit = (s: AutoPartsStoreData) => {
    setSelectedStore(s)
    setShowEditModal(true)
    void loadAutoPartsDetail(s.id)
  }

  useEffect(() => {
    if (!showEditModal || !detail?.store) return
    const st = detail.store
    const u = st.user
    setEditForm({
      storeName: st.storeName || "",
      address: st.address || "",
      phone: st.phone || "",
      email: st.email || "",
      isVerified: !!st.isVerified,
      storeActive: !!st.isActive,
      taxId: st.taxId || "",
      ownerName: u?.name || "",
      ownerPhone: u?.phone || "",
      ownerEmail: u?.email || "",
    })
  }, [showEditModal, detail])

  const saveAutoPartsEdit = async () => {
    if (!selectedStore) return
    const r = await fetch(`/api/admin/modules/auto-parts/${selectedStore.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: editForm.storeName,
        address: editForm.address,
        phone: editForm.phone,
        email: editForm.email || null,
        isVerified: editForm.isVerified,
        isActive: editForm.storeActive,
        taxId: editForm.taxId || null,
        user: {
          name: editForm.ownerName,
          phone: editForm.ownerPhone,
          email: editForm.ownerEmail,
        },
      }),
    })
    if (r.ok) {
      await fetchAutoPartsData()
      setShowEditModal(false)
      setDetail(null)
    }
  }

  const fetchAutoPartsData = async () => {
    try {
      setLoading(true)
      const [storesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/modules/auto-parts/list?page=${currentPage}&search=${searchTerm}&status=${statusFilter}`),
        fetch("/api/admin/modules/auto-parts/stats"),
      ])

      const [storesData, statsData] = await Promise.all([storesResponse.json(), statsResponse.json()])

      setStores(storesData.stores || [])
      // Fallback to 1 if the API does not return totalPages yet
      setTotalPages(storesData.totalPages || 1) 
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch auto parts data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleKYCAction = async (storeId: string, action: "approve" | "reject", reason?: string) => {
    try {
      const response = await fetch(`/api/admin/modules/auto-parts/${storeId}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      })

      if (response.ok) {
        await fetchAutoPartsData()
        setShowViewModal(false)
        setSelectedStore(null)
        setDetail(null)
      }
    } catch (error) {
      console.error("Failed to update KYC status:", error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "bg-emerald-100 text-emerald-800 border-emerald-200"
      case "PENDING":
        return "bg-amber-100 text-amber-800 border-amber-200"
      case "REJECTED":
        return "bg-rose-100 text-rose-800 border-rose-200"
      case "SUSPENDED":
        return "bg-slate-100 text-slate-800 border-slate-200"
      default:
        return "bg-slate-100 text-slate-800 border-slate-200"
    }
  }

  const getBusinessTypeIcon = (type: string) => {
    switch (type) {
      case "RETAILER":
        return <Store className="h-5 w-5" />
      case "WHOLESALER":
        return <Package className="h-5 w-5" />
      case "SCRAP_YARD":
        return <Wrench className="h-5 w-5" />
      case "REPAIR_SHOP":
        return <Car className="h-5 w-5" />
      default:
        return <Store className="h-5 w-5" />
    }
  }

  // Common UI classes
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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Auto Parts Management</h1>
          <p className="text-slate-500 mt-1">Manage auto parts stores, KYC approvals, and performance metrics</p>
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
              <Store className="h-7 w-7 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Pending Approvals</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{stats?.pendingApprovals || 0}</p>
            </div>
            <div className="h-14 w-14 bg-gradient-to-br from-amber-100 to-amber-50 rounded-xl flex items-center justify-center shadow-inner">
              <Clock className="h-7 w-7 text-amber-600" />
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
            <div className="h-14 w-14 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-xl flex items-center justify-center shadow-inner">
              <DollarSign className="h-7 w-7 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Average Rating</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{(stats?.averageRating ?? 0).toFixed(1)}</p>
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
                placeholder="Search stores by name, owner, or registration..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1) // Reset to page 1 on search
                }}
                className="pl-11 pr-4 py-2.5 w-full border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setCurrentPage(1) // Reset to page 1 on filter
              }}
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
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Store Details
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Owner & Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {stores.length === 0 && !loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                    No stores found matching your criteria.
                  </td>
                </tr>
              ) : (
                stores.map((store) => (
                  <tr key={store.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-5">
                      <div>
                        <div className="flex items-center">
                          <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center mr-4 text-slate-600 shadow-sm">
                            {getBusinessTypeIcon(store.businessType)}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{store.businessName}</div>
                            <div className="text-xs text-slate-500 mt-0.5">Reg: <span className="font-mono">{store.registrationNumber}</span></div>
                          </div>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 line-clamp-1">{store.address}</div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {store.specializations.slice(0, 2).map((spec) => (
                            <span key={spec} className="px-2 py-0.5 text-[11px] font-medium bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md">
                              {spec}
                            </span>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{store.ownerName}</div>
                        <div className="text-sm text-slate-500 mt-1">{store.email}</div>
                        <div className="text-sm text-slate-500 mt-0.5">{store.phone}</div>
                      </div>
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
                        <div className="text-xs text-slate-400">
                          Joined: {new Date(store.registrationDate).toLocaleDateString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="text-sm space-y-1">
                        <div className="text-slate-900 font-medium">{store.totalOrders} orders</div>
                        <div className="text-slate-500">
                          {stats?.currencySymbol ?? "₦"}
                          {store?.totalRevenue?.toLocaleString()}
                        </div>
                        <div className="flex items-center text-amber-500">
                          <span className="text-xs font-medium bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">★ {store?.rating?.toFixed(1)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          title="View Details"
                          onClick={() => openView(store)}
                          className="text-emerald-600 hover:text-white hover:bg-emerald-500 p-2 rounded-lg transition-colors border border-transparent hover:border-emerald-600"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/admin/modules/vendor-performance?vendorId=${encodeURIComponent(store.userId || "")}&module=AUTO_PARTS&label=${encodeURIComponent(store.businessName)}`}
                          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                        >
                          Metrics
                        </Link>
                        <button
                          type="button"
                          title="Edit Store"
                          onClick={() => openEdit(store)}
                          className="text-blue-600 hover:text-white hover:bg-blue-500 p-2 rounded-lg transition-colors border border-transparent hover:border-blue-600"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button className="text-slate-400 hover:text-slate-600 p-2">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
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
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Prev
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
      </div>

      {/* View Modal */}
      {showViewModal && selectedStore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white z-10 px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">View Details — <span className="text-emerald-600">{selectedStore.businessName}</span></h2>
              <button
                type="button"
                onClick={() => {
                  setShowViewModal(false)
                  setDetail(null)
                }}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            
            <div className="p-6">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                </div>
              ) : detail?.store ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-sm">
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="flex justify-between items-center py-1">
                          <span className="text-slate-500 font-medium">Vendor User ID</span>
                          <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded">{detail.store.userId}</span>
                        </p>
                        <p className="flex justify-between items-center py-1 border-t border-slate-200 mt-2 pt-2">
                          <span className="text-slate-500 font-medium">Delivered Revenue</span> 
                          <span className="font-bold text-slate-800">
                            {stats?.currencySymbol ?? "₦"}{(detail.summary?.deliveredRevenue ?? 0).toLocaleString()}
                          </span>
                        </p>
                        <p className="flex justify-between items-center py-1 border-t border-slate-200 mt-2 pt-2">
                          <span className="text-slate-500 font-medium">Parts Listed</span> 
                          <span className="font-bold text-slate-800">{detail.store._count?.autoParts}</span>
                        </p>
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center">
                          <Package className="h-4 w-4 mr-2 text-slate-500"/> Recent Orders
                        </h3>
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-2">
                          {detail.summary?.recentOrders?.length ? detail.summary.recentOrders.map((o: any) => (
                            <div key={o.id} className="flex justify-between items-center border border-slate-100 bg-slate-50 rounded-lg px-3 py-2.5">
                              <span className="font-mono text-xs text-slate-600">{o.orderNumber}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${o.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'}`}>
                                {o.status}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {stats?.currencySymbol ?? "₦"}{o.total?.toLocaleString?.()}
                              </span>
                            </div>
                          )) : (
                            <p className="text-slate-500 italic py-2">No recent orders found.</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-base font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Business Documents</h3>
                      <div className="space-y-5">
                        {[
                          ["Business License", detail.store.businessLicense],
                          ["Store Front", detail.store.storeFront],
                          ["Inventory", detail.store.inventory],
                        ].map(([label, url]) => (
                          <div key={String(label)}>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</label>
                            <div className="mt-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50 group relative overflow-hidden">
                              {typeof url === "string" && url.trim() && (url.startsWith("http") || url.startsWith("/")) ? (
                                <img src={url} alt={String(label)} className="w-full h-32 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300" />
                              ) : (
                                <div className="h-32 flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg bg-white">
                                  <p className="text-sm text-slate-400 font-medium">Not uploaded</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedStore.status === "PENDING" && (
                    <div className="flex items-center justify-end space-x-3 mt-8 pt-5 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
                      <button
                        type="button"
                        onClick={() => handleKYCAction(selectedStore.id, "reject")}
                        className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 font-medium rounded-xl hover:bg-rose-50 transition-colors shadow-sm"
                      >
                        Reject Application
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKYCAction(selectedStore.id, "approve")}
                        className={`px-5 py-2.5 rounded-xl ${gradientBtnClass}`}
                      >
                        Approve Store
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <XCircle className="h-12 w-12 text-rose-400 mx-auto mb-3" />
                  <p className="text-rose-600 font-medium">Could not load details.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && selectedStore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Edit Store Profile</h2>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false)
                  setDetail(null)
                }}
                className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full p-1.5 transition-colors"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {detailLoading || !detail?.store ? (
                <div className="flex justify-center py-12">
                  {detailLoading ? (
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                  ) : (
                    <p className="text-rose-600 font-medium">Could not load record.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Store Details Section */}
                  <div>
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Store Details</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Store Name</label>
                        <input
                          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                          value={editForm.storeName}
                          onChange={(e) => setEditForm((f) => ({ ...f, storeName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">Address</label>
                        <input
                          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                          value={editForm.address}
                          onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-slate-700">Phone</label>
                          <input
                            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700">Tax ID</label>
                          <input
                            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                            value={editForm.taxId}
                            onChange={(e) => setEditForm((f) => ({ ...f, taxId: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-700">Email Address</label>
                        <input
                          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Status Flags */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap gap-6">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={editForm.isVerified}
                          onChange={(e) => setEditForm((f) => ({ ...f, isVerified: e.target.checked }))}
                        />
                        <div className="h-5 w-5 bg-white border-2 border-slate-300 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors"></div>
                        <CheckCircle className="absolute inset-0 h-5 w-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Verified</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={editForm.storeActive}
                          onChange={(e) => setEditForm((f) => ({ ...f, storeActive: e.target.checked }))}
                        />
                        <div className="h-5 w-5 bg-white border-2 border-slate-300 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors"></div>
                        <CheckCircle className="absolute inset-0 h-5 w-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">Store Active</span>
                    </label>
                  </div>

                  {/* Owner Section */}
                  <div className="pt-2">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Owner Details</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-sm font-medium text-slate-700">Full Name</label>
                        <input
                          className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                          value={editForm.ownerName}
                          onChange={(e) => setEditForm((f) => ({ ...f, ownerName: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-slate-700">Phone</label>
                          <input
                            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                            value={editForm.ownerPhone}
                            onChange={(e) => setEditForm((f) => ({ ...f, ownerPhone: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-700">Email</label>
                          <input
                            className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                            value={editForm.ownerEmail}
                            onChange={(e) => setEditForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false)
                  setDetail(null)
                }}
                className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveAutoPartsEdit()}
                disabled={detailLoading}
                className={`px-6 py-2.5 rounded-xl ${gradientBtnClass} ${detailLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}