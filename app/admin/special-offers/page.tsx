"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CalendarIcon, Plus, Edit, Trash2, Tag, Wand2, Users, MapPin, Loader2,
  Sparkles, Image as ImageIcon, X, TrendingUp, Activity, Ticket, Search,
  BarChart3, Upload, CheckCircle2, ChevronRight
} from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { systemSettings } from "@/lib/systemSettings"

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"

interface SpecialOffer {
  id: string
  title: string
  subtitle?: string
  description?: string
  module?: "PHARMACY" | "GROCERY" | "FOOD" | "AUTO_PARTS"
  discountType: "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_ONE_GET_ONE" | "FREE_DELIVERY"
  discountValue: number
  discountFundedBy?: "PLATFORM" | "VENDOR"
  validFrom: string
  validUntil: string
  imageUrl?: string
  bannerImageUrl?: string
  isActive: boolean
  targetAudience?: any
  conditions?: any
  maxUses?: number
  usedCount: number
  pharmacyId?: string
  pharmacy?: { id: string; pharmacyName: string }
  locationState?: string | null
  locationLatitude?: number | null
  locationLongitude?: number | null
  locationRadiusKm?: number | null
  maxVendors?: number | null
  enableInvitations?: boolean
  enablePaidSlots?: boolean
  slotPrice?: number | null
  maxPaidSlots?: number | null
  enableAiSelection?: boolean
  createdAt: string
  updatedAt: string
}

interface Pharmacy {
  id: string
  pharmacyName: string
}

type CategoryNode = { id: string; name: string; children?: Array<{ id: string; name: string }> }
const USER_TYPES = ["customer", "vendor", "premium_member", "new_user"]

const mockChartData = [
  { name: 'Jan', redemptions: 120 }, { name: 'Feb', redemptions: 250 }, { name: 'Mar', redemptions: 180 },
  { name: 'Apr', redemptions: 390 }, { name: 'May', redemptions: 480 }, { name: 'Jun', redemptions: 420 },
  { name: 'Jul', redemptions: 600 },
]

const MODULE_COLORS: Record<string, string> = {
  PHARMACY: "bg-emerald-100 text-emerald-700",
  GROCERY: "bg-blue-100 text-blue-700",
  FOOD: "bg-orange-100 text-orange-700",
  AUTO_PARTS: "bg-slate-100 text-slate-700",
}

