"use client"

import { useState, useEffect } from "react"
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
  const [currentPage, setCurrentPage] = useState(1)

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
      const [storesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/modules/auto-parts/list?page=${currentPage}&search=${searchTerm}&status=${statusFilter}`),
        fetch("/api/admin/modules/auto-parts/stats"),
      ])

      const [storesData, statsData] = await Promise.all([storesResponse.json(), statsResponse.json()])

      setStores(storesData.stores)
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
        return "bg-green-100 text-green-800"
      case "PENDING":
        return "bg-yellow-100 text-yellow-800"
      case "REJECTED":
        return "bg-red-100 text-red-800"
      case "SUSPENDED":
        return "bg-gray-100 text-gray-800"
      default:
        return "bg-gray-100 text-gray-800"
    }
  }

  const getBusinessTypeIcon = (type: string) => {
    switch (type) {
      case "RETAILER":
        return <Store className="h-4 w-4" />
      case "WHOLESALER":
        return <Package className="h-4 w-4" />
      case "SCRAP_YARD":
        return <Wrench className="h-4 w-4" />
      case "REPAIR_SHOP":
        return <Car className="h-4 w-4" />
      default:
        return <Store className="h-4 w-4" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Auto Parts Management</h1>
          <p className="text-gray-600 mt-1">Manage auto parts stores, KYC approvals, and performance</p>
        </div>
        <div className="flex items-center space-x-3">
          <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Stores</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalStores}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Store className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Approvals</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.pendingApprovals}</p>
            </div>
            <div className="h-12 w-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="h-6 w-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900">
                {stats?.currencySymbol ?? "₦"}
                {(stats?.totalRevenue ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Average Rating</p>
              <p className="text-3xl font-bold text-gray-900">{(stats?.averageRating ?? 0).toFixed(1)}</p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search stores by name, owner, or registration..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500"
            >
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <button className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
              <Filter className="h-4 w-4 mr-2" />
              More Filters
            </button>
          </div>
        </div>
      </div>

      {/* Stores Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Store Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Owner & Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status & Verification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stores.map((store) => (
                <tr key={store.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="flex items-center">
                        <div className="h-8 w-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                          {getBusinessTypeIcon(store.businessType)}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">{store.businessName}</div>
                          <div className="text-sm text-gray-500">Reg: {store.registrationNumber}</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500 mt-1">{store.address}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {store.specializations.slice(0, 2).map((spec) => (
                          <span key={spec} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            {spec}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{store.ownerName}</div>
                      <div className="text-sm text-gray-500">{store.email}</div>
                      <div className="text-sm text-gray-500">{store.phone}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(store.status)}`}
                      >
                        {store.status}
                      </span>
                      <div className="flex items-center text-xs text-gray-500">
                        {store.isVerified ? (
                          <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500 mr-1" />
                        )}
                        {store.isVerified ? "Verified" : "Unverified"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Registered: {new Date(store.registrationDate).toLocaleDateString()}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <div className="text-gray-900">{store.totalOrders} orders</div>
                      <div className="text-gray-500">
                        {stats?.currencySymbol ?? "₦"}
                        {store?.totalRevenue?.toLocaleString()}
                      </div>
                      <div className="flex items-center mt-1">
                        <span className="text-xs text-gray-600">★ {store?.rating?.toFixed(1)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        title="View"
                        onClick={() => openView(store)}
                        className="text-green-600 hover:text-green-900 p-1 rounded"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => openEdit(store)}
                        className="text-blue-600 hover:text-blue-900 p-1 rounded"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button className="text-gray-400 hover:text-gray-600">
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showViewModal && selectedStore && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">View — {selectedStore.businessName}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowViewModal(false)
                  setDetail(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            {detailLoading ? (
              <p className="text-gray-600 py-8">Loading…</p>
            ) : detail?.store ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-sm">
                  <div>
                    <p>
                      <span className="text-gray-600">Vendor user ID:</span>{" "}
                      <span className="font-mono text-xs">{detail.store.userId}</span>
                    </p>
                    <p className="mt-2">
                      <span className="text-gray-600">Delivered revenue:</span> {stats?.currencySymbol ?? "₦"}
                      {(detail.summary?.deliveredRevenue ?? 0).toLocaleString()}
                    </p>
                    <p className="mt-2">
                      <span className="text-gray-600">Parts listed:</span> {detail.store._count?.autoParts}
                    </p>
                    <h3 className="font-semibold mt-4 mb-2">Recent orders</h3>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {(detail.summary?.recentOrders || []).map((o: any) => (
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
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Documents</h3>
                    {[
                      ["Business license", detail.store.businessLicense],
                      ["Store front", detail.store.storeFront],
                      ["Inventory", detail.store.inventory],
                    ].map(([label, url]) => (
                      <div key={String(label)} className="mb-4">
                        <label className="text-sm font-medium text-gray-600">{label}</label>
                        <div className="mt-1 border rounded-lg p-3">
                          {typeof url === "string" &&
                          url.trim() &&
                          (url.startsWith("http") || url.startsWith("/")) ? (
                            <img src={url} alt={String(label)} className="w-full h-28 object-cover rounded" />
                          ) : (
                            <p className="text-xs text-gray-500">{url || "Not uploaded"}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedStore.status === "PENDING" && (
                  <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => handleKYCAction(selectedStore.id, "reject")}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKYCAction(selectedStore.id, "approve")}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                    >
                      Approve
                    </button>
                  </div>
                )}
              </>
            ) : (
              <p className="text-red-600">Could not load details.</p>
            )}
          </div>
        </div>
      )}

      {showEditModal && selectedStore && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Edit auto parts store</h2>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false)
                  setDetail(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>
            {detailLoading || !detail?.store ? (
              <p className="text-gray-600 py-6">{detailLoading ? "Loading…" : "Could not load record."}</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">Store name</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.storeName}
                    onChange={(e) => setEditForm((f) => ({ ...f, storeName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Address</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.address}
                    onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-gray-600">Phone</label>
                    <input
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Tax ID</label>
                    <input
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editForm.taxId}
                      onChange={(e) => setEditForm((f) => ({ ...f, taxId: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Email</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.isVerified}
                      onChange={(e) => setEditForm((f) => ({ ...f, isVerified: e.target.checked }))}
                    />
                    Verified
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.storeActive}
                      onChange={(e) => setEditForm((f) => ({ ...f, storeActive: e.target.checked }))}
                    />
                    Store active
                  </label>
                </div>
                <h3 className="font-semibold pt-2">User</h3>
                <input
                  className="w-full border rounded px-3 py-2"
                  placeholder="Owner name"
                  value={editForm.ownerName}
                  onChange={(e) => setEditForm((f) => ({ ...f, ownerName: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full border rounded px-3 py-2"
                    placeholder="Owner phone"
                    value={editForm.ownerPhone}
                    onChange={(e) => setEditForm((f) => ({ ...f, ownerPhone: e.target.value }))}
                  />
                  <input
                    className="w-full border rounded px-3 py-2"
                    placeholder="Owner email"
                    value={editForm.ownerEmail}
                    onChange={(e) => setEditForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditModal(false)
                      setDetail(null)
                    }}
                    className="px-4 py-2 border rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveAutoPartsEdit()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
