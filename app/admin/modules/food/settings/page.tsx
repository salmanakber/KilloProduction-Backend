"use client"

import { useState, useEffect } from "react"
import {
  Search, Save, Flame, Leaf, Shield, RefreshCw, Plus, X,
  SlidersHorizontal, Clock, DollarSign, Image as ImageIcon,
  AlertTriangle, Check, Utensils
} from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Types remain the same...
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

// Default Data Constants (Abbreviated for brevity, assuming same data as before)
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
  // Default settings structure
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
  const [showAddAllergenModal, setShowAddAllergenModal] = useState(false)
  const [allergenSearch, setAllergenSearch] = useState("")
  const [newAllergen, setNewAllergen] = useState({ name: "", description: "" })
  const { toast } = useToast()

  // Fetch settings from API
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/admin/food/settings")
        if (!response.ok) throw new Error("Failed to fetch settings")
        const data = await response.json()
        
        // Merge API data with defaults to ensure all fields exist
        if (data.settings) {
          setSettings({
            spiceLevels: data.settings.spiceLevels || defaultSettings.spiceLevels,
            commonAllergens: data.settings.commonAllergens || defaultSettings.commonAllergens,
            dietaryOptions: data.settings.dietaryOptions || defaultSettings.dietaryOptions,
            defaults: {
              ...defaultSettings.defaults,
              ...(data.settings.defaults || {}),
            },
            validation: {
              ...defaultSettings.validation,
              ...(data.settings.validation || {}),
            },
          })
        } else {
          // If no settings found, use defaults
          setSettings(defaultSettings)
        }
      } catch (error: any) {
        console.error("Error fetching settings:", error)
        toast({
          title: "Error",
          description: "Failed to load settings. Using defaults.",
          variant: "destructive",
        })
        // Use defaults on error
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
      // Validate settings structure before saving
      const settingsToSave: FoodSettings = {
        spiceLevels: settings.spiceLevels || [],
        commonAllergens: settings.commonAllergens || [],
        dietaryOptions: settings.dietaryOptions || [],
        defaults: settings.defaults || {
          defaultPreparationTime: 15,
          defaultSpiceLevel: "MILD",
          requireCaloriesInfo: false,
          requireIngredientsInfo: false,
          allowCustomVariants: true,
          allowCustomAddOns: true,
        },
        validation: settings.validation || {
          minPrice: 0,
          maxPrice: 10000,
          minPreparationTime: 5,
          maxPreparationTime: 120,
          maxImagesPerItem: 5,
          maxVariantsPerItem: 10,
          maxAddOnsPerItem: 15,
        },
      }

      const response = await fetch("/api/admin/food/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settingsToSave),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to save settings")
      }

      const result = await response.json()
      // Update settings with the saved data to ensure sync
      if (result.settings) {
        setSettings(result.settings)
      } else {
        // If no settings in response, use what we sent (it was saved successfully)
        setSettings(settingsToSave)
      }

      toast({ title: "Saved", description: "Configuration updated successfully." })
    } catch (error: any) {
      console.error("Error saving settings:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAddAllergen = () => {
    if (!newAllergen.name.trim()) {
      toast({
        title: "Error",
        description: "Allergen name is required",
        variant: "destructive",
      })
      return
    }
    const newId = newAllergen.name.toLowerCase().replace(/\s+/g, "_")
    // Check if allergen already exists
    if (settings.commonAllergens.some(a => a.id === newId || a.name.toLowerCase() === newAllergen.name.toLowerCase())) {
      toast({
        title: "Error",
        description: "Allergen already exists",
        variant: "destructive",
      })
      return
    }
    setSettings(prev => ({
      ...prev,
      commonAllergens: [...prev.commonAllergens, { id: newId, name: newAllergen.name.trim(), description: newAllergen.description.trim() || "", enabled: true }]
    }))
    setNewAllergen({ name: "", description: "" })
    setShowAddAllergenModal(false)
    toast({
      title: "Success",
      description: "Allergen added. Don't forget to save changes.",
    })
  }

  const filteredAllergens = settings.commonAllergens.filter(a => 
    a.name.toLowerCase().includes(allergenSearch.toLowerCase())
  )

  if (loading) return <div className="h-96 flex items-center justify-center"><RefreshCw className="animate-spin text-green-600" /></div>

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 -mx-6 px-6 py-4 flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Utensils className="h-6 w-6 text-green-600" />
            Food Settings
          </h1>
          <p className="text-sm text-gray-500">Global configuration for food vendors</p>
        </div>
        <Button onClick={saveSettings} disabled={saving} className="bg-green-600 hover:bg-green-700 shadow-md transition-all">
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Save Changes
        </Button>
      </div>

      <Tabs defaultValue="attributes" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8 bg-gray-100/80 p-1 rounded-xl">
          <TabsTrigger value="attributes" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">Attributes (Spice & Diet)</TabsTrigger>
          <TabsTrigger value="allergens" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">Allergens</TabsTrigger>
          <TabsTrigger value="rules" className="data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg">Rules & Defaults</TabsTrigger>
        </TabsList>

        {/* --- TAB 1: ATTRIBUTES --- */}
        <TabsContent value="attributes" className="space-y-6 animate-in fade-in-50 slide-in-from-bottom-2">
          
          {/* Spice Levels */}
          <Card className="border-none shadow-sm bg-orange-50/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-orange-100 rounded-lg"><Flame className="h-5 w-5 text-orange-600" /></div>
                <div>
                  <CardTitle className="text-lg">Spice Levels</CardTitle>
                  <CardDescription>Configure heat levels available for dishes.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {settings.spiceLevels.map((level, idx) => (
                  <div key={idx} className={cn(
                    "flex items-center justify-between p-4 bg-white rounded-xl border transition-all duration-200",
                    level.enabled ? "border-orange-200 shadow-sm" : "border-gray-100 opacity-60 grayscale"
                  )}>
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{level.icon}</span>
                      <div>
                        <div className="font-semibold text-gray-800">{level.label}</div>
                        <div className="text-xs text-gray-500">{level.description}</div>
                      </div>
                    </div>
                    <Switch 
                      checked={level.enabled ?? true}
                      onCheckedChange={(c) => {
                        const newLevels = settings.spiceLevels.map((l, i) => 
                          i === idx ? { ...l, enabled: c } : l
                        )
                        setSettings(prev => ({...prev, spiceLevels: newLevels}))
                      }}
                      className="data-[state=checked]:bg-orange-500"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Dietary Options */}
          <Card className="border-none shadow-sm bg-green-50/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-green-100 rounded-lg"><Leaf className="h-5 w-5 text-green-600" /></div>
                <div>
                  <CardTitle className="text-lg">Dietary Tags</CardTitle>
                  <CardDescription>Enable dietary preferences for filtering.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {settings.dietaryOptions.map((option, idx) => (
                  <div key={idx} className={cn(
                    "flex flex-col items-center justify-center p-4 bg-white rounded-xl border text-center gap-2 transition-all cursor-pointer hover:border-green-300",
                    option.enabled ? "border-green-200 ring-1 ring-green-100" : "border-gray-100 opacity-50"
                  )}
                  onClick={() => {
                     const newOpts = settings.dietaryOptions.map((opt, i) => 
                       i === idx ? { ...opt, enabled: !opt.enabled } : opt
                     )
                     setSettings(prev => ({...prev, dietaryOptions: newOpts}))
                  }}
                  >
                    <span className="text-3xl mb-1">{option.icon}</span>
                    <span className="font-medium text-sm text-gray-700">{option.label}</span>
                    <div className={cn("w-2 h-2 rounded-full mt-1", option.enabled ? "bg-green-500" : "bg-gray-300")} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB 2: ALLERGENS --- */}
        <TabsContent value="allergens" className="animate-in fade-in-50 slide-in-from-bottom-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600" /> Common Allergens
                </CardTitle>
                <CardDescription>Manage standardized allergen tags.</CardDescription>
              </div>
              <Button onClick={() => setShowAddAllergenModal(true)} size="sm" variant="outline" className="gap-2">
                <Plus className="h-4 w-4" /> Add New
              </Button>
            </CardHeader>
            <div className="px-6 pb-4">
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                 <Input 
                    placeholder="Search allergens..." 
                    className="pl-9 bg-gray-50 border-0" 
                    value={allergenSearch}
                    onChange={(e) => setAllergenSearch(e.target.value)}
                 />
               </div>
            </div>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAllergens.length === 0 ? (
                    <div className="col-span-full py-12 text-center text-gray-400">
                        No allergens found matching "{allergenSearch}"
                    </div>
                ) : (
                    filteredAllergens.map((allergen) => (
                    <div key={allergen.id} className="group flex items-start justify-between p-3 rounded-lg border border-gray-100 hover:border-blue-100 hover:shadow-sm bg-white transition-all">
                        <div>
                        <div className="font-medium text-gray-900">{allergen.name}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[150px]">{allergen.description || "No description"}</div>
                        </div>
                        <div className="flex items-center gap-1">
                        <Switch 
                            checked={allergen.enabled ?? true}
                            onCheckedChange={(c) => {
                                const newAllergens = settings.commonAllergens.map(a => 
                                  a.id === allergen.id ? {...a, enabled: c} : a
                                )
                                setSettings(prev => ({...prev, commonAllergens: newAllergens}))
                            }}
                            className="scale-75 data-[state=checked]:bg-blue-600"
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-gray-300 hover:text-red-500" onClick={(e) => {
                          e.stopPropagation()
                          setSettings(prev => ({...prev, commonAllergens: prev.commonAllergens.filter(a => a.id !== allergen.id)}))
                        }}>
                            <X className="h-3 w-3" />
                        </Button>
                        </div>
                    </div>
                    ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- TAB 3: RULES & DEFAULTS --- */}
        <TabsContent value="rules" className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in-50 slide-in-from-bottom-2">
            
            {/* Column 1: Defaults */}
            <div className="lg:col-span-1 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Defaults</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Prep Time (mins)</Label>
                            <Input 
                                type="number" 
                                value={settings.defaults.defaultPreparationTime}
                                onChange={e => setSettings(prev => ({...prev, defaults: {...prev.defaults, defaultPreparationTime: parseInt(e.target.value) || 15}}))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Default Spice</Label>
                            <Select value={settings.defaults.defaultSpiceLevel} onValueChange={v => setSettings(prev => ({...prev, defaults: {...prev.defaults, defaultSpiceLevel: v}}))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{settings.spiceLevels.map(l => <SelectItem key={l.value} value={l.value}>{l.icon} {l.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="pt-2 space-y-3">
                            <div className="flex items-center justify-between">
                                <Label className="cursor-pointer" htmlFor="reqCal">Require Calories</Label>
                                <Switch id="reqCal" checked={settings.defaults.requireCaloriesInfo} onCheckedChange={c => setSettings(prev => ({...prev, defaults: {...prev.defaults, requireCaloriesInfo: c}}))} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label className="cursor-pointer" htmlFor="reqIng">Require Ingredients</Label>
                                <Switch id="reqIng" checked={settings.defaults.requireIngredientsInfo} onCheckedChange={c => setSettings(prev => ({...prev, defaults: {...prev.defaults, requireIngredientsInfo: c}}))} />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Column 2 & 3: Validation Rules */}
            <div className="lg:col-span-2 space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Validation Rules</CardTitle>
                        <CardDescription>Set boundaries for vendor input.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            
                            {/* Price Group */}
                            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                                <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2"><DollarSign className="h-3 w-3" /> Price Range</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Min ($)</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.minPrice} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, minPrice: parseFloat(e.target.value) || 0}}))} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Max ($)</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.maxPrice} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, maxPrice: parseFloat(e.target.value) || 0}}))} />
                                    </div>
                                </div>
                            </div>

                            {/* Time Group */}
                            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
                                <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2"><Clock className="h-3 w-3" /> Prep Time (mins)</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Min</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.minPreparationTime} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, minPreparationTime: parseInt(e.target.value) || 0}}))} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Max</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.maxPreparationTime} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, maxPreparationTime: parseInt(e.target.value) || 0}}))} />
                                    </div>
                                </div>
                            </div>

                            {/* Limits Group */}
                            <div className="col-span-1 sm:col-span-2 space-y-3 p-4 bg-gray-50 rounded-lg">
                                <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2"><ImageIcon className="h-3 w-3" /> content Limits</h4>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Max Images</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.maxImagesPerItem} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, maxImagesPerItem: parseInt(e.target.value) || 0}}))} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Max Variants</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.maxVariantsPerItem} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, maxVariantsPerItem: parseInt(e.target.value) || 0}}))} />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-gray-500">Max Add-ons</Label>
                                        <Input type="number" className="bg-white" value={settings.validation.maxAddOnsPerItem} onChange={(e) => setSettings(prev => ({...prev, validation: {...prev.validation, maxAddOnsPerItem: parseInt(e.target.value) || 0}}))} />
                                    </div>
                                </div>
                            </div>

                        </div>
                    </CardContent>
                </Card>
            </div>
        </TabsContent>
      </Tabs>

      {/* Add Allergen Modal */}
      <Dialog open={showAddAllergenModal} onOpenChange={setShowAddAllergenModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Allergen</DialogTitle>
            <DialogDescription>Add to standard list.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newAllergen.name} onChange={e => setNewAllergen({...newAllergen, name: e.target.value})} placeholder="e.g. Peanuts" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={newAllergen.description} onChange={e => setNewAllergen({...newAllergen, description: e.target.value})} placeholder="Optional details" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddAllergenModal(false)}>Cancel</Button>
            <Button onClick={handleAddAllergen} className="bg-green-600 hover:bg-green-700">Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}