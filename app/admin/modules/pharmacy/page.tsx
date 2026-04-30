"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"

interface PharmacyData {
  id: string
  userId?: string
  name: string
  ownerName: string
  email: string
  phone: string
  address: string
  licenseNumber: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  isVerified: boolean
  registrationDate: string
  totalOrders: number
  totalRevenue: number
  rating: number
  specializations: RenderableItem[]
  medicineOrigins: RenderableItem[]
  documents: {
    businessLicense: string
    pharmacyLicense: string
    ownerPhoto: string
  }
}

interface PharmacyStats {
  totalPharmacies: number
  pendingApprovals: number
  activePharmacies: number
  suspendedPharmacies: number
  totalRevenue: number
  totalOrders: number
  averageRating: number
  currencySymbol?: string
}

type RenderableItem = string | Record<string, unknown>

export default function PharmacyManagement() {
  const [pharmacies, setPharmacies] = useState<PharmacyData[]>([])
  const [stats, setStats] = useState<PharmacyStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPharmacy, setSelectedPharmacy] = useState<PharmacyData | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    pharmacyName: "",
    licenseNumber: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    status: "PENDING",
    deliveryAvailable: true,
    is24Hours: false,
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [medicineOrigins, setMedicineOrigins] = useState<{ id: string; displayName?: string | null; name?: string | null }[]>(
    [],
  )
  const [selectedSpecOriginIds, setSelectedSpecOriginIds] = useState<string[]>([])
  const [specIllnessInput, setSpecIllnessInput] = useState("")
  const [supplierEligibility, setSupplierEligibility] = useState<{
    summary?: { totalSampled: number; totalMatched: number; totalRestricted: number }
    suppliers?: Array<{
      wholesalerId: string
      companyName: string
      sampled: number
      matched: number
      restricted: number
      examples: { productName: string; restrictionReason: string }[]
    }>
  } | null>(null)
  const [supplierEligibilityLoading, setSupplierEligibilityLoading] = useState(false)

  useEffect(() => {
    fetchPharmacyData()
  }, [currentPage, searchTerm, statusFilter])

  useEffect(() => {
    if (!showEditModal) return
    void (async () => {
      try {
        const r = await fetch("/api/admin/medicine-origins?page=1&limit=500&status=true")
        const j = await r.json()
        setMedicineOrigins(j.medicineOrigins || j.data || [])
      } catch {
        setMedicineOrigins([])
      }
    })()
  }, [showEditModal])

  useEffect(() => {
    if (!showEditModal || !detail?.pharmacy?.specializations) return
    const ids = (detail.pharmacy.specializations as { medicineOriginId: string }[]).map((s) => s.medicineOriginId)
    setSelectedSpecOriginIds(Array.from(new Set(ids)))
    const firstIll = (detail.pharmacy.specializations as { illnessTypes?: unknown }[]).find(
      (s) => Array.isArray(s.illnessTypes) && s.illnessTypes.length,
    )
    const ill = firstIll?.illnessTypes
    setSpecIllnessInput(Array.isArray(ill) ? ill.map(String).join(", ") : "")
  }, [showEditModal, detail])

  const loadPharmacyDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/pharmacy/${id}`)
      const j = await r.json()
      setDetail(j.error ? null : j)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const loadSupplierEligibility = async (pharmacyId: string) => {
    setSupplierEligibilityLoading(true)
    setSupplierEligibility(null)
    try {
      const r = await fetch(`/api/admin/modules/pharmacy/${pharmacyId}/supplier-eligibility`)
      const j = await r.json()
      setSupplierEligibility(j.error ? null : j)
    } catch {
      setSupplierEligibility(null)
    } finally {
      setSupplierEligibilityLoading(false)
    }
  }

  const openView = (p: PharmacyData) => {
    setSelectedPharmacy(p)
    setShowViewModal(true)
    setSupplierEligibility(null)
    void loadPharmacyDetail(p.id)
    void loadSupplierEligibility(p.id)
  }

  const openEdit = (p: PharmacyData) => {
    setSelectedPharmacy(p)
    setShowEditModal(true)
    void loadPharmacyDetail(p.id)
  }

  useEffect(() => {
    if (!showEditModal || !detail?.pharmacy) return
    const ph = detail.pharmacy
    const u = ph.user
    setEditForm({
      pharmacyName: ph.pharmacyName || "",
      licenseNumber: ph.licenseNumber || "",
      address: ph.address || "",
      phone: ph.phone || "",
      email: ph.email || "",
      website: ph.website || "",
      status: ph.status || "PENDING",
      deliveryAvailable: !!ph.deliveryAvailable,
      is24Hours: !!ph.is24Hours,
      ownerName: u?.name || "",
      ownerPhone: u?.phone || "",
      ownerEmail: u?.email || "",
    })
  }, [showEditModal, detail])

  const savePharmacyEdit = async () => {
    if (!selectedPharmacy) return
    const illnessTypes = specIllnessInput
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const specializations = selectedSpecOriginIds.map((medicineOriginId) => ({
      medicineOriginId,
      illnessTypes,
    }))
    try {
      const r = await fetch(`/api/admin/modules/pharmacy/${selectedPharmacy.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pharmacyName: editForm.pharmacyName,
          licenseNumber: editForm.licenseNumber,
          address: editForm.address,
          phone: editForm.phone,
          email: editForm.email || null,
          website: editForm.website || null,
          status: editForm.status,
          deliveryAvailable: editForm.deliveryAvailable,
          is24Hours: editForm.is24Hours,
          user: {
            name: editForm.ownerName,
            phone: editForm.ownerPhone,
            email: editForm.ownerEmail,
          },
          specializations,
        }),
      })
      if (r.ok) {
        await fetchPharmacyData()
        setShowEditModal(false)
        setDetail(null)
      }
    } catch (e) {
      console.error(e)
    }
  }

  const fetchPharmacyData = async () => {
    try {
      const [pharmaciesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/modules/pharmacy/list?page=${currentPage}&search=${searchTerm}&status=${statusFilter}`),
        fetch("/api/admin/modules/pharmacy/stats"),
      ])

      const [pharmaciesData, statsData] = await Promise.all([pharmaciesResponse.json(), statsResponse.json()])
  

      setPharmacies(pharmaciesData.pharmacies || [])
      
      setStats(statsData)
    } catch (error) {
      console.error("Failed to fetch pharmacy data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleKYCAction = async (pharmacyId: string, action: "approve" | "reject", reason?: string) => {
    try {
      const response = await fetch(`/api/admin/modules/pharmacy/${pharmacyId}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      })
      
      if (response.ok) {
        await fetchPharmacyData()
        setShowViewModal(false)
        setShowEditModal(false)
        setSelectedPharmacy(null)
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

  const getItemLabel = (item: RenderableItem) => {
    if (typeof item === "string") return item

    const knownLabelFields = ["name", "label", "title", "origin", "type", "illnessTypes"] as const
    for (const field of knownLabelFields) {
      const value = item[field]
      if (typeof value === "string" && value.trim()) return value
    }

    return item.id && typeof item.id === "string" ? item.id : "N/A"
  }

  const getItemKey = (item: RenderableItem, index: number) => {
    if (typeof item === "string") return `${item}-${index}`

    const id = item.id
    if (typeof id === "string" || typeof id === "number") return String(id)

    return `item-${index}`
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
          <h1 className="text-3xl font-bold text-gray-900">Pharmacy Management</h1>
          <p className="text-gray-600 mt-1">Manage pharmacy registrations, KYC approvals, and performance</p>
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
              <p className="text-sm font-medium text-gray-600">Total Pharmacies</p>
              <p className="text-3xl font-bold text-gray-900">{stats?.totalPharmacies}</p>
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
                {stats?.totalRevenue?.toLocaleString()}
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
              <p className="text-3xl font-bold text-gray-900">{stats?.averageRating?.toFixed(1)}</p>
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
                placeholder="Search pharmacies by name, owner, or license..."
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

      {/* Pharmacies Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pharmacy Details
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
              {pharmacies?.map((pharmacy) => (
                
                <tr key={pharmacy.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{pharmacy.name}</div>
                      <div className="text-sm text-gray-500">License: {pharmacy.licenseNumber}</div>
                      <div className="text-sm text-gray-500">{pharmacy.address}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {pharmacy.specializations?.slice(0, 2).map((spec, index) => (
                          <span key={getItemKey(spec, index)} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                            {getItemLabel(spec)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{pharmacy?.ownerName}</div>
                      <div className="text-sm text-gray-500">{pharmacy?.email}</div>
                      <div className="text-sm text-gray-500">{pharmacy?.phone}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(pharmacy?.status)}`}
                      >
                        {pharmacy?.status}
                      </span>
                      <div className="flex items-center text-xs text-gray-500">
                        {pharmacy?.isVerified ? (
                          <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500 mr-1" />
                        )}
                        {pharmacy?.isVerified ? "Verified" : "Unverified"}
                      </div>
                      <div className="text-xs text-gray-500">
                        Registered: {new Date(pharmacy?.registrationDate).toLocaleDateString()}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <div className="text-gray-900">{pharmacy?.totalOrders} orders</div>
                      <div className="text-gray-500">
                        {stats?.currencySymbol ?? "₦"}
                        {pharmacy?.totalRevenue?.toLocaleString()}
                      </div>
                      <div className="flex items-center mt-1">
                        <span className="text-xs text-gray-600">★ {pharmacy?.rating?.toFixed(1)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        title="View details"
                        onClick={() => openView(pharmacy)}
                        className="text-green-600 hover:text-green-900 p-1 rounded"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <Link
                        href={`/admin/modules/vendor-performance?vendorId=${encodeURIComponent(pharmacy.userId || "")}&module=PHARMACY&label=${encodeURIComponent(pharmacy.name)}`}
                        className="text-xs px-2 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      >
                        Performance
                      </Link>
                      <button
                        type="button"
                        title="Edit vendor"
                        onClick={() => openEdit(pharmacy)}
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

      {/* View modal (read-only + KYC) */}
      {showViewModal && selectedPharmacy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">View pharmacy — {selectedPharmacy.name}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowViewModal(false)
                  setDetail(null)
                  setSupplierEligibility(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            {detailLoading ? (
              <p className="text-gray-600 py-8 text-center">Loading…</p>
            ) : detail?.pharmacy ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Overview</h3>
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="text-gray-600">Vendor user ID:</span>{" "}
                        <span className="font-mono text-xs">{detail.pharmacy.userId}</span>
                      </p>
                      <p>
                        <span className="text-gray-600">Status:</span> {detail.pharmacy.status}
                      </p>
                      <p>
                        <span className="text-gray-600">Delivered revenue:</span> {stats?.currencySymbol ?? "₦"}
                        {(detail.summary?.deliveredRevenue ?? 0).toLocaleString()}
                      </p>
                      <p>
                        <span className="text-gray-600">Counts:</span>{" "}
                        {detail.pharmacy._count
                          ? `${detail.pharmacy._count.medicines} medicines · ${detail.pharmacy._count.supplierOrders} supplier orders · ${detail.pharmacy._count.pharmacyOrders} customer orders`
                          : "—"}
                      </p>
                    </div>
                    <h4 className="font-semibold mt-4 mb-2">Specializations</h4>
                    <div className="flex flex-wrap gap-1">
                      {(detail.pharmacy.specializations || []).map((s: any) => (
                        <span key={s.id} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                          {s.medicineOrigin?.displayName || s.medicineOrigin?.name || s.medicineOriginId}
                        </span>
                      ))}
                    </div>

                    <h4 className="font-semibold mt-4 mb-2">Wholesaler catalog vs. pharmacy rules</h4>
                    {supplierEligibilityLoading ? (
                      <p className="text-sm text-gray-500">Checking supplier samples…</p>
                    ) : supplierEligibility?.summary ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                        <p>
                          Sampled <strong>{supplierEligibility.summary.totalSampled}</strong> active wholesaler products
                          across verified suppliers: <strong>{supplierEligibility.summary.totalMatched}</strong> align with
                          this pharmacy&apos;s origin / illness rules,{" "}
                          <strong>{supplierEligibility.summary.totalRestricted}</strong> would be blocked for the vendor
                          app (same rules as the supplier catalog).
                        </p>
                        {(supplierEligibility.suppliers || []).some((s) => s.restricted > 0) && (
                          <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
                            {(supplierEligibility.suppliers || [])
                              .filter((s) => s.restricted > 0)
                              .slice(0, 6)
                              .map((s) => (
                                <li key={s.wholesalerId}>
                                  <span className="font-medium">{s.companyName}</span>: {s.restricted} restricted /{" "}
                                  {s.sampled} sampled
                                  {s.examples?.[0] ? (
                                    <span className="text-amber-800">
                                      {" "}
                                      — e.g. &quot;{s.examples[0].productName}&quot;: {s.examples[0].restrictionReason}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No preview available.</p>
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Recent orders</h3>
                    <div className="max-h-48 overflow-y-auto space-y-2 text-sm">
                      {(detail.summary?.recentOrders || []).length === 0 ? (
                        <p className="text-gray-500">No orders yet.</p>
                      ) : (
                        detail.summary.recentOrders.map((o: any) => (
                          <div key={o.id} className="border rounded p-2 flex justify-between">
                            <span>{o.orderNumber}</span>
                            <span className="text-gray-600">{o.status}</span>
                            <span>
                              {stats?.currencySymbol ?? "₦"}
                              {o.total?.toLocaleString?.() ?? o.total}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-semibold mt-6 mb-4">Documents</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    ["License / document", detail.pharmacy.licenseDocument],
                    ["Storefront", detail.pharmacy.storeFrontImage],
                    ["Owner photo", detail.pharmacy.ownerPhoto],
                  ].map(([label, url]) => (
                    <div key={String(label)} className="border rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-600 mb-2">{label}</p>
                      {typeof url === "string" &&
                      url.trim() &&
                      (url.startsWith("http") || url.startsWith("/")) ? (
                        <img src={url} alt={String(label)} className="w-full h-28 object-cover rounded" />
                      ) : (
                        <p className="text-xs text-gray-500 break-all">{url || "Not uploaded"}</p>
                      )}
                    </div>
                  ))}
                </div>

                {selectedPharmacy.status === "PENDING" && (
                  <div className="flex items-center justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                    <button
                      type="button"
                      onClick={() => handleKYCAction(selectedPharmacy.id, "reject")}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKYCAction(selectedPharmacy.id, "approve")}
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

      {/* Edit modal */}
      {showEditModal && selectedPharmacy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Edit pharmacy</h2>
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
            {detailLoading || !detail?.pharmacy ? (
              <p className="text-gray-600 py-6">{detailLoading ? "Loading…" : "Could not load record."}</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-600">Pharmacy name</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.pharmacyName}
                    onChange={(e) => setEditForm((f) => ({ ...f, pharmacyName: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">License number</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.licenseNumber}
                    onChange={(e) => setEditForm((f) => ({ ...f, licenseNumber: e.target.value }))}
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
                    <label className="text-sm text-gray-600">Pharmacy phone</label>
                    <input
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editForm.phone}
                      onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Status</label>
                    <select
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editForm.status}
                      onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                    </select>
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
                <div>
                  <label className="text-sm text-gray-600">Website</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.website}
                    onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                  />
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.deliveryAvailable}
                      onChange={(e) => setEditForm((f) => ({ ...f, deliveryAvailable: e.target.checked }))}
                    />
                    Delivery available
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editForm.is24Hours}
                      onChange={(e) => setEditForm((f) => ({ ...f, is24Hours: e.target.checked }))}
                    />
                    24 hours
                  </label>
                </div>

                <h3 className="font-semibold pt-2 border-t mt-4 pt-4">Medicine origins (specializations)</h3>
                <p className="text-xs text-gray-500">
                  Selected origins define which wholesaler products match this pharmacy in the vendor app. Illness tags
                  apply to all selected origins below.
                </p>
                <textarea
                  className="w-full border rounded px-3 py-2 mt-2 text-sm"
                  rows={2}
                  placeholder="Illness / specialization tags (comma or newline separated)"
                  value={specIllnessInput}
                  onChange={(e) => setSpecIllnessInput(e.target.value)}
                />
                <div className="mt-2 max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                  {medicineOrigins.length === 0 ? (
                    <p className="text-xs text-gray-500">Loading origins…</p>
                  ) : (
                    medicineOrigins.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSpecOriginIds.includes(o.id)}
                          onChange={() => {
                            setSelectedSpecOriginIds((prev) =>
                              prev.includes(o.id) ? prev.filter((x) => x !== o.id) : [...prev, o.id],
                            )
                          }}
                        />
                        <span>{o.displayName || o.name || o.id}</span>
                      </label>
                    ))
                  )}
                </div>

                <h3 className="font-semibold pt-2">Account (user)</h3>
                <div>
                  <label className="text-sm text-gray-600">Owner name</label>
                  <input
                    className="w-full border rounded px-3 py-2 mt-1"
                    value={editForm.ownerName}
                    onChange={(e) => setEditForm((f) => ({ ...f, ownerName: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-sm text-gray-600">Owner phone</label>
                    <input
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editForm.ownerPhone}
                      onChange={(e) => setEditForm((f) => ({ ...f, ownerPhone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600">Owner email</label>
                    <input
                      className="w-full border rounded px-3 py-2 mt-1"
                      value={editForm.ownerEmail}
                      onChange={(e) => setEditForm((f) => ({ ...f, ownerEmail: e.target.value }))}
                    />
                  </div>
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
                    onClick={() => void savePharmacyEdit()}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Save changes
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