// ─── Reusable Image Upload Box ────────────────────────────────────────────────
function ImageUploadBox({
  label,
  hint,
  value,
  uploading,
  onUpload,
  onClear,
  field,
  icon: Icon = Upload,
  aspectClass = "h-40",
}: {
  label: string
  hint: string
  value: string
  uploading: boolean
  onUpload: (e: React.ChangeEvent<HTMLInputElement>, field: "imageUrl" | "bannerImageUrl") => void
  onClear: () => void
  field: "imageUrl" | "bannerImageUrl"
  icon?: React.ElementType
  aspectClass?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</Label>
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-200 overflow-hidden group",
          aspectClass,
          value
            ? "border-emerald-300 bg-emerald-50/30"
            : "border-slate-200 bg-slate-50 hover:border-emerald-300 hover:bg-emerald-50/20 cursor-pointer"
        )}
        onClick={() => !value && !uploading && inputRef.current?.click()}
      >
        {/* Hidden file input — always rendered */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onUpload(e, field)}
        />

        {uploading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
            </div>
            <span className="text-xs font-medium text-slate-500">Uploading…</span>
          </div>
        ) : value ? (
          <>
            <img
              src={value}
              alt={label}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
              <button
                type="button"
                className="flex items-center gap-1.5 bg-white text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow hover:bg-slate-100 transition-colors"
                onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
              >
                <Upload className="w-3.5 h-3.5" /> Replace
              </button>
              <button
                type="button"
                className="flex items-center gap-1.5 bg-red-500 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow hover:bg-red-600 transition-colors"
                onClick={(e) => { e.stopPropagation(); onClear() }}
              >
                <X className="w-3.5 h-3.5" /> Remove
              </button>
            </div>
            <div className="absolute top-2 left-2">
              <span className="inline-flex items-center gap-1 bg-emerald-500 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                <CheckCircle2 className="w-3 h-3" /> Uploaded
              </span>
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-slate-200 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <Icon className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-slate-500 group-hover:text-emerald-700 transition-colors">Click to upload</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, colorClass }: { label: string; value: string | number; icon: React.ElementType; colorClass: string }) {
  return (
    <Card className="shadow-sm border-slate-100 hover:shadow-md transition-all duration-200 group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
          </div>
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-200", colorClass)}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Section Header inside form ───────────────────────────────────────────────
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

export default function SpecialOffersPage() {
  const [offers, setOffers] = useState<SpecialOffer[]>([])
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([])
  const [loading, setLoading] = useState(true)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [editingOffer, setEditingOffer] = useState<SpecialOffer | null>(null)
  const [vendors, setVendors] = useState<Array<{ userId: string; name: string; rating: number; totalOrders: number }>>([])
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [autoSelectLoading, setAutoSelectLoading] = useState(false)
  const [currency, setCurrency] = useState('NGN')
  const [uploadingImage, setUploadingImage] = useState<null | "imageUrl" | "bannerImageUrl">(null)
  const [saving, setSaving] = useState(false)
  const [vendorFilters, setVendorFilters] = useState({ city: "", search: "", minRating: "", minOrders: "" })
  const [categories, setCategories] = useState<CategoryNode[]>([])
  const [locationQuery, setLocationQuery] = useState("")
  const [geocoding, setGeocoding] = useState(false)
  const [addressSuggestions, setAddressSuggestions] = useState<Array<{ description: string; place_id: string }>>([])
  const [addressLoading, setAddressLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  const [illnessOptions, setIllnessOptions] = useState<Array<{ id: string; name: string; displayName: string; isActive: boolean }>>([])
  const [sublocalities, setSublocalities] = useState<string[]>([])
  const [sublocalitiesLoading, setSublocalitiesLoading] = useState(false)
  const [sublocalitiesSearch, setSublocalitiesSearch] = useState("")
  const [offerReport, setOfferReport] = useState<any | null>(null)
  const [offerReportLoading, setOfferReportLoading] = useState(false)
  const [offerReportLive, setOfferReportLive] = useState(false)

  useEffect(() => {
    systemSettings().then(settings => setCurrency(settings.currency))
  }, [])

  useEffect(() => {
    // Illness types list (admin-managed). Used for Pharmacy offer conditions.
    ;(async () => {
      try {
        const qp = new URLSearchParams({ status: "true", limit: "500", page: "1" })
        const res = await fetch(`/api/admin/illness-categories?${qp.toString()}`)
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        const list = Array.isArray(data?.illnesses) ? data.illnesses : []
        setIllnessOptions(
          list.map((x: any) => ({
            id: String(x?.id || ""),
            name: String(x?.name || "").trim(),
            displayName: String(x?.displayName || x?.name || "").trim(),
            isActive: !!x?.isActive,
          })).filter((x: any) => x.displayName)
        )
      } catch {
        // ignore
      }
    })()
  }, [])

  const [formData, setFormData] = useState({
    title: "", subtitle: "", description: "",
    module: "PHARMACY" as "PHARMACY" | "GROCERY" | "FOOD" | "AUTO_PARTS",
    discountType: "PERCENTAGE" as "PERCENTAGE" | "FIXED_AMOUNT" | "BUY_ONE_GET_ONE" | "FREE_DELIVERY",
    discountValue: 0, validFrom: new Date(), validUntil: new Date(),
    discountFundedBy: "PLATFORM" as "PLATFORM" | "VENDOR",
    imageUrl: "", bannerImageUrl: "", isActive: true, maxUses: undefined as number | undefined,
    pharmacyId: "", locationState: "", locationLatitude: "", locationLongitude: "", locationRadiusKm: "",
    maxVendors: "", enableInvitations: true,
    // Paid slots removed – always false/ignored
    enablePaidSlots: false, slotPrice: "", maxPaidSlots: "",
    enableAiSelection: false, participationMode: "INVITATION" as "INVITATION" | "NONE",
    conditionsMinOrder: "" as string | number, conditionsExcludeCategories: [] as string[],
    conditionsIllnessTypes: [] as string[],
    targetUserTypes: [] as string[], targetLocations: ""
  })

  const geofenceCacheKey = () => {
    const lat = Number(formData.locationLatitude)
    const lon = Number(formData.locationLongitude)
    const r = Number(formData.locationRadiusKm || 0)
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    const latKey = Math.round(lat * 10000) / 10000
    const lonKey = Math.round(lon * 10000) / 10000
    const rKey = Number.isFinite(r) ? r : 0
    return `sublocalities:v1:${latKey},${lonKey}:r=${rKey}`
  }

  const loadSublocalitiesForGeofence = async () => {
    const key = geofenceCacheKey()
    const lat = Number(formData.locationLatitude)
    const lon = Number(formData.locationLongitude)
    const radiusKm = Number(formData.locationRadiusKm || 30)
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lon)) return

    try {
      setSublocalitiesLoading(true)
      // local cache first (reduce API usage)
      const cached = typeof window !== "undefined" ? window.localStorage.getItem(key) : null
      if (cached) {
        const parsed = JSON.parse(cached)
        const list = Array.isArray(parsed?.sublocalities) ? parsed.sublocalities : []
        setSublocalities(list.map((x: any) => String(x)).filter(Boolean))
        return
      }

      const qp = new URLSearchParams({
        lat: String(lat),
        lon: String(lon),
        radiusKm: String(Number.isFinite(radiusKm) ? radiusKm : 30),
      })
      const res = await fetch(`/api/location/sublocalities?${qp.toString()}`)
      const data = await res.json().catch(() => ({}))
      const list = Array.isArray(data?.sublocalities) ? data.sublocalities : []
      const finalList = list.map((x: any) => String(x)).filter(Boolean)
      setSublocalities(finalList)
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify({ sublocalities: finalList, savedAt: Date.now() }))
      }
    } finally {
      setSublocalitiesLoading(false)
    }
  }

  useEffect(() => {
    // When geofencing changes, refresh *from localStorage only* (no API call).
    const key = geofenceCacheKey()
    if (!key || typeof window === "undefined") {
      setSublocalities([])
      setSublocalitiesSearch("")
      return
    }
    try {
      const cached = window.localStorage.getItem(key)
      if (!cached) {
        setSublocalities([])
        setSublocalitiesSearch("")
        return
      }
      const parsed = JSON.parse(cached)
      const list = Array.isArray(parsed?.sublocalities) ? parsed.sublocalities : []
      setSublocalities(list.map((x: any) => String(x)).filter(Boolean))
    } catch {
      setSublocalities([])
    }
  }, [formData.locationLatitude, formData.locationLongitude, formData.locationRadiusKm])

  useEffect(() => { fetchOffers(); fetchPharmacies(); }, [])
  useEffect(() => { fetchCategoriesByModule(formData.module).catch(() => {}) }, [formData.module])

  useEffect(() => {
    const q = locationQuery.trim()
    if (!q || q.length < 3) { setAddressSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        setAddressLoading(true)
        const res = await fetch(`/api/autofill/autocomplete?input=${encodeURIComponent(q)}`)
        const data = await res.json().catch(() => ({}))
        const preds = Array.isArray(data?.predictions) ? data.predictions : []
        setAddressSuggestions(preds.map((p: any) => ({ description: p.description, place_id: p.place_id })).slice(0, 8))
      } catch { setAddressSuggestions([]) }
      finally { setAddressLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [locationQuery])

  const fetchOffers = async () => {
    try {
      const response = await fetch("/api/admin/special-offers")
      if (response.ok) setOffers(await response.json())
    } catch (error) { console.error("Error fetching offers:", error) }
    finally { setLoading(false) }
  }

  const fetchPharmacies = async () => {
    try {
      const response = await fetch("/api/admin/pharmacies")
      if (response.ok) setPharmacies(await response.json())
    } catch (error) { console.error("Error fetching pharmacies:", error) }
  }

  const setParticipationMode = (mode: "INVITATION" | "NONE") => {
    setFormData(prev => ({
      ...prev,
      participationMode: mode,
      enableInvitations: mode === "INVITATION",
      enablePaidSlots: false,
      slotPrice: "",
      maxPaidSlots: "",
      enableAiSelection: false,
    }))
  }

  const fetchCategoriesByModule = async (module: string) => {
    try {
      const res = await fetch(`/api/admin/categories?module=${encodeURIComponent(module)}&parentId=null&limit=200`)
      if (!res.ok) return
      const data = await res.json()
      const list = Array.isArray(data?.categories) ? data.categories : []
      setCategories(list.map((c: any) => ({
        id: c.id, name: c.name,
        children: Array.isArray(c.children) ? c.children.map((cc: any) => ({ id: cc.id, name: cc.name })) : [],
      })))
    } catch (e) { console.error("Failed to fetch categories:", e) }
  }

  // ✅ FIXED image upload — uses a ref-based approach
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: "imageUrl" | "bannerImageUrl") => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setUploadingImage(field)
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "special-offers")
      const res = await fetch("/api/admin/uploads/cloudinary", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data?.error || "Upload failed"); return }
      setFormData(prev => ({ ...prev, [field]: data?.url || "" }))
    } finally {
      setUploadingImage(null)
      // Reset the input value so the same file can be picked again
      e.target.value = ""
    }
  }

  const handleToggleArrayItem = (arrayName: "conditionsExcludeCategories" | "targetUserTypes", value: string) => {
    setFormData(prev => {
      const currentArray = prev[arrayName]
      if (currentArray.includes(value)) return { ...prev, [arrayName]: currentArray.filter(i => i !== value) }
      return { ...prev, [arrayName]: [...currentArray, value] }
    })
  }

  // Category selection helper:
  // - Allows selecting child IDs
  // - Auto-selects parent when any child is selected
  const handleToggleOfferCategory = (parentId: string, valueId: string) => {
    setFormData(prev => {
      const current = prev.conditionsExcludeCategories || []
      const isSelected = current.includes(valueId)
      let next = isSelected ? current.filter(i => i !== valueId) : [...current, valueId]

      // Auto-select parent if a child gets selected
      if (!isSelected && valueId !== parentId && !next.includes(parentId)) {
        next = [...next, parentId]
      }

      return { ...prev, conditionsExcludeCategories: next }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const selectedCategoryNames = (() => {
        const flat = (categories || []).flatMap((c: any) => [
          { id: c.id, name: c.name },
          ...(Array.isArray(c.children) ? c.children.map((cc: any) => ({ id: cc.id, name: cc.name })) : []),
        ])
        const names = flat
          .filter((x: any) => formData.conditionsExcludeCategories.includes(x.id))
          .map((x: any) => x.name)
          .filter(Boolean)
        return Array.from(new Set(names))
      })()

      const illnessTypes = Array.isArray(formData.conditionsIllnessTypes)
        ? formData.conditionsIllnessTypes.map((s) => String(s).trim()).filter(Boolean)
        : []

      const conditions =
        formData.module === "PHARMACY"
          ? {
              // CentralMedicine.category is a string; we store category NAMES here (admin selects from Category(module=PHARMACY))
              medicineCategories: selectedCategoryNames.length > 0 ? selectedCategoryNames : undefined,
              // CentralMedicine.illnessTypes is a JSON array; keep this filter separate from categories
              illnessTypes: illnessTypes.length > 0 ? illnessTypes : undefined,
            }
          : {
              minOrderAmount: formData.conditionsMinOrder ? Number(formData.conditionsMinOrder) : undefined,
              excludeCategoryIds: formData.conditionsExcludeCategories.length > 0 ? formData.conditionsExcludeCategories : undefined,
            }
      const targetAudience = {
        userTypes: formData.targetUserTypes.length > 0 ? formData.targetUserTypes : undefined,
        locations: formData.targetLocations ? formData.targetLocations.split(',').map(s => s.trim()).filter(Boolean) : undefined
      }
      const payload = {
        ...formData,
        validFrom: formData.validFrom.toISOString(),
        validUntil: formData.validUntil.toISOString(),
        conditions: Object.keys(conditions).length > 0 ? conditions : null,
        targetAudience: Object.keys(targetAudience).length > 0 ? targetAudience : null,
        locationLatitude: formData.locationLatitude ? Number(formData.locationLatitude) : null,
        locationLongitude: formData.locationLongitude ? Number(formData.locationLongitude) : null,
        locationRadiusKm: formData.locationRadiusKm ? Number(formData.locationRadiusKm) : null,
        maxVendors: formData.maxVendors ? Number(formData.maxVendors) : null,
        slotPrice: formData.slotPrice ? Number(formData.slotPrice) : null,
        maxPaidSlots: formData.maxPaidSlots ? Number(formData.maxPaidSlots) : null,
      }
      const url = editingOffer ? `/api/admin/special-offers/${editingOffer.id}` : "/api/admin/special-offers"
      const method = editingOffer ? "PUT" : "POST"
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (response.ok) { fetchOffers(); resetForm(); setIsSheetOpen(false) }
      else { const error = await response.json(); alert(`Error: ${error.message}`) }
    } catch (error) { console.error("Error saving offer:", error); alert("Error saving offer") }
    finally { setSaving(false) }
  }

  const handleEdit = async (offer: SpecialOffer) => {
    setEditingOffer(offer)
    await Promise.allSettled([
      fetchEligibleVendors((offer.module || "PHARMACY") as any),
      fetchCategoriesByModule((offer.module || "PHARMACY") as any),
    ])
    const parsedConditions = offer.conditions || {}
    const parsedAudience = offer.targetAudience || {}
    const mode: any = offer.enableInvitations ? "INVITATION" : "NONE"

    const pharmacyCategoryNames: string[] = Array.isArray(parsedConditions.medicineCategories)
      ? parsedConditions.medicineCategories
      : []
    const mappedPharmacyCategoryIds = (() => {
      if (pharmacyCategoryNames.length === 0) return []
      const norm = (s: any) => String(s || "").trim().toLowerCase()
      const map = new Map<string, string>()
      for (const c of categories || []) {
        if (c?.name) map.set(norm(c.name), c.id)
        const children = Array.isArray(c?.children) ? c.children : []
        for (const cc of children) {
          if (cc?.name) map.set(norm(cc.name), cc.id)
        }
      }
      const ids = pharmacyCategoryNames.map((n: string) => map.get(norm(n))).filter(Boolean) as string[]
      return Array.from(new Set(ids))
    })()

    setFormData({
      title: offer.title, subtitle: offer.subtitle || "", description: offer.description || "",
      module: (offer.module || "PHARMACY") as any, discountType: offer.discountType,
      discountValue: offer.discountValue, validFrom: new Date(offer.validFrom), validUntil: new Date(offer.validUntil),
      discountFundedBy: ((offer.discountFundedBy as any) || "PLATFORM") as any,
      imageUrl: offer.imageUrl || "", bannerImageUrl: offer.bannerImageUrl || "", isActive: offer.isActive,
      maxUses: offer.maxUses || undefined, pharmacyId: offer.pharmacyId || "",
      locationState: (offer.locationState as any) || "",
      locationLatitude: offer.locationLatitude != null ? String(offer.locationLatitude) : "",
      locationLongitude: offer.locationLongitude != null ? String(offer.locationLongitude) : "",
      locationRadiusKm: offer.locationRadiusKm != null ? String(offer.locationRadiusKm) : "",
      maxVendors: offer.maxVendors != null ? String(offer.maxVendors) : "",
      enableInvitations: offer.enableInvitations ?? true,
      enablePaidSlots: false,
      slotPrice: "",
      maxPaidSlots: "",
      enableAiSelection: false,
      participationMode: mode,
      conditionsMinOrder: parsedConditions.minOrderAmount || "",
      conditionsExcludeCategories:
        (offer.module === "PHARMACY"
          ? (mappedPharmacyCategoryIds.length > 0 ? mappedPharmacyCategoryIds : [])
          : (parsedConditions.excludeCategoryIds || parsedConditions.excludeCategories || [])) as any,
      conditionsIllnessTypes: Array.isArray(parsedConditions.illnessTypes) ? parsedConditions.illnessTypes : [],
      targetUserTypes: parsedAudience.userTypes || [],
      targetLocations: parsedAudience.locations ? parsedAudience.locations.join(", ") : ""
    })
    setIsSheetOpen(true)
    setOfferReportLive(false)
    // Load reporting data for this offer
    fetchOfferReport(offer.id, false)
  }

  const resetForm = () => {
    setFormData({
      title: "", subtitle: "", description: "", module: "PHARMACY", discountType: "PERCENTAGE", discountValue: 0,
      discountFundedBy: "PLATFORM", validFrom: new Date(), validUntil: new Date(), imageUrl: "", bannerImageUrl: "",
      isActive: true, maxUses: undefined, pharmacyId: "", locationState: "", locationLatitude: "", locationLongitude: "",
      locationRadiusKm: "",       maxVendors: "", enableInvitations: true, enablePaidSlots: false, slotPrice: "",
      maxPaidSlots: "", enableAiSelection: false, participationMode: "INVITATION", conditionsMinOrder: "", // Removed AI selection
      conditionsExcludeCategories: [], conditionsIllnessTypes: [], targetUserTypes: [], targetLocations: ""
    })
    setEditingOffer(null); setSelectedVendorIds([]); setVendors([])
    setVendorFilters({ city: "", search: "", minRating: "", minOrders: "" }); setLocationQuery("")
    setOfferReport(null); setOfferReportLoading(false); setOfferReportLive(false)
  }

  const fetchOfferReport = async (offerId: string, live?: boolean) => {
    try {
      setOfferReportLoading(true)
      const qp = (live ?? offerReportLive) ? "?live=1" : ""
      const res = await fetch(`/api/admin/special-offers/${offerId}/report${qp}`)
      if (!res.ok) {
        setOfferReport(null)
        return
      }
      const data = await res.json().catch(() => ({}))
      setOfferReport(data)
    } catch (e) {
      console.error("Failed to load offer report:", e)
      setOfferReport(null)
    } finally {
      setOfferReportLoading(false)
    }
  }

  const fetchEligibleVendors = async (module: string) => {
    try {
      const qp = new URLSearchParams({ module })
      if (vendorFilters.city) qp.set("city", vendorFilters.city)
      if (vendorFilters.search) qp.set("search", vendorFilters.search)
      if (vendorFilters.minRating) qp.set("minRating", vendorFilters.minRating)
      if (vendorFilters.minOrders) qp.set("minOrders", vendorFilters.minOrders)
      const res = await fetch(`/api/admin/special-offers/vendors?${qp.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setVendors(Array.isArray(data?.vendors) ? data.vendors : [])
    } catch (e) { console.error("Error fetching vendors:", e) }
  }

  const geocodeLocation = async (addressOverride?: string) => {
    const addr = (addressOverride ?? locationQuery).trim()
    if (!addr) return
    try {
      setGeocoding(true)
      const res = await fetch(`/api/location/geocode?address=${encodeURIComponent(addr)}`)
      const data = await res.json().catch(() => ({}))
      const first = data?.results?.[0]
      if (!first?.geometry?.location) return
      const lat = first.geometry.location.lat
      const lon = first.geometry.location.lng
      const components = Array.isArray(first.address_components) ? first.address_components : []
      const stateComp = components.find((c: any) => (c.types || []).includes("administrative_area_level_1"))
      setFormData(prev => ({ ...prev, locationLatitude: String(lat), locationLongitude: String(lon), locationState: stateComp?.long_name || prev.locationState }))
    } finally { setGeocoding(false) }
  }

  const addTargetLocationChip = (value: string) => {
    const v = value.trim(); if (!v) return
    const current = (formData.targetLocations || "").split(",").map(s => s.trim()).filter(Boolean)
    if (current.some(x => x.toLowerCase() === v.toLowerCase())) return
    setFormData(prev => ({ ...prev, targetLocations: [...current, v].join(", ") }))
  }

  const removeTargetLocationChip = (value: string) => {
    const v = value.trim().toLowerCase()
    const next = (formData.targetLocations || "").split(",").map(s => s.trim()).filter(Boolean).filter(x => x.toLowerCase() !== v).join(", ")
    setFormData(prev => ({ ...prev, targetLocations: next }))
  }

  const inviteSelectedVendors = async () => {
    if (!editingOffer?.id || selectedVendorIds.length === 0) return
    try {
      setInviteLoading(true)
      const res = await fetch(`/api/admin/special-offers/${editingOffer.id}/invite`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorIds: selectedVendorIds }),
      })
      if (res.ok) { alert("Invitations sent."); setSelectedVendorIds([]) }
      else { const err = await res.json().catch(() => ({})); alert(err?.error || "Failed to invite vendors") }
    } finally { setInviteLoading(false) }
  }

  const runAutoSelect = async () => {
    if (!editingOffer?.id) return
    try {
      setAutoSelectLoading(true)
      const res = await fetch(`/api/admin/special-offers/${editingOffer.id}/auto-select`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: editingOffer.maxVendors || 50, fairnessDays: 30 }),
      })
      if (res.ok) { const data = await res.json(); alert(`Auto-selected and invited ${data?.invited || 0} vendors.`) }
      else { const err = await res.json().catch(() => ({})); alert(err?.error || "Failed to auto-select vendors") }
    } finally { setAutoSelectLoading(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this offer?")) return
    try {
      const res = await fetch(`/api/admin/special-offers/${id}`, { method: "DELETE" })
      if (res.ok) fetchOffers()
    } catch (e) { console.error("Delete offer error:", e) }
  }

  const toggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/special-offers/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !isActive }),
      })
      if (response.ok) fetchOffers()
    } catch (error) { console.error("Error toggling status:", error) }
  }

  const filteredOffers = offers.filter(o =>
    o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.module?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-slate-50">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <Ticket className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm">
            <Loader2 className="w-3 h-3 text-emerald-500 animate-spin" />
          </div>
        </div>
        <p className="text-sm font-medium text-slate-500">Loading campaigns…</p>
      </div>
    )
  }

  const totalActive = offers.filter(o => o.isActive).length
  const totalUses = offers.reduce((acc, o) => acc + (o.usedCount || 0), 0)

  const discountLabel = (offer: SpecialOffer) => {
    switch (offer.discountType) {
      case "PERCENTAGE": return `${offer.discountValue}% OFF`
      case "FIXED_AMOUNT": return `${currency}${offer.discountValue.toLocaleString()} OFF`
      case "BUY_ONE_GET_ONE": return "BOGO"
      case "FREE_DELIVERY": return "Free Delivery"
      default: return offer.discountType
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/80 pb-16">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 py-8 space-y-7">

        {/* ── Page Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-md shadow-emerald-200">
              <Ticket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Campaigns & Offers</h1>
              <p className="text-sm text-slate-500 mt-0.5">Manage promotions, vendor participation, and track redemptions.</p>
            </div>
          </div>

          <Sheet open={isSheetOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsSheetOpen(open) }}>
            <SheetTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 px-5 rounded-xl shadow-sm shadow-emerald-200 font-semibold gap-2">
                <Plus className="h-4 w-4" /> New Campaign
              </Button>
            </SheetTrigger>

            {/* ── Side Drawer ────────────────────────────────────────────── */}
            <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0 bg-slate-50 border-l border-slate-200 shadow-2xl overflow-hidden">
              <SheetHeader className="px-6 py-5 bg-white border-b border-slate-100 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                    {editingOffer ? <Edit className="w-4 h-4 text-emerald-700" /> : <Sparkles className="w-4 h-4 text-emerald-700" />}
                  </div>
                  <div>
                    <SheetTitle className="text-lg font-bold text-slate-900">
                      {editingOffer ? "Edit Campaign" : "New Campaign"}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-slate-500 mt-0.5">
                      Configure rules, targeting, and vendor automation.
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>

              <div className="overflow-y-auto flex-1 p-6">
                <form id="offer-form" onSubmit={handleSubmit}>
                  <Tabs defaultValue="general" className="w-full space-y-5">
                    <TabsList className="w-full grid grid-cols-3 bg-white border border-slate-100 p-1 rounded-xl shadow-sm h-10">
                      <TabsTrigger value="general" className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">
                        General
                      </TabsTrigger>
                      <TabsTrigger value="targeting" className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">
                        Targeting
                      </TabsTrigger>
                      <TabsTrigger value="vendors" className="rounded-lg text-xs font-semibold data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm transition-all">
                        Automation
                      </TabsTrigger>
                    </TabsList>

                    {/* TAB 1: General */}
                    <TabsContent value="general" className="space-y-4 focus:outline-none mt-0">
                      <SectionCard title="Basic Information">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Campaign Title <span className="text-red-500">*</span></Label>
                            <Input placeholder="e.g. Summer Health Fest" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} required className="h-9 bg-slate-50 border-slate-200 focus:bg-white focus:border-emerald-400 transition-colors" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Subtitle</Label>
                            <Input placeholder="e.g. Save big on vitamins" value={formData.subtitle} onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })} className="h-9 bg-slate-50 border-slate-200 focus:bg-white focus:border-emerald-400 transition-colors" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">Description</Label>
                          <Textarea placeholder="Explain the offer terms…" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows={2} className="resize-none bg-slate-50 border-slate-200 focus:bg-white focus:border-emerald-400 transition-colors text-sm" />
                        </div>
                      </SectionCard>

                      <SectionCard title="Discount & Schedule">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Module</Label>
                            <Select value={formData.module} onValueChange={(v: any) => setFormData({ ...formData, module: v })}>
                              <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-[200px] bg-white">
                                <SelectItem value="PHARMACY">Pharmacy</SelectItem>
                                <SelectItem value="GROCERY">Grocery</SelectItem>
                                <SelectItem value="FOOD">Food</SelectItem>
                                <SelectItem value="AUTO_PARTS">Auto Parts</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Discount Type</Label>
                            <Select value={formData.discountType} onValueChange={(v: any) => setFormData({ ...formData, discountType: v })}>
                              <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-[200px] bg-white">
                                <SelectItem value="PERCENTAGE">Percentage</SelectItem>
                                <SelectItem value="FIXED_AMOUNT">Fixed Amount</SelectItem>
                                <SelectItem value="BUY_ONE_GET_ONE">Buy One Get One</SelectItem>
                                <SelectItem value="FREE_DELIVERY">Free Delivery</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Value <span className="text-red-500">*</span></Label>
                            <Input type="number" min="0" value={formData.discountValue} onChange={(e) => setFormData({ ...formData, discountValue: parseFloat(e.target.value) || 0 })} required className="h-9 bg-slate-50 border-slate-200" />
                          </div>
                          <div className="space-y-1.5 col-span-2">
                            <Label className="text-xs font-semibold text-slate-600">Discount Funded By</Label>
                            <Select value={formData.discountFundedBy} onValueChange={(v: any) => setFormData({ ...formData, discountFundedBy: v })}>
                              <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent className="max-h-[200px] bg-white">
                                <SelectItem value="PLATFORM">Platform absorbs discount</SelectItem>
                                <SelectItem value="VENDOR">Vendor absorbs discount</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Max Uses</Label>
                            <Input type="number" placeholder="∞ Unlimited" value={formData.maxUses || ""} onChange={(e) => setFormData({ ...formData, maxUses: e.target.value ? parseInt(e.target.value) : undefined })} className="h-9 bg-slate-50 border-slate-200" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                          {[
                            { label: "Valid From", key: "validFrom" as const },
                            { label: "Valid Until", key: "validUntil" as const },
                          ].map(({ label, key }) => (
                            <div key={key} className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-600">{label}</Label>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button variant="outline" className="w-full h-9 justify-start text-left font-normal text-sm bg-slate-50 border-slate-200 hover:bg-white">
                                    <CalendarIcon className="mr-2 h-3.5 w-3.5 text-slate-400" />
                                    {formData[key] ? format(formData[key], "MMM d, yyyy") : "Pick a date"}
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent portalled={false} className="w-auto p-0 bg-white shadow-xl">
                                  <Calendar mode="single" selected={formData[key]} onSelect={(d) => d && setFormData({ ...formData, [key]: d })} initialFocus />
                                </PopoverContent>
                              </Popover>
                            </div>
                          ))}
                        </div>
                      </SectionCard>

                      <SectionCard title="Media Assets">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <ImageUploadBox
                            label="Thumbnail"
                            hint="PNG, JPG · Max 2 MB"
                            value={formData.imageUrl}
                            uploading={uploadingImage === "imageUrl"}
                            onUpload={handleFileUpload}
                            onClear={() => setFormData({ ...formData, imageUrl: "" })}
                            field="imageUrl"
                            icon={ImageIcon}
                          />
                          <ImageUploadBox
                            label="Banner (Wide)"
                            hint="Recommended 1200×400 px"
                            value={formData.bannerImageUrl}
                            uploading={uploadingImage === "bannerImageUrl"}
                            onUpload={handleFileUpload}
                            onClear={() => setFormData({ ...formData, bannerImageUrl: "" })}
                            field="bannerImageUrl"
                            icon={ImageIcon}
                            aspectClass="h-40"
                          />
                        </div>
                      </SectionCard>
                    </TabsContent>

                    

                    {/* TAB 2: Targeting */}


                   

                    <TabsContent value="targeting" className="space-y-4 focus:outline-none mt-0">

                    <SectionCard title="Geofencing">
                        {formData.module === "PHARMACY" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Specific Pharmacy (Optional)</Label>
                            <Select value={formData.pharmacyId} onValueChange={(v) => setFormData({ ...formData, pharmacyId: v || '' })}>
                              <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm"><SelectValue placeholder="All network pharmacies" /></SelectTrigger>
                              <SelectContent className="max-h-[200px] bg-white">
                                <SelectItem value="all_pharmacies">All Pharmacies</SelectItem>
                                {pharmacies.map((p) => <SelectItem key={p.id} value={p.id}>{p.pharmacyName}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">Address Geocoder</Label>
                          <div className="flex gap-2">
                            <Input placeholder="Search an address…" value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} className="h-9 bg-slate-50 border-slate-200 text-sm flex-1" />
                            <Button type="button" variant="secondary" disabled={geocoding || !locationQuery.trim()} onClick={() => geocodeLocation()} className="h-9 px-4 text-xs font-semibold">
                              {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                          {addressSuggestions.length > 0 && (
                            <div className="rounded-lg border border-slate-100 bg-white shadow-md overflow-hidden text-xs">
                              {addressSuggestions.map((s) => (
                                <button type="button" key={s.place_id} className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b border-slate-50 last:border-0 text-slate-700 flex items-center gap-2" onClick={() => { setLocationQuery(s.description); setAddressSuggestions([]); setTimeout(() => geocodeLocation(s.description), 0) }}>
                                  <MapPin className="w-3 h-3 text-slate-400 flex-shrink-0" /> {s.description}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[{ label: "Latitude", key: "locationLatitude" }, { label: "Longitude", key: "locationLongitude" }, { label: "Radius (km)", key: "locationRadiusKm" }].map(({ label, key }) => (
                            <div key={key} className="space-y-1.5">
                              <Label className="text-xs font-semibold text-slate-600">{label}</Label>
                              <Input type="number" step="any" value={(formData as any)[key]} onChange={(e) => setFormData({ ...formData, [key]: e.target.value })} className="h-9 bg-slate-50 border-slate-200 text-sm" />
                            </div>
                          ))}
                        </div>
                      </SectionCard>
                      
                      <SectionCard title="Audience">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">Target User Types</Label>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {USER_TYPES.map(type => (
                              <label key={type} className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-semibold transition-all",
                                formData.targetUserTypes.includes(type)
                                  ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                                  : "bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
                              )}>
                                <Checkbox
                                  checked={formData.targetUserTypes.includes(type)}
                                  onCheckedChange={() => handleToggleArrayItem("targetUserTypes", type)}
                                  className="h-3.5 w-3.5 border-current data-[state=checked]:bg-white data-[state=checked]:border-white"
                                />
                                {type.replace('_', ' ')}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-2 pt-1">
                          <Label className="text-xs font-semibold text-slate-600">Target Locations</Label>
                          <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                            {(formData.targetLocations || "").split(",").map(s => s.trim()).filter(Boolean).map((loc) => (
                              <span key={loc} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-white">
                                {loc}
                                <button type="button" onClick={() => removeTargetLocationChip(loc)} className="text-slate-400 hover:text-white transition-colors">
                                  <X className="w-3 h-3" />
                                </button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Input placeholder="Type a state or city…" value={formData.targetLocations} onChange={(e) => setFormData({ ...formData, targetLocations: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const parts = (formData.targetLocations || "").split(",").map(s => s.trim()).filter(Boolean); const last = parts[parts.length - 1]; if (last) addTargetLocationChip(last) } }} className="h-9 bg-slate-50 border-slate-200 text-sm" />
                            <Button type="button" variant="secondary" className="h-9 px-4 text-xs font-semibold" onClick={() => { const parts = (formData.targetLocations || "").split(",").map(s => s.trim()).filter(Boolean); const last = parts[parts.length - 1]; if (last) addTargetLocationChip(last) }}>Add</Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={sublocalitiesLoading || !geofenceCacheKey()}
                              className="h-9 px-3 text-xs font-semibold border-slate-200"
                              onClick={() => loadSublocalitiesForGeofence()}
                              title={!geofenceCacheKey() ? "Set geofence latitude/longitude first" : "Load sublocalities from geofence (cached)"}
                            >
                              {sublocalitiesLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5 mr-1.5" />}
                              Areas
                            </Button>
                          </div>
                          {!!sublocalities.length && (
                            <div className="mt-2 rounded-lg border border-slate-100 bg-white p-3">
                              <div className="flex items-center justify-between gap-3 mb-2">
                                <p className="text-[11px] font-semibold text-slate-500">Suggested sublocalities (cached per geofence)</p>
                                <Input
                                  placeholder="Filter…"
                                  value={sublocalitiesSearch}
                                  onChange={(e) => setSublocalitiesSearch(e.target.value)}
                                  className="h-8 w-40 bg-slate-50 border-slate-200 text-xs"
                                />
                              </div>
                              <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {sublocalities
                                  .filter((x) => !sublocalitiesSearch.trim() || x.toLowerCase().includes(sublocalitiesSearch.trim().toLowerCase()))
                                  .slice(0, 200)
                                  .map((loc) => {
                                    const selected = (formData.targetLocations || "")
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                      .some((x) => x.toLowerCase() === loc.toLowerCase())
                                    return (
                                      <label
                                        key={loc}
                                        className={cn(
                                          "flex items-center gap-2 p-2 rounded-md border cursor-pointer text-xs font-semibold transition-colors",
                                          selected ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-slate-100 text-slate-700 hover:bg-slate-50",
                                        )}
                                      >
                                        <Checkbox
                                          checked={selected}
                                          onCheckedChange={(c) => {
                                            c ? addTargetLocationChip(loc) : removeTargetLocationChip(loc)
                                          }}
                                          className="h-3.5 w-3.5"
                                        />
                                        {loc}
                                      </label>
                                    )
                                  })}
                              </div>
                            </div>
                          )}
                          <p className="text-[11px] text-slate-400">Leave blank for global targeting.</p>
                        </div>
                      </SectionCard>

                     

                      <SectionCard title="Order Conditions">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">Minimum Order Amount ({currency})</Label>
                          <Input type="number" placeholder="0" value={formData.conditionsMinOrder} onChange={(e) => setFormData({ ...formData, conditionsMinOrder: e.target.value })} className="h-9 bg-slate-50 border-slate-200 text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-slate-600">{formData.module === "PHARMACY" ? "Applicable Medicine Categories" : "Exclude Categories"}</Label>
                          <div className="bg-slate-50 border border-slate-100 rounded-lg max-h-44 overflow-y-auto p-3 space-y-2">
                            {categories.length === 0 ? (
                              <p className="text-xs text-slate-400 italic">No categories found for {formData.module}.</p>
                            ) : categories.map((cat) => (
                              <div key={cat.id} className="space-y-1">
                                <label
                                  className={cn(
                                    "flex items-center gap-2.5 cursor-pointer text-xs font-medium p-1.5 rounded-md transition-colors",
                                    formData.conditionsExcludeCategories.includes(cat.id)
                                      ? "bg-emerald-50 text-emerald-800"
                                      : "text-slate-700 hover:bg-white"
                                  )}
                                >
                                  <Checkbox
                                    checked={formData.conditionsExcludeCategories.includes(cat.id)}
                                    onCheckedChange={() => handleToggleOfferCategory(cat.id, cat.id)}
                                    className="h-3.5 w-3.5"
                                  />
                                  {cat.name}
                                </label>

                                {Array.isArray(cat.children) && cat.children.length > 0 && (
                                  <div className="pl-6 space-y-1">
                                    {cat.children.map((child) => (
                                      <label
                                        key={child.id}
                                        className={cn(
                                          "flex items-center gap-2.5 cursor-pointer text-[11px] font-medium p-1.5 rounded-md transition-colors",
                                          formData.conditionsExcludeCategories.includes(child.id)
                                            ? "bg-emerald-50 text-emerald-800"
                                            : "text-slate-600 hover:bg-white"
                                        )}
                                      >
                                        <Checkbox
                                          checked={formData.conditionsExcludeCategories.includes(child.id)}
                                          onCheckedChange={() => handleToggleOfferCategory(cat.id, child.id)}
                                          className="h-3.5 w-3.5"
                                        />
                                        {child.name}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {formData.module === "PHARMACY" && (
                            <p className="text-[11px] text-slate-400">
                              These are standard categories (Category model, module=PHARMACY). They will be matched against <code className="font-mono">CentralMedicine.category</code>.
                            </p>
                          )}
                        </div>
                        {formData.module === "PHARMACY" && (
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Illness Types (multi-select)</Label>
                            <div className="bg-slate-50 border border-slate-100 rounded-lg max-h-44 overflow-y-auto p-3 space-y-2">
                              {illnessOptions.filter((x) => x.isActive).length === 0 ? (
                                <p className="text-xs text-slate-400 italic">No illness categories found.</p>
                              ) : (
                                illnessOptions
                                .filter((x) => x.isActive)
                                .map((opt) => {
                                  const selected = (formData.conditionsIllnessTypes || []).includes(opt.name)
                              
                                  return (
                                    <label
                                      key={opt.id}
                                      className={cn(
                                        "flex items-center gap-2.5 cursor-pointer text-xs font-medium p-1.5 rounded-md transition-colors",
                                        selected ? "bg-emerald-50 text-emerald-800" : "text-slate-700 hover:bg-white",
                                      )}
                                    >
                                      <Checkbox
                                        checked={selected}
                                        onCheckedChange={(c) => {
                                          setFormData((prev) => {
                                            const current = Array.isArray(prev.conditionsIllnessTypes)
                                              ? prev.conditionsIllnessTypes
                                              : []
                              
                                            let next
                              
                                            if (c) {
                                              next = current.includes(opt.name)
                                                ? current
                                                : [...current, opt.name]
                                            } else {
                                              next = current.filter((x) => x !== opt.name)
                                            }
                              
                                            return { ...prev, conditionsIllnessTypes: next }
                                          })
                                        }}
                                        className="h-3.5 w-3.5"
                                      />
                              
                                      {opt.displayName}
                                    </label>
                                  )
                                  })
                              )}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              This is separate from categories and will be matched against <code className="font-mono">CentralMedicine.illnessTypes</code>.
                            </p>
                          </div>
                        )}
                      </SectionCard>
                    </TabsContent>

                    {/* TAB 3: Automation */}
                    <TabsContent value="vendors" className="space-y-4 focus:outline-none mt-0">
                      <SectionCard title="Campaign Operations">
                        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 p-4 rounded-xl border border-emerald-100">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">Publish Campaign</p>
                            <p className="text-xs text-slate-500 mt-0.5">Toggle off to save as draft.</p>
                          </div>
                          <Switch checked={formData.isActive} onCheckedChange={(c) => setFormData({ ...formData, isActive: c })} className="data-[state=checked]:bg-emerald-600" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Participation Mode</Label>
                            <Select value={formData.participationMode} onValueChange={(v: any) => setParticipationMode(v as any)}>
                              <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="INVITATION">Invitation Only</SelectItem>
                                <SelectItem value="NONE">Global Network</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold text-slate-600">Max Vendors</Label>
                            <Input type="number" value={formData.maxVendors} onChange={(e) => setFormData({ ...formData, maxVendors: e.target.value })} placeholder="Unlimited" className="h-9 bg-slate-50 border-slate-200 text-sm" />
                          </div>
                        </div>
                        {/* Paid slot configuration removed */}
                      </SectionCard>

                      {editingOffer?.id && (
                        <SectionCard title="Offer Performance & Profitability">
                          <div className="flex flex-wrap items-center gap-3 mb-3">
                            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                              <input
                                type="checkbox"
                                className="rounded border-slate-300"
                                checked={offerReportLive}
                                onChange={(e) => {
                                  const c = e.target.checked
                                  setOfferReportLive(c)
                                  if (editingOffer?.id) void fetchOfferReport(editingOffer.id, c)
                                }}
                              />
                              Live from delivered orders (recalculates from order lines)
                            </label>
                            {offerReport?.source && (
                              <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                Source: {offerReport.source}
                              </span>
                            )}
                          </div>
                          {offerReportLoading ? (
                            <div className="text-xs text-slate-500">Loading report…</div>
                          ) : !offerReport?.summary ? (
                            <div className="text-xs text-slate-500">
                              No report available yet. Reports are generated automatically when offers expire via the cron job, or enable &quot;Live from delivered orders&quot; above.
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Orders</p>
                                  <p className="text-lg font-bold text-slate-900 tabular-nums">
                                    {offerReport.summary.totalOrders}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Units Sold</p>
                                  <p className="text-lg font-bold text-slate-900 tabular-nums">
                                    {offerReport.summary.totalUnits}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Gross Sales</p>
                                  <p className="text-lg font-bold text-emerald-700 tabular-nums">
                                    {currency} {offerReport.summary.grossSales.toFixed(0)}
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Total Discount</p>
                                  <p className="text-xs text-slate-700">
                                    <span className="font-semibold text-emerald-700">{currency} {offerReport.summary.discountPlatform.toFixed(0)}</span>
                                    <span className="text-[10px] text-slate-500 ml-1">Platform</span>
                                  </p>
                                  <p className="text-xs text-slate-700">
                                    <span className="font-semibold text-amber-700">{currency} {offerReport.summary.discountVendor.toFixed(0)}</span>
                                    <span className="text-[10px] text-slate-500 ml-1">Vendors</span>
                                  </p>
                                </div>
                                <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Vendor net (merch.)</p>
                                  <p className="text-lg font-bold text-slate-900 tabular-nums">
                                    {currency}{" "}
                                    {(offerReport.summary.netVendorMerchandise ?? offerReport.summary.grossSales - offerReport.summary.discountVendor).toFixed(0)}
                                  </p>
                                </div>
                              </div>

                              {Array.isArray(offerReport.vendors) && offerReport.vendors.length > 0 && (
                                <div className="border border-slate-100 rounded-xl overflow-hidden">
                                  <Table>
                                    <TableHeader className="bg-slate-50/60">
                                      <TableRow>
                                        <TableHead className="text-xs font-semibold text-slate-600">Vendor</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 text-right">Orders</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 text-right">Units</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 text-right">Sales</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 text-right">Platform Disc.</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 text-right">Vendor Disc.</TableHead>
                                        <TableHead className="text-xs font-semibold text-slate-600 text-right">Vendor net</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {offerReport.vendors.map((v: any) => (
                                        <TableRow key={v.vendorId || v.vendorName}>
                                          <TableCell className="text-xs font-medium text-slate-800">{v.vendorName}</TableCell>
                                          <TableCell className="text-right text-xs tabular-nums">{v.totalOrders}</TableCell>
                                          <TableCell className="text-right text-xs tabular-nums">{v.totalUnits}</TableCell>
                                          <TableCell className="text-right text-xs tabular-nums">
                                            {currency} {v.grossSales.toFixed(0)}
                                          </TableCell>
                                          <TableCell className="text-right text-[11px] tabular-nums text-emerald-700">
                                            {currency} {v.discountPlatform.toFixed(0)}
                                          </TableCell>
                                          <TableCell className="text-right text-[11px] tabular-nums text-amber-700">
                                            {currency} {v.discountVendor.toFixed(0)}
                                          </TableCell>
                                          <TableCell className="text-right text-xs tabular-nums font-semibold text-slate-900">
                                            {currency}{" "}
                                            {(v.netVendorMerchandise ?? v.grossSales - v.discountVendor).toFixed(0)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                            </div>
                          )}
                        </SectionCard>
                      )}

                      {editingOffer?.id && formData.participationMode !== "NONE" && (
                        <SectionCard title="Vendor Recruitment Hub">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { ph: "City (Required)", key: "city" },
                              { ph: "Search name…", key: "search" },
                              { ph: "Min Rating", key: "minRating" },
                              { ph: "Min Orders", key: "minOrders" },
                            ].map(({ ph, key }) => (
                              <Input key={key} placeholder={ph} value={(vendorFilters as any)[key]} onChange={(e) => setVendorFilters(p => ({ ...p, [key]: e.target.value }))} className="h-8 bg-slate-50 border-slate-200 text-xs" />
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <Button type="button" variant="outline" className="h-9 text-xs font-semibold border-slate-200 hover:border-emerald-400 hover:bg-emerald-50" disabled={formData.participationMode !== "INVITATION" || !vendorFilters.city} onClick={() => fetchEligibleVendors(formData.module)}>
                              <Search className="w-3.5 h-3.5 mr-1.5" /> Search
                            </Button>
                            <Button type="button" className="h-9 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white" disabled={autoSelectLoading} onClick={runAutoSelect}>
                              {autoSelectLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1.5" />} System Auto-Select
                            </Button>
                          </div>
                          {vendors.length > 0 && (
                            <div className="border border-slate-100 bg-white rounded-xl overflow-hidden max-h-44 overflow-y-auto divide-y divide-slate-50">
                              {vendors.map((v) => {
                                const checked = selectedVendorIds.includes(v.userId)
                                return (
                                  <label key={v.userId} className={cn("flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors", checked ? "bg-blue-50" : "hover:bg-slate-50")}>
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(c) => {
                                        c
                                          ? setSelectedVendorIds((p) => (p.includes(v.userId) ? p : [...p, v.userId]))
                                          : setSelectedVendorIds((p) => p.filter((id) => id !== v.userId))
                                      }}
                                      className="h-3.5 w-3.5"
                                    />
                                    <span className="text-xs font-semibold text-slate-800 flex-1">{v.name}</span>
                                    <span className="text-[10px] font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">★ {v.rating}</span>
                                    <span className="text-[10px] text-slate-400">{v.totalOrders} orders</span>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                          <div className="flex items-center gap-2 pt-1">
                            <Button type="button" className="h-9 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white" disabled={formData.participationMode !== "INVITATION" || inviteLoading || selectedVendorIds.length === 0} onClick={inviteSelectedVendors}>
                              {inviteLoading && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />} Invite Selected ({selectedVendorIds.length})
                            </Button>
                            {selectedVendorIds.length > 0 && (
                              <Button type="button" variant="ghost" onClick={() => setSelectedVendorIds([])} className="h-9 text-xs font-semibold text-slate-500 hover:text-slate-700">Clear</Button>
                            )}
                          </div>
                        </SectionCard>
                      )}
                    </TabsContent>
                  </Tabs>
                </form>
              </div>

              <SheetFooter className="bg-white border-t border-slate-100 px-6 py-4 flex-shrink-0">
                <div className="flex w-full justify-between items-center">
                  <Button type="button" variant="ghost" onClick={() => setIsSheetOpen(false)} className="text-sm font-semibold text-slate-500 hover:text-slate-700">
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    form="offer-form"
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white font-semibold px-6 rounded-xl shadow-sm shadow-emerald-200"
                  >
                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {saving ? (editingOffer ? "Saving…" : "Creating…") : (editingOffer ? "Save Changes" : "Create Campaign")}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Campaigns" value={totalActive} icon={Activity} colorClass="bg-emerald-100 text-emerald-600" />
          <StatCard label="Total Redemptions" value={totalUses} icon={TrendingUp} colorClass="bg-blue-100 text-blue-600" />
          <StatCard
            label="Avg. Discount"
            value={`${offers.length ? Math.round(offers.reduce((a, b) => a + (b.discountType === 'PERCENTAGE' ? b.discountValue : 0), 0) / (offers.filter(o => o.discountType === 'PERCENTAGE').length || 1)) : 0}%`}
            icon={Tag}
            colorClass="bg-purple-100 text-purple-600"
          />
          <StatCard label="System Selected" value={offers.length} icon={Wand2} colorClass="bg-amber-100 text-amber-600" />
        </div>

        {/* ── Chart ───────────────────────────────────────────────────────── */}
        <Card className="shadow-sm border-slate-100 overflow-hidden bg-white">
          <CardHeader className="px-6 pt-5 pb-4 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">Redemption Trends</CardTitle>
                <CardDescription className="text-xs">Monthly coupon usage across all modules.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-5 pb-4">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mockChartData} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="colG" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', padding: '8px 14px', fontSize: 12 }}
                    itemStyle={{ color: '#059669', fontWeight: 700 }}
                    labelStyle={{ color: '#475569', fontWeight: 600, marginBottom: 4 }}
                  />
                  <Area type="monotone" dataKey="redemptions" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colG)" activeDot={{ r: 5, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ── Table ───────────────────────────────────────────────────────── */}
        <Card className="shadow-sm border-slate-100 overflow-hidden bg-white">
          <CardHeader className="px-6 pt-5 pb-4 border-b border-slate-50">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-base font-semibold text-slate-900">Campaign Directory</CardTitle>
                <CardDescription className="text-xs mt-0.5">Manage individual marketing campaigns.</CardDescription>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input placeholder="Search campaigns…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-9 bg-slate-50 border-slate-200 text-sm focus:bg-white" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60 border-b border-slate-100 hover:bg-slate-50/60">
                  <TableHead className="text-xs font-semibold text-slate-500 py-3 pl-6 uppercase tracking-wide">Campaign</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Discount</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wi
                  
                  
                  
                  
                  
                  de text-center">Uses</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wide text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOffers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-52 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Ticket className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-sm font-medium text-slate-400">No campaigns found</p>
                        <p className="text-xs text-slate-300">Create your first campaign to get started.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredOffers.map((offer) => (
                  <TableRow key={offer.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors group">
                    <TableCell className="py-4 pl-6">
                      <div className="flex items-center gap-3">
                        {/* Mini color stripe */}
                        <div className={cn("w-1 h-10 rounded-full flex-shrink-0", offer.isActive ? "bg-emerald-400" : "bg-slate-200")} />
                        <div>
                          <p className="font-semibold text-sm text-slate-900">{offer.title}</p>
                          {offer.subtitle && <p className="text-xs text-slate-400 mt-0.5">{offer.subtitle}</p>}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", MODULE_COLORS[offer.module || "PHARMACY"])}>
                              {offer.module}
                            </span>
                            {offer.pharmacy && (
                              <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">Targeted</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100">
                        {discountLabel(offer)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-xs space-y-0.5">
                        <p className="font-semibold text-slate-700">{format(new Date(offer.validFrom), "MMM d, yyyy")}</p>
                        <p className="text-slate-400">→ {format(new Date(offer.validUntil), "MMM d, yyyy")}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-lg tabular-nums">
                        {offer.usedCount}<span className="text-slate-300 font-normal">/{offer.maxUses || "∞"}</span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={offer.isActive} onCheckedChange={() => toggleActive(offer.id, offer.isActive)} className="data-[state=checked]:bg-emerald-500 scale-90" />
                        <span className={cn("text-xs font-semibold", offer.isActive ? "text-emerald-600" : "text-slate-400")}>
                          {offer.isActive ? "Live" : "Draft"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleEdit(offer)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(offer.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}