"use client"

import { useState, useEffect } from "react"
import {
  Search, Save, Flame, Leaf, Shield, RefreshCw, Plus, X,
  SlidersHorizontal, Clock, DollarSign, Image as ImageIcon,
  AlertTriangle, Check, Utensils, ChevronLeft, ChevronRight,
  Info, CheckCircle, XCircle
} from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

// --- Types ---
interface FoodSettings {
  spiceLevels: { value: string; label: string; description?: string; icon?: string; enabled: boolean }[]
  commonAllergens: { id: string; name: string; description?: string; enabled: boolean }[]
  dietaryOptions: { value: string; label: string; icon?: string; enabled: boolean }[]
  defaults: {
    defaultPreparationTime: number
    defaultSpiceLevel: string
    requireCaloriesInfo: boolean
    requireIngredientsInfo: boolean
    allowCustomVariants: boolean
    allowCustomAddOns: boolean
  }
  validation: {
    minPrice: number; maxPrice: number; minPreparationTime: number; maxPreparationTime: number
    maxImagesPerItem: number; maxVariantsPerItem: number; maxAddOnsPerItem: number
  }
}

const DEFAULT_SPICE_LEVELS = [
  { value: "NONE", label: "No Spice", description: "No heat", icon: "🌿", enabled: true },
  { value: "MILD", label: "Mild", description: "Slight heat", icon: "🌶️", enabled: true },
  { value: "MEDIUM", label: "Medium", description: "Moderate heat", icon: "🌶️🌶️", enabled: true },
  { value: "HOT", label: "Hot", description: "High heat", icon: "🌶️🌶️🌶️", enabled: true },
  { value: "EXTRA_HOT", label: "Extra Hot", description: "Extreme heat", icon: "🔥", enabled: true },
]
const DEFAULT_ALLERGENS = [
  { id: "nuts", name: "Nuts", description: "Tree nuts", enabled: true },
  { id: "dairy", name: "Dairy", description: "Milk products", enabled: true },
  { id: "gluten", name: "Gluten", description: "Wheat products", enabled: true },
  { id: "eggs", name: "Eggs", description: "Egg products", enabled: true },
  { id: "soy", name: "Soy", description: "Soybeans", enabled: true },
  { id: "shellfish", name: "Shellfish", description: "Crustaceans", enabled: true },
]
const DEFAULT_DIETARY_OPTIONS = [
  { value: "vegetarian", label: "Vegetarian", icon: "🥬", enabled: true },
  { value: "vegan", label: "Vegan", icon: "🌱", enabled: true },
  { value: "glutenFree", label: "Gluten Free", icon: "🌾", enabled: true },
  { value: "halal", label: "Halal", icon: "☪️", enabled: true },
]

