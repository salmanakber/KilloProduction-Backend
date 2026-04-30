"use client"

import { useState, useEffect } from "react"
import { 
  Car, 
  Plus, 
  Edit, 
  Save, 
  X, 
  Trash2, 
  RefreshCw, 
  CheckCircle,
  XCircle,
  Users,
  Info,
  Banknote,
  Settings,
  Fuel,
  Gauge,
  Package,
  ArrowRight,
  Upload
} from "lucide-react"
import { systemSettings } from "@/lib/systemSettings"

interface WeightRange {
  minKg: number
  maxKg: number
  price: number
}

interface RideType {
  id: string
  name: string
  description?: string
  icon: string
  mediaType?: "ICON" | "IMAGE"
  imageUrl?: string
  basePrice: number
  pricePerKm: number
  pricePerMinute: number
  pricePerKg?: number
  weightRanges?: WeightRange[]
  capacity: string
  features: string[]
  vehicleType: string
  category: string
  isActive: boolean
  createdAt: string
}

// Vehicle type options
const VEHICLE_TYPE_OPTIONS = [
  { value: 'BICYCLE', label: 'Bicycle' },
  { value: 'MOTORCYCLE', label: 'Motorcycle' },
  { value: 'SCOOTER', label: 'Scooter' },
  { value: 'CAR', label: 'Car' },
  { value: 'VAN', label: 'Van' },
  { value: 'TRUCK', label: 'Truck' }
]

// Category options
const CATEGORY_OPTIONS = [
  { value: 'RIDE', label: 'Ride' },
  { value: 'COURIER', label: 'Courier' }
]

