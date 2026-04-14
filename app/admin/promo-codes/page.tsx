"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  Check,
  X,
  Calendar,
  DollarSign,
  Percent,
  Tag,
  Filter,
  Download,
  RefreshCw,
} from "lucide-react"
import { Currency } from "@prisma/client"

interface PromoCode {
  id: string
  code: string
  title: string
  description?: string | null
  type: "PERCENTAGE" | "FIXED"
  value: number
  minOrderAmount?: number | null
  maxDiscount?: number | null
  usageLimit?: number | null
  usedCount: number
  modules?: any
  isActive: boolean
  startsAt: string
  expiresAt: string
  createdAt: string
}

export default function PromoCodeManagement() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<Currency | null>(null)

  const [formData, setFormData] = useState({
    code: "",
    title: "",
    description: "",
    type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    value: 0,
    minOrderAmount: "",
    maxDiscount: "",
    usageLimit: "",
    modules: [] as string[],
    isActive: true,
    startsAt: "",
    expiresAt: "",
  })

  useEffect(() => {
    fetchPromoCodes()
  }, [filterActive])

  const fetchPromoCodes = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/promo-codes")
      if (response.ok) {
        const data = await response.json()
        setPromoCodes(data.promoCodes || [])
      }
    } catch (error) {
      console.error("Failed to fetch promo codes:", error)
    } finally {
      setLoading(false)
    }
  }
  const getCurrency = async () => {
    const response = await fetch("/api/currencies")
    if(response.ok) {
      const data = await response.json()
      setCurrency(data.defaultCurrency.symbol)
    }
  }
  useEffect(() => {
    getCurrency()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingCode
        ? `/api/admin/promo-codes/${editingCode.id}`
        : "/api/admin/promo-codes"
      const method = editingCode ? "PUT" : "POST"

      const payload = {
        ...formData,
        minOrderAmount: formData.minOrderAmount ? parseFloat(formData.minOrderAmount) : null,
        maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
      }

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setShowModal(false)
        resetForm()
        fetchPromoCodes()
      }
    } catch (error) {
      console.error("Failed to save promo code:", error)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this promo code?")) return

    try {
      const response = await fetch(`/api/admin/promo-codes/${id}`, {
        method: "DELETE",
      })

      if (response.ok) {
        fetchPromoCodes()
      }
    } catch (error) {
      console.error("Failed to delete promo code:", error)
    }
  }

  const handleEdit = (code: PromoCode) => {
    setEditingCode(code)
    setFormData({
      code: code.code,
      title: code.title,
      description: code.description || "",
      type: code.type,
      value: code.value,
      minOrderAmount: code.minOrderAmount?.toString() || "",
      maxDiscount: code.maxDiscount?.toString() || "",
      usageLimit: code.usageLimit?.toString() || "",
      modules: Array.isArray(code.modules) ? code.modules : [],
      isActive: code.isActive,
      startsAt: new Date(code.startsAt).toISOString().slice(0, 16),
      expiresAt: new Date(code.expiresAt).toISOString().slice(0, 16),
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({
      code: "",
      title: "",
      description: "",
      type: "PERCENTAGE",
      value: 0,
      minOrderAmount: "",
      maxDiscount: "",
      usageLimit: "",
      modules: [],
      isActive: true,
      startsAt: "",
      expiresAt: "",
    })
    setEditingCode(null)
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy: ", err);
    }
  };
  


  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/promo-codes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus }),
      })

      if (response.ok) {
        fetchPromoCodes()
      }
    } catch (error) {
      console.error("Failed to toggle promo code status:", error)
    }
  }

  const filteredCodes = promoCodes.filter((code) => {
    const matchesSearch =
      code.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      code.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterActive === null || code.isActive === filterActive
    return matchesSearch && matchesFilter
  })

  const stats = {
    total: promoCodes.length,
    active: promoCodes.filter((c) => c.isActive).length,
    expired: promoCodes.filter((c) => new Date(c.expiresAt) < new Date()).length,
    totalUsage: promoCodes.reduce((sum, c) => sum + c.usedCount, 0),
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
          <h1 className="text-3xl font-bold text-gray-900">Promo Code Management</h1>
          <p className="text-gray-600 mt-1">Create and manage promotional codes for discounts</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchPromoCodes}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
          <button
            onClick={() => {
              resetForm()
              setShowModal(true)
            }}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Promo Code
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Codes</p>
              <p className="text-3xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Tag className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active</p>
              <p className="text-3xl font-bold text-green-600">{stats.active}</p>
            </div>
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Check className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expired</p>
              <p className="text-3xl font-bold text-red-600">{stats.expired}</p>
            </div>
            <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
              <X className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Usage</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalUsage}</p>
            </div>
            <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search by code or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <button
            onClick={() => setFilterActive(null)}
            className={`px-4 py-2 rounded-lg ${
              filterActive === null ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterActive(true)}
            className={`px-4 py-2 rounded-lg ${
              filterActive === true ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setFilterActive(false)}
            className={`px-4 py-2 rounded-lg ${
              filterActive === false ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Promo Codes Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expires
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCodes.map((code) => {
                const isExpired = new Date(code.expiresAt) < new Date()
                return (
                  <tr key={code.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">{code.code}</span>
                        <button
                          onClick={() => copyToClipboard(code.code, code.id)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {copiedId === code.id ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">{code.title}</div>
                      {code.description && (
                        <div className="text-sm text-gray-500">{code.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          code.type === "PERCENTAGE"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-purple-100 text-purple-800"
                        }`}
                      >
                        {code.type === "PERCENTAGE" ? (
                          <Percent className="h-3 w-3 inline mr-1" />
                        ) : (
                          <DollarSign className="h-3 w-3 inline mr-1" />
                        )}
                        {code.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {code.type === "PERCENTAGE" ? `${code.value}%` : `${currency}${code.value}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {code.usedCount} / {code.usageLimit || "∞"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleActive(code.id, code.isActive)}
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          code.isActive && !isExpired
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {code.isActive && !isExpired ? "Active" : isExpired ? "Expired" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(code.expiresAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEdit(code)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(code.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredCodes.length === 0 && (
          <div className="text-center py-12">
            <Tag className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No promo codes</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating a new promotional code.
            </p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">
              {editingCode ? "Edit Promo Code" : "Create Promo Code"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="SUMMER2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as "PERCENTAGE" | "FIXED" })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed Amount</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Order Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Discount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit</label>
                <input
                  type="number"
                  value={formData.usageLimit}
                  onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  placeholder="Leave empty for unlimited"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Starts At *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.startsAt}
                    onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expires At *</label>
                  <input
                    type="datetime-local"
                    required
                    value={formData.expiresAt}
                    onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
                <label className="ml-2 text-sm text-gray-700">Active</label>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    resetForm()
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {editingCode ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