export default function FoodSettingsManagement() {
  const defaultSettings: FoodSettings = {
    spiceLevels: DEFAULT_SPICE_LEVELS,
    commonAllergens: DEFAULT_ALLERGENS,
    dietaryOptions: DEFAULT_DIETARY_OPTIONS,
    defaults: {
      defaultPreparationTime: 15, defaultSpiceLevel: "MILD", requireCaloriesInfo: false,
      requireIngredientsInfo: false, allowCustomVariants: true, allowCustomAddOns: true,
    },
    validation: {
      minPrice: 0, maxPrice: 10000, minPreparationTime: 5, maxPreparationTime: 120,
      maxImagesPerItem: 5, maxVariantsPerItem: 10, maxAddOnsPerItem: 15,
    },
  }

  const [settings, setSettings] = useState<FoodSettings>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("attributes")
  const [showAddAllergenModal, setShowAddAllergenModal] = useState(false)
  const [allergenSearch, setAllergenSearch] = useState("")
  const [newAllergen, setNewAllergen] = useState({ name: "", description: "" })
  const { toast } = useToast()

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200 px-6 py-2.5 rounded-xl font-medium flex items-center gap-2"

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/admin/food/settings")
        if (!response.ok) throw new Error("Failed to fetch settings")
        const data = await response.json()
        if (data.settings) {
          setSettings({
            spiceLevels: data.settings.spiceLevels || defaultSettings.spiceLevels,
            commonAllergens: data.settings.commonAllergens || defaultSettings.commonAllergens,
            dietaryOptions: data.settings.dietaryOptions || defaultSettings.dietaryOptions,
            defaults: { ...defaultSettings.defaults, ...(data.settings.defaults || {}) },
            validation: { ...defaultSettings.validation, ...(data.settings.validation || {}) },
          })
        } else {
          setSettings(defaultSettings)
        }
      } catch (error: any) {
        toast({ title: "Error", description: "Failed to load settings. Using defaults.", variant: "destructive" })
        setSettings(defaultSettings)
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [toast])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const response = await fetch("/api/admin/food/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (!response.ok) throw new Error("Failed to save settings")
      const result = await response.json()
      if (result.settings) setSettings(result.settings)
      toast({ title: "Saved", description: "Configuration updated successfully." })
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const handleAddAllergen = () => {
    if (!newAllergen.name.trim()) return
    const newId = newAllergen.name.toLowerCase().replace(/\s+/g, "_")
    if (settings.commonAllergens.some(a => a.id === newId)) return
    setSettings(prev => ({
      ...prev,
      commonAllergens: [...prev.commonAllergens, { id: newId, name: newAllergen.name.trim(), description: newAllergen.description.trim(), enabled: true }]
    }))
    setNewAllergen({ name: "", description: "" })
    setShowAddAllergenModal(false)
  }

  const filteredAllergens = settings.commonAllergens.filter(a => a.name.toLowerCase().includes(allergenSearch.toLowerCase()))

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Food Module Settings</h1>
          <p className="text-slate-500 mt-1">Configure global dietary attributes, allergens, and business rules</p>
        </div>
        <button onClick={saveSettings} disabled={saving} className={cn(gradientBtnClass, saving && "opacity-50 cursor-not-allowed")}>
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Configuration
        </button>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white p-1 rounded-2xl shadow-sm border border-slate-200 inline-flex">
        {[
          { id: 'attributes', label: 'Attributes', icon: Flame },
          { id: 'allergens', label: 'Allergens', icon: Shield },
          { id: 'rules', label: 'Business Rules', icon: SlidersHorizontal },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center px-6 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200",
              activeTab === tab.id 
                ? "bg-slate-900 text-white shadow-md" 
                : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
            )}
          >
            <tab.icon className={cn("h-4 w-4 mr-2", activeTab === tab.id ? "text-emerald-400" : "text-slate-400")} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="space-y-6">
        {activeTab === "attributes" && (
          <div className="grid grid-cols-1 gap-8 animate-in fade-in-50 duration-300">
            {/* Spice Levels Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 border border-amber-100">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Spice Levels</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Heat Configuration</p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {settings.spiceLevels.map((level, idx) => (
                  <div key={idx} className={cn(
                    "group flex items-center justify-between p-4 rounded-2xl border transition-all duration-200",
                    level.enabled ? "bg-white border-slate-200 shadow-sm" : "bg-slate-50 border-slate-100 opacity-60"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                        {level.icon}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{level.label}</div>
                        <div className="text-xs text-slate-500">{level.description}</div>
                      </div>
                    </div>
                    <Switch 
                      checked={level.enabled}
                      onCheckedChange={(c) => {
                        const newLevels = [...settings.spiceLevels]
                        newLevels[idx].enabled = c
                        setSettings({...settings, spiceLevels: newLevels})
                      }}
                      className="data-[state=checked]:bg-emerald-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Dietary Tags Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                <div className="h-10 w-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100">
                  <Leaf className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Dietary Preference Tags</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Standardized Filtering</p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                {settings.dietaryOptions.map((option, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      const newOpts = [...settings.dietaryOptions]
                      newOpts[idx].enabled = !newOpts[idx].enabled
                      setSettings({...settings, dietaryOptions: newOpts})
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 relative overflow-hidden group",
                      option.enabled ? "bg-emerald-50/50 border-emerald-200 ring-1 ring-emerald-100" : "bg-white border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <span className="text-4xl mb-3 group-hover:scale-110 transition-transform">{option.icon}</span>
                    <span className={cn("font-bold text-sm", option.enabled ? "text-emerald-700" : "text-slate-600")}>{option.label}</span>
                    {option.enabled && <CheckCircle className="absolute top-3 right-3 h-4 w-4 text-emerald-500" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "allergens" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in-50 duration-300">
            <div className="px-6 py-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Common Allergens</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Safety Compliance List</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input 
                    placeholder="Search allergens..." 
                    value={allergenSearch}
                    onChange={(e) => setAllergenSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none w-full md:w-64" 
                  />
                </div>
                <button onClick={() => setShowAddAllergenModal(true)} className="flex items-center px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">
                  <Plus className="h-4 w-4 mr-1.5" /> Add
                </button>
              </div>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredAllergens.map((allergen) => (
                <div key={allergen.id} className="flex items-center justify-between p-4 bg-slate-50/50 rounded-2xl border border-slate-100 hover:border-slate-200 transition-colors">
                  <div>
                    <div className="font-bold text-slate-900 text-sm">{allergen.name}</div>
                    <div className="text-[11px] text-slate-500 line-clamp-1">{allergen.description || "System standard"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={allergen.enabled}
                      onCheckedChange={(c) => {
                        const updated = settings.commonAllergens.map(a => a.id === allergen.id ? {...a, enabled: c} : a)
                        setSettings({...settings, commonAllergens: updated})
                      }}
                      className="scale-75 data-[state=checked]:bg-emerald-500"
                    />
                    <button 
                      onClick={() => setSettings({...settings, commonAllergens: settings.commonAllergens.filter(a => a.id !== allergen.id)})}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "rules" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in-50 duration-300">
            {/* Defaults Section */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center">
                  <SlidersHorizontal className="h-3 w-3 mr-2" /> Default Parameters
                </h3>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Standard Prep Time (mins)</label>
                    <input 
                      type="number" 
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none transition-shadow"
                      value={settings.defaults.defaultPreparationTime}
                      onChange={e => setSettings({...settings, defaults: {...settings.defaults, defaultPreparationTime: parseInt(e.target.value) || 15}})}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-slate-700">Base Spice Level</label>
                    <select 
                      className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none bg-white transition-shadow"
                      value={settings.defaults.defaultSpiceLevel}
                      onChange={v => setSettings({...settings, defaults: {...settings.defaults, defaultSpiceLevel: v.target.value}})}
                    >
                      {settings.spiceLevels.map(l => <option key={l.value} value={l.value}>{l.icon} {l.label}</option>)}
                    </select>
                  </div>
                  <div className="pt-4 space-y-4 border-t border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Require Calories</span>
                      <Switch 
                        checked={settings.defaults.requireCaloriesInfo} 
                        onCheckedChange={c => setSettings({...settings, defaults: {...settings.defaults, requireCaloriesInfo: c}})} 
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">Require Ingredients</span>
                      <Switch 
                        checked={settings.defaults.requireIngredientsInfo} 
                        onCheckedChange={c => setSettings({...settings, defaults: {...settings.defaults, requireIngredientsInfo: c}})} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Validation Rules Section */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center">
                  <AlertTriangle className="h-3 w-3 mr-2" /> Global Validation Boundaries
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Price Boundaries */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /> Price Range Settings</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Min Price</label>
                        <input 
                          type="number" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          value={settings.validation.minPrice} 
                          onChange={(e) => setSettings({...settings, validation: {...settings.validation, minPrice: parseFloat(e.target.value) || 0}})} 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Max Price</label>
                        <input 
                          type="number" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          value={settings.validation.maxPrice} 
                          onChange={(e) => setSettings({...settings, validation: {...settings.validation, maxPrice: parseFloat(e.target.value) || 0}})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Time Boundaries */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-4">
                    <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> Prep Time (Mins)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Min Limit</label>
                        <input 
                          type="number" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          value={settings.validation.minPreparationTime} 
                          onChange={(e) => setSettings({...settings, validation: {...settings.validation, minPreparationTime: parseInt(e.target.value) || 0}})} 
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Max Limit</label>
                        <input 
                          type="number" className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          value={settings.validation.maxPreparationTime} 
                          onChange={(e) => setSettings({...settings, validation: {...settings.validation, maxPreparationTime: parseInt(e.target.value) || 0}})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Upload Limits */}
                  <div className="md:col-span-2 bg-slate-900 text-white p-6 rounded-2xl space-y-6 shadow-lg shadow-slate-200">
                    <h4 className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-2 tracking-widest"><ImageIcon className="h-4 w-4" /> Content Complexity Limits</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Max Gallery Photos</label>
                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" value={settings.validation.maxImagesPerItem} onChange={(e) => setSettings({...settings, validation: {...settings.validation, maxImagesPerItem: parseInt(e.target.value) || 0}})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Max Item Variants</label>
                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" value={settings.validation.maxVariantsPerItem} onChange={(e) => setSettings({...settings, validation: {...settings.validation, maxVariantsPerItem: parseInt(e.target.value) || 0}})} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Max Custom Add-ons</label>
                        <input type="number" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none" value={settings.validation.maxAddOnsPerItem} onChange={(e) => setSettings({...settings, validation: {...settings.validation, maxAddOnsPerItem: parseInt(e.target.value) || 0}})} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add Allergen Modal - Refactored UI */}
      <Dialog open={showAddAllergenModal} onOpenChange={setShowAddAllergenModal}>
        <DialogContent className="rounded-2xl border-none p-0 overflow-hidden max-w-md">
          <div className="bg-slate-900 px-6 py-5">
            <DialogTitle className="text-white text-xl font-bold">New Allergen Entry</DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">Standardize food safety labels across the platform.</DialogDescription>
          </div>
          <div className="p-6 space-y-4 bg-white">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Display Name</label>
              <input 
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none" 
                value={newAllergen.name} onChange={e => setNewAllergen({...newAllergen, name: e.target.value})} placeholder="e.g. Tree Nuts" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Detailed Description</label>
              <textarea 
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 outline-none h-24 resize-none" 
                value={newAllergen.description} onChange={e => setNewAllergen({...newAllergen, description: e.target.value})} placeholder="Mention related foods or ingredients..." 
              />
            </div>
          </div>
          <div className="px-6 py-4 bg-slate-50 flex items-center justify-end gap-3">
            <button onClick={() => setShowAddAllergenModal(false)} className="px-5 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 transition-colors">Cancel</button>
            <button onClick={handleAddAllergen} className={gradientBtnClass}>Add Entry</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}