export default function RideTypeManagement() {
  const [rideTypes, setRideTypes] = useState<RideType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [currency, setCurrency] = useState('₦')
 
const getCurrency = async () => {
  const currency = await fetch('/api/currencies').then(res => res.json()).then(data => data.defaultCurrency).catch(err => {
    console.error('Error fetching default currency:', err)
    return null
  })
  setCurrency(currency?.symbol || 'NGN')
}
useEffect(() => {
  void getCurrency()
}, [])

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  const [formData, setFormData] = useState<Partial<RideType>>({
    name: "",
    description: "",
    icon: "🚗",
    mediaType: "ICON",
    imageUrl: "",
    basePrice: 0,
    pricePerKm: 0,
    pricePerMinute: 0,
    pricePerKg: 0,
    weightRanges: [],
    capacity: "1-4 passengers",
    features: [],
    vehicleType: "",
    category: "RIDE",
    isActive: true
  })
  
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [imageUploading, setImageUploading] = useState(false)

  useEffect(() => {
    fetchRideTypes()
  }, [])

  const fetchRideTypes = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/ride-types')
      if (response.ok) {
        const data = await response.json()
        setRideTypes(data.rideTypes)
      } else {
        showMessage('error', 'Failed to fetch ride types')
      }
    } catch (error) {
      showMessage('error', 'Error fetching ride types')
    } finally {
      setLoading(false)
    }
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleOpenCreate = () => {
    setEditingId(null)
    setFormData({
      name: "",
      description: "",
      icon: "🚗",
      mediaType: "ICON",
      imageUrl: "",
      basePrice: 0,
      pricePerKm: 0,
      pricePerMinute: 0,
      pricePerKg: 0,
      weightRanges: [],
      capacity: "1-4 passengers",
      features: [],
      vehicleType: "",
      category: "RIDE",
      isActive: true
    })
    setIsFormOpen(true)
  }

  const addWeightRange = () => {
    setFormData(prev => ({
      ...prev,
      weightRanges: [...(prev.weightRanges || []), { minKg: 0, maxKg: 0, price: 0 }]
    }))
  }

  const updateWeightRange = (index: number, field: keyof WeightRange, value: number) => {
    setFormData(prev => {
      const ranges = [...(prev.weightRanges || [])]
      ranges[index] = { ...ranges[index], [field]: value }
      return { ...prev, weightRanges: ranges }
    })
  }

  const removeWeightRange = (index: number) => {
    setFormData(prev => ({
      ...prev,
      weightRanges: prev.weightRanges?.filter((_, i) => i !== index) || []
    }))
  }

  const handleEdit = (rideType: RideType) => {
    setEditingId(rideType.id)
    setFormData({ ...rideType })
    setIsFormOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSubmit = async () => {
    try {
      setSaving(true)
      const url = '/api/admin/ride-types'
      const method = editingId ? 'PUT' : 'POST'
      const body = editingId ? { id: editingId, ...formData } : formData

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        showMessage('success', `Ride type ${editingId ? 'updated' : 'created'} successfully`)
        setIsFormOpen(false)
        await fetchRideTypes()
      } else {
        const errorData = await response.json()
        showMessage('error', errorData.error || 'Operation failed')
      }
    } catch (error) {
      showMessage('error', `Error ${editingId ? 'updating' : 'creating'} ride type`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this ride type?')) return

    try {
      setDeleting(true)
      const response = await fetch(`/api/admin/ride-types?id=${id}`, { method: 'DELETE' })

      if (response.ok) {
        showMessage('success', 'Ride type deleted successfully')
        await fetchRideTypes()
      } else {
        const errorData = await response.json()
        showMessage('error', errorData.error || 'Failed to delete')
      }
    } catch (error) {
      showMessage('error', 'Error deleting ride type')
    } finally {
      setDeleting(false)
    }
  }

  // Helper for array manipulation in form
  const updateFeature = (action: 'add' | 'remove', value: string, index?: number) => {
    if (action === 'add') {
      setFormData(prev => ({ ...prev, features: [...(prev.features || []), value] }))
    } else if (typeof index === 'number') {
      setFormData(prev => ({ ...prev, features: prev.features?.filter((_, i) => i !== index) || [] }))
    }
  }

  const uploadRideTypeImageFile = async (file: File | undefined) => {
    if (!file) return
    try {
      setImageUploading(true)
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/ride-types/upload-image", { method: "POST", body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || "Image upload failed")
      if (json.url) {
        setFormData((prev) => ({ ...prev, mediaType: "IMAGE", imageUrl: String(json.url) }))
        showMessage("success", "Ride type image uploaded successfully")
      }
    } catch (error: any) {
      showMessage("error", error?.message || "Failed to upload ride type image")
    } finally {
      setImageUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#2E8B57]"></div>
        <p className="mt-4 text-gray-500 font-medium">Loading ride configuration...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Fleet Management</h1>
            <p className="text-gray-500 mt-1">Manage vehicle types, pricing structures, and service categories.</p>
          </div>
          <div className="flex items-center gap-3">
             <button 
              onClick={fetchRideTypes}
              className="p-2.5 bg-white text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              title="Refresh Data"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <button 
              onClick={handleOpenCreate}
              className="flex items-center px-5 py-2.5 bg-[#2E8B57] text-white rounded-xl hover:bg-[#257a4a] shadow-lg shadow-green-900/10 transition-all transform hover:-translate-y-0.5 font-medium"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Vehicle Type
            </button>
          </div>
        </div>

        {/* Alerts */}
        {message && (
          <div className={`mb-8 p-4 rounded-xl flex items-center shadow-sm animate-in fade-in slide-in-from-top-2 ${
            message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-100' : 'bg-red-50 text-red-800 border border-red-100'
          }`}>
            {message.type === 'success' ? <CheckCircle className="h-5 w-5 mr-3" /> : <XCircle className="h-5 w-5 mr-3" />}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {/* Editor Form (Conditionally Rendered) */}
        {isFormOpen && (
          <div className="mb-10 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="bg-[#2E8B57] px-8 py-6 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {editingId ? <Edit className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                  {editingId ? 'Edit Configuration' : 'New Configuration'}
                </h2>
                <p className="text-green-100 text-sm mt-1 opacity-90">
                  {editingId ? `Updating ${formData.name}` : 'Define a new service type for your platform'}
                </p>
              </div>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Left Column: Core Info */}
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                  <Info className="h-4 w-4 text-[#2E8B57]" /> Identity
                </h3>
                
                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Service Name</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-green-500/10 outline-none transition-all"
                      placeholder="e.g. Economy"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Icon</label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-green-500/10 outline-none transition-all text-center text-xl"
                      placeholder="🚗"
                      disabled={formData.mediaType === "IMAGE"}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "ICON", label: "Icon" },
                      { value: "IMAGE", label: "Image" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, mediaType: opt.value as "ICON" | "IMAGE" })}
                        className={`py-2 px-4 text-sm font-medium rounded-lg border transition-all ${
                          formData.mediaType === opt.value
                            ? "bg-[#2E8B57] text-white border-[#2E8B57]"
                            : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.mediaType === "IMAGE" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Image URL</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={formData.imageUrl || ""}
                        onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                        className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-green-500/10 outline-none transition-all"
                        placeholder="https://example.com/ride-type-image.png"
                      />
                      <label className={`inline-flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${imageUploading ? "bg-gray-100 text-gray-500 border-gray-200" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"}`}>
                        <Upload className="h-4 w-4" />
                        {imageUploading ? "Uploading..." : "Upload"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={imageUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            void uploadRideTypeImageFile(file)
                            e.currentTarget.value = ""
                          }}
                        />
                      </label>
                    </div>
                  </div>
                )}

                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1.5">Category</label>
                   <div className="grid grid-cols-2 gap-3">
                     {CATEGORY_OPTIONS.map(opt => (
                       <button
                        key={opt.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: opt.value })}
                        className={`py-2 px-4 text-sm font-medium rounded-lg border transition-all ${
                          formData.category === opt.value 
                            ? 'bg-[#2E8B57] text-white border-[#2E8B57]' 
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                       >
                         {opt.label}
                       </button>
                     ))}
                   </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-green-500/10 outline-none transition-all resize-none"
                    placeholder="Describe this service tier..."
                  />
                </div>
              </div>

              {/* Middle Column: Pricing */}
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                  <Banknote className="h-4 w-4 text-[#2E8B57]" /> Economics
                </h3>

                <div className="bg-gray-50 p-5 rounded-xl border border-gray-100 space-y-4">
                  <div>
                    <label className="flex justify-between text-sm font-medium text-gray-700 mb-1.5">
                      <span>Base Fare</span>
                      <span className="text-gray-400 font-normal">Starting price</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400">{currency}</span>
                      <input
                        type="number"
                        value={formData.basePrice}
                        onChange={(e) => setFormData({ ...formData, basePrice: parseFloat(e.target.value) || 0 })}
                        className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-2 focus:ring-green-500/10 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Per KM</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">{currency}</span>
                        <input
                          type="number"
                          value={formData.pricePerKm}
                          onChange={(e) => setFormData({ ...formData, pricePerKm: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-2 focus:ring-green-500/10 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Per Min</label>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-400">{currency}</span>
                        <input
                          type="number"
                          value={formData.pricePerMinute}
                          onChange={(e) => setFormData({ ...formData, pricePerMinute: parseFloat(e.target.value) || 0 })}
                          className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-2 focus:ring-green-500/10 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {formData.category === 'COURIER' && (
                    <div className="pt-2 border-t border-gray-200 mt-2 animate-in fade-in">
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-700">Weight Range Pricing</label>
                        <button
                          type="button"
                          onClick={addWeightRange}
                          className="text-xs px-2.5 py-1 bg-[#2E8B57] text-white rounded-lg hover:bg-[#257a4a] transition-colors flex items-center gap-1"
                        >
                          <Plus className="h-3 w-3" />
                          Add Range
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {formData.weightRanges && formData.weightRanges.length > 0 ? (
                          formData.weightRanges.map((range, index) => (
                            <div key={index} className="flex items-center gap-2 p-2.5 bg-blue-50/50 rounded-lg border border-blue-100">
                              <div className="flex-1 grid grid-cols-3 gap-2">
                                <div>
                                  <label className="text-xs text-gray-500 mb-0.5 block">Min (kg)</label>
                                  <input
                                    type="number"
                                    value={range.minKg}
                                    onChange={(e) => updateWeightRange(index, 'minKg', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200 focus:border-[#2E8B57] focus:ring-1 focus:ring-green-500/10 outline-none"
                                    step="0.1"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-0.5 block">Max (kg)</label>
                                  <input
                                    type="number"
                                    value={range.maxKg}
                                    onChange={(e) => updateWeightRange(index, 'maxKg', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200 focus:border-[#2E8B57] focus:ring-1 focus:ring-green-500/10 outline-none"
                                    step="0.1"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 mb-0.5 block">Price ({currency})</label>
                                  <input
                                    type="number"
                                    value={range.price}
                                    onChange={(e) => updateWeightRange(index, 'price', parseFloat(e.target.value) || 0)}
                                    className="w-full px-2 py-1.5 text-sm rounded border border-gray-200 focus:border-[#2E8B57] focus:ring-1 focus:ring-green-500/10 outline-none"
                                    step="0.01"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeWeightRange(index)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                title="Remove range"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-4 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
                            No weight ranges added. Click "Add Range" to create pricing tiers.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Configuration */}
              <div className="space-y-6">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                  <Settings className="h-4 w-4 text-[#2E8B57]" /> Specs
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Vehicle Type</label>
                    <select
                      value={formData.vehicleType}
                      onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-green-500/10 outline-none bg-white"
                    >
                      <option value="">Select Type</option>
                      {VEHICLE_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Capacity</label>
                    <input
                      type="text"
                      value={formData.capacity}
                      onChange={(e) => setFormData({ ...formData, capacity: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-200 focus:border-[#2E8B57] focus:ring-4 focus:ring-green-500/10 outline-none"
                      placeholder="e.g. 4 Seats"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Features</label>
                    <div className="flex gap-2 mb-2">
                       <input
                        type="text"
                        placeholder="Add feature..."
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-[#2E8B57] outline-none text-sm"
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            const target = e.target as HTMLInputElement
                            if (target.value.trim()) {
                              updateFeature('add', target.value.trim())
                              target.value = ''
                            }
                          }
                        }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.features?.map((feature, idx) => (
                        <span key={idx} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-50 text-[#2E8B57] border border-green-100">
                          {feature}
                          <button onClick={() => updateFeature('remove', '', idx)} className="ml-1.5 hover:text-green-800"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${formData.isActive ? 'bg-[#2E8B57] border-[#2E8B57]' : 'bg-white border-gray-300'}`}>
                        {formData.isActive && <CheckCircle className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden" 
                        checked={formData.isActive}
                        onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                      />
                      <span className="text-sm font-medium text-gray-700">Active Service</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-8 py-5 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setIsFormOpen(false)}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-white hover:shadow-sm transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !formData.name || !formData.basePrice}
                className="px-6 py-2.5 bg-[#2E8B57] text-white font-medium rounded-lg hover:bg-[#257a4a] shadow-lg shadow-green-900/10 transition-all disabled:opacity-50 disabled:shadow-none flex items-center"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white mr-2"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Configuration
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && rideTypes.length === 0 && !isFormOpen && (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-300">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Car className="h-10 w-10 text-[#2E8B57]" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900">No Services Configured</h3>
            <p className="text-gray-500 mt-2 mb-8 max-w-md mx-auto">Get started by defining your first vehicle type. You can set pricing, capacity, and features.</p>
            <button 
              onClick={handleOpenCreate}
              className="inline-flex items-center px-6 py-3 bg-[#2E8B57] text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-all hover:-translate-y-1"
            >
              <Plus className="h-5 w-5 mr-2" />
              Create First Ride
            </button>
          </div>
        )}

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {rideTypes.map((ride) => (
            <div 
              key={ride.id} 
              className="group bg-white rounded-2xl border border-gray-200 hover:border-[#2E8B57]/30 hover:shadow-xl hover:shadow-green-900/5 transition-all duration-300 flex flex-col overflow-hidden"
            >
              {/* Card Header */}
              <div className="p-6 pb-4">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-3xl shadow-inner border border-gray-100 group-hover:scale-110 transition-transform duration-300 overflow-hidden">
                    {ride.mediaType === "IMAGE" && ride.imageUrl ? (
                      <img src={ride.imageUrl} alt={ride.name} className="w-full h-full object-cover" />
                    ) : (
                      ride.icon
                    )}
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      ride.category === 'COURIER' 
                        ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                        : 'bg-purple-50 text-purple-700 border border-purple-100'
                    }`}>
                      {ride.category}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      ride.isActive 
                        ? 'bg-green-50 text-[#2E8B57] border border-green-100' 
                        : 'bg-gray-100 text-gray-500 border border-gray-200'
                    }`}>
                      {ride.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                
                <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-[#2E8B57] transition-colors">{ride.name}</h3>
                <p className="text-sm text-gray-500 line-clamp-2 h-10">{ride.description || "No description provided."}</p>
              </div>

              {/* Pricing Grid */}
              <div className="px-6 py-3 bg-gray-50/50 border-y border-gray-100 grid grid-cols-3 divide-x divide-gray-200">
                <div className="text-center px-2">
                  <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">Base</p>
                  <p className="font-bold text-gray-900">{currency}{ride.basePrice}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">/ Km</p>
                  <p className="font-bold text-gray-900">{currency}{ride.pricePerKm}</p>
                </div>
                <div className="text-center px-2">
                  <p className="text-[10px] uppercase text-gray-400 font-bold tracking-wider mb-1">/ Min</p>
                  <p className="font-bold text-gray-900">{currency}{ride.pricePerMinute}</p>
                </div>
              </div>

              {/* Specs & Features */}
              <div className="p-6 flex-grow space-y-4">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-2" title="Capacity">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span>{ride.capacity}</span>
                  </div>
                  {ride.vehicleType && (
                    <div className="flex items-center gap-2" title="Vehicle Type">
                      <Fuel className="h-4 w-4 text-gray-400" />
                      <span className="capitalize">{VEHICLE_TYPE_OPTIONS.find(v => v.value === ride.vehicleType)?.label || ride.vehicleType.toLowerCase()}</span>
                    </div>
                  )}
                  {ride.category === 'COURIER' && ride.weightRanges && ride.weightRanges.length > 0 && (
                    <div className="flex items-center gap-2" title="Weight Range Pricing">
                      <Package className="h-4 w-4 text-gray-400" />
                      <span className="text-xs">{ride.weightRanges.length} range{ride.weightRanges.length !== 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {ride.category === 'COURIER' && !ride.weightRanges && ride.pricePerKg && ride.pricePerKg > 0 && (
                    <div className="flex items-center gap-2" title="Price Per KG">
                      <Package className="h-4 w-4 text-gray-400" />
                      <span>{currency}{ride.pricePerKg}/kg</span>
                    </div>
                  )}
                </div>

                {/* Weight Ranges Display for Courier */}
                {ride.category === 'COURIER' && ride.weightRanges && ride.weightRanges.length > 0 && (
                  <div className="bg-blue-50/50 rounded-lg p-3 border border-blue-100">
                    <div className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Weight Pricing
                    </div>
                    <div className="space-y-1.5">
                      {ride.weightRanges.map((range, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-blue-100">
                          <span className="text-gray-600">{range.minKg}-{range.maxKg} kg</span>
                          <span className="font-medium text-[#2E8B57]">{currency}{range.price.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {ride.features.slice(0, 3).map((f, i) => (
                    <span key={i} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md">{f}</span>
                  ))}
                  {ride.features.length > 3 && (
                    <span className="px-2 py-1 bg-gray-50 text-gray-400 text-xs rounded-md">+{ride.features.length - 3}</span>
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 pt-0 mt-auto flex gap-3">
                <button 
                  onClick={() => handleEdit(ride)}
                  className="flex-1 flex items-center justify-center py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-[#2E8B57] hover:text-white hover:border-[#2E8B57] transition-all group/btn"
                >
                  <Edit className="h-4 w-4 mr-2 group-hover/btn:scale-110 transition-transform" />
                  Edit
                </button>
                <button 
                  onClick={() => handleDelete(ride.id)}
                  className="flex items-center justify-center p-2.5 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200 transition-all"
                  disabled={deleting}
                  title="Delete"
                >
                  {deleting ? <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full"></div> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}