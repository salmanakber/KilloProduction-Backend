"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import {
  Settings,
  Layers,
  MapPin,
  ShieldCheck,
  Plus,
  Trash2,
  Edit,
  UploadCloud,
  FileText,
  XCircle,
  Clock,
  Info,
  CheckCircle,
  Users,
  Compass,
  AlertCircle,
  Check,
  Search,
  Loader2,
  ExternalLink, // Added for documentation helper link
  // Stay Representation Icons
  Bed,
  Building2,
  Home,
  Trees,
  Palmtree,
  Waves,
  Castle,
  Tent,
  Ship,
  Mountain,
  Dumbbell,
  Utensils,
  Coffee,
  GlassWater,
  Snowflake,
  Flame,
  Wifi,
  CircleParking,
  Footprints,
  Tv,
  Crown,
  Star,
  Heart,
  TrendingUp,
  FolderOpen,
} from "lucide-react"

interface BookingCategory {
  id: string
  name: string
  slug: string
  description: string
  image: string
  icon?: string
  isActive: boolean
  propertyCount: number
  minimumNights: number
}

interface TravelDestination {
  id: string
  cityName: string
  country: string
  stateRegion: string
  image: string
  isActive: boolean
  isFeatured: boolean
  totalStays: number
  tourismLevyRate: number
}

const DESTINATION_COUNTRIES = [
  "Nigeria",
  "Pakistan",
  "United Arab Emirates",
  "Saudi Arabia",
  "United Kingdom",
  "United States",
  "Canada",
  "India",
  "Kenya",
  "South Africa",
  "Ghana",
  "Egypt",
  "Turkey",
  "Qatar",
  "Oman",
]

interface ComplianceCheck {
  id: string
  documentName: string
  isRequired: boolean
  userType: "HOST" | "GUEST"
  requiresUpload?: boolean
  allowMultipleFiles?: boolean
  allowCamera?: boolean
  description: string
}

interface CollectionFolderRow {
  id: string
  label: string
  icon: string
  isActive: boolean
}

// Curated Hospitality Icons for mobile application maps and categories
const MATERIAL_COMMUNITY_ICONS = [
    // Lodging Types
    { name: "Hotel", value: "bed", category: "Lodging" },
    { name: "Resort", value: "island", category: "Lodging" },
    { name: "Apartment", value: "office-building", category: "Lodging" },
    { name: "Villa", value: "home-city", category: "Lodging" },
    { name: "House", value: "home", category: "Lodging" },
    { name: "Cabin", value: "pine-tree", category: "Lodging" },
    { name: "Cottage", value: "home-heart", category: "Lodging" },
    { name: "Hostel", value: "bunk-bed", category: "Lodging" },
    { name: "Guest House", value: "account-group", category: "Lodging" },
    { name: "Motel", value: "road", category: "Lodging" },
    { name: "Luxury Stay", value: "castle", category: "Lodging" },
    { name: "Farm Stay", value: "barn", category: "Lodging" },
    { name: "Tree House", value: "tree", category: "Lodging" },
    { name: "Tent / Camping", value: "tent", category: "Lodging" },
    { name: "RV / Caravan", value: "caravan", category: "Lodging" },
    { name: "Boat Stay", value: "ferry", category: "Lodging" },
    { name: "Beach House", value: "beach", category: "Lodging" },
    { name: "Mountain Lodge", value: "mountain", category: "Lodging" },
    { name: "City Apartment", value: "city-variant", category: "Lodging" },
    { name: "Dormitory", value: "bed-queen", category: "Lodging" },
  
    // Amenities
    { name: "Swimming Pool", value: "pool", category: "Amenities" },
    { name: "Private Pool", value: "pool", category: "Amenities" },
    { name: "Hot Tub / Jacuzzi", value: "hot-tub", category: "Amenities" },
    { name: "Spa", value: "spa", category: "Amenities" },
    { name: "Gym / Fitness", value: "dumbbell", category: "Amenities" },
    { name: "Restaurant", value: "silverware-fork-knife", category: "Amenities" },
    { name: "Breakfast Included", value: "coffee", category: "Amenities" },
    { name: "Bar / Lounge", value: "glass-cocktail", category: "Amenities" },
    { name: "Air Conditioning", value: "snowflake", category: "Amenities" },
    { name: "Heating", value: "fire", category: "Amenities" },
    { name: "Fireplace", value: "fireplace", category: "Amenities" },
    { name: "Kitchen", value: "stove", category: "Amenities" },
    { name: "Wifi", value: "wifi", category: "Amenities" },
    { name: "Parking", value: "parking", category: "Amenities" },
    { name: "Pet Friendly", value: "paw", category: "Amenities" },
    { name: "Laundry", value: "washing-machine", category: "Amenities" },
    { name: "Elevator", value: "elevator", category: "Amenities" },
    { name: "Workspace", value: "desk", category: "Amenities" },
    { name: "TV / Entertainment", value: "television", category: "Amenities" },
    { name: "Security", value: "shield-check", category: "Amenities" },
    { name: "Room Service", value: "room-service", category: "Amenities" },
    { name: "Balcony", value: "balcony", category: "Amenities" },
    { name: "Keyless Entry", value: "key-wireless", category: "Amenities" },
    { name: "Wheelchair Access", value: "wheelchair-accessibility", category: "Amenities" },
  
    // Outdoors / Views
    { name: "Beach", value: "beach", category: "Outdoors" },
    { name: "Island", value: "island", category: "Outdoors" },
    { name: "Forest", value: "forest", category: "Outdoors" },
    { name: "Mountain", value: "mountain", category: "Outdoors" },
    { name: "Lake View", value: "waves", category: "Outdoors" },
    { name: "Ocean View", value: "waves-arrow-right", category: "Outdoors" },
    { name: "Garden", value: "flower", category: "Outdoors" },
    { name: "Campfire", value: "campfire", category: "Outdoors" },
    { name: "Hiking", value: "hiking", category: "Outdoors" },
    { name: "Ski Resort", value: "ski", category: "Outdoors" },
    { name: "Desert Stay", value: "weather-sunny-alert", category: "Outdoors" },
    { name: "Countryside", value: "tractor", category: "Outdoors" },
  
    // Booking / Travel
    { name: "Booking", value: "calendar-check", category: "Travel" },
    { name: "Check In", value: "login", category: "Travel" },
    { name: "Check Out", value: "logout", category: "Travel" },
    { name: "Location", value: "map-marker", category: "Travel" },
    { name: "Directions", value: "map-search", category: "Travel" },
    { name: "Airport Shuttle", value: "shuttle-van", category: "Travel" },
    { name: "Taxi", value: "taxi", category: "Travel" },
    { name: "Flight", value: "airplane", category: "Travel" },
    { name: "Passport", value: "passport", category: "Travel" },
    { name: "Suitcase", value: "bag-suitcase", category: "Travel" },
    { name: "Luggage", value: "bag-carry-on", category: "Travel" },
    { name: "Travel Guide", value: "map", category: "Travel" },
  
    // Ratings / Premium
    { name: "Star Rating", value: "star", category: "Ratings" },
    { name: "Premium", value: "crown", category: "Ratings" },
    { name: "Verified", value: "check-decagram", category: "Ratings" },
    { name: "Favorite", value: "heart", category: "Ratings" },
    { name: "Trending", value: "trending-up", category: "Ratings" },
]

// Dynamic Icon translation engine linking MaterialCommunityIcons value with Web components
function RenderMaterialIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  switch (name) {
    case "bed":
    case "bed-king":
    case "bed-queen":
    case "bunk-bed":
      return <Bed className={className} />
    case "office-building":
    case "city-variant":
      return <Building2 className={className} />
    case "home":
    case "home-city":
    case "home-heart":
      return <Home className={className} />
    case "pine-tree":
    case "tree":
    case "forest":
      return <Trees className={className} />
    case "island":
    case "beach":
      return <Palmtree className={className} />
    case "pool":
    case "waves":
    case "waves-arrow-right":
      return <Waves className={className} />
    case "castle":
      return <Castle className={className} />
    case "tent":
    case "campfire":
      return <Tent className={className} />
    case "ferry":
      return <Ship className={className} />
    case "mountain":
    case "hiking":
      return <Mountain className={className} />
    case "dumbbell":
      return <Dumbbell className={className} />
    case "silverware-fork-knife":
      return <Utensils className={className} />
    case "coffee":
      return <Coffee className={className} />
    case "glass-cocktail":
      return <GlassWater className={className} />
    case "snowflake":
      return <Snowflake className={className} />
    case "fire":
    case "fireplace":
      return <Flame className={className} />
    case "wifi":
      return <Wifi className={className} />
    case "parking":
      return <CircleParking className={className} />
    case "paw":
      return <Footprints className={className} />
    case "television":
      return <Tv className={className} />
    case "shield-check":
      return <ShieldCheck className={className} />
    case "crown":
      return <Crown className={className} />
    case "star":
      return <Star className={className} />
    case "heart":
      return <Heart className={className} />
    case "trending-up":
      return <TrendingUp className={className} />
    default:
      return <Compass className={className} />
  }
}

export default function BookingConfiguration() {
  const [activeTab, setActiveTab] = useState<"categories" | "destinations" | "folders" | "compliance">("categories")
  const [configLoading, setConfigLoading] = useState(true)
  const [configSaving, setConfigSaving] = useState(false)
  
  // App States
  const [categories, setCategories] = useState<BookingCategory[]>([])
  const [destinations, setDestinations] = useState<TravelDestination[]>([])
  const [complianceChecks, setComplianceChecks] = useState<ComplianceCheck[]>([])
  const [collectionFolders, setCollectionFolders] = useState<CollectionFolderRow[]>([])

  // Modal Control States
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showDestinationModal, setShowDestinationModal] = useState(false)
  const [showFolderModal, setShowFolderModal] = useState(false)
  const [showComplianceModal, setShowComplianceModal] = useState(false)
  
  const [editCategoryTarget, setEditCategoryTarget] = useState<BookingCategory | null>(null)
  const [editDestinationTarget, setEditDestinationTarget] = useState<TravelDestination | null>(null)
  const [destinationModalMode, setDestinationModalMode] = useState<"add" | "edit">("add")
  const [editComplianceTarget, setEditComplianceTarget] = useState<ComplianceCheck | null>(null)
  const [editFolderTarget, setEditFolderTarget] = useState<CollectionFolderRow | null>(null)

  // Forms States
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
    image: "",
    icon: "bed",
    minimumNights: 1,
    isActive: true
  })

  const [destinationForm, setDestinationForm] = useState({
    cityName: "",
    country: "Nigeria",
    stateRegion: "",
    image: "",
    tourismLevyRate: 5.0,
    isFeatured: false,
    isActive: true
  })

  const [complianceForm, setComplianceForm] = useState({
    documentName: "",
    isRequired: true,
    userType: "HOST" as "HOST" | "GUEST",
    requiresUpload: false,
    allowMultipleFiles: false,
    allowCamera: true,
    description: ""
  })

  const [folderForm, setFolderForm] = useState({
    label: "",
    icon: "folder-outline",
    isActive: true,
  })

  const [uploadingImage, setUploadingImage] = useState<null | "category" | "destination">(null)
  const [iconSearchTerm, setIconSearchTerm] = useState("")

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    return MATERIAL_COMMUNITY_ICONS.filter(icon => 
      icon.name.toLowerCase().includes(iconSearchTerm.toLowerCase()) ||
      icon.value.toLowerCase().includes(iconSearchTerm.toLowerCase()) ||
      icon.category.toLowerCase().includes(iconSearchTerm.toLowerCase())
    )
  }, [iconSearchTerm])

  // Image Upload handler
  const uploadConfigImage = async (file: File, target: "category" | "destination") => {
    setUploadingImage(target)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder", "property/config")
      const res = await fetch("/api/admin/uploads/cloudinary", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed")
      if (target === "category") {
        setCategoryForm((prev) => ({ ...prev, image: data.url }))
      } else {
        setDestinationForm((prev) => ({ ...prev, image: data.url }))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setUploadingImage(null)
    }
  }

  // Basic Toggles
  const handleToggleCategory = (id: string) => {
    const next = categories.map(c => (c.id === id ? { ...c, isActive: !c.isActive } : c))
    setCategories(next)
    void persistConfig(next, destinations, complianceChecks)
  }

  const handleToggleDestination = (id: string) => {
    const next = destinations.map(d => (d.id === id ? { ...d, isActive: !d.isActive } : d))
    setDestinations(next)
    void persistConfig(categories, next, complianceChecks)
  }

  const handleToggleComplianceRequired = (id: string) => {
    const next = complianceChecks.map(c => (c.id === id ? { ...c, isRequired: !c.isRequired } : c))
    setComplianceChecks(next)
    void persistConfig(categories, destinations, next)
  }

  const mapCategoriesToApi = useCallback((rows: BookingCategory[]) =>
    rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon || null,
      image: c.image || null,
      isActive: c.isActive,
      minimumNights: c.minimumNights,
    })), [])

  const mapDestinationsToApi = useCallback((rows: TravelDestination[]) =>
    rows.map((d) => ({
      id: d.id,
      cityName: d.cityName,
      country: d.country || "Nigeria",
      stateRegion: d.stateRegion,
      image: d.image || null,
      isActive: d.isActive,
      isFeatured: d.isFeatured,
      tourismLevyRate: d.tourismLevyRate,
    })), [])

  const mapFoldersToApi = useCallback((rows: CollectionFolderRow[]) =>
    rows.map((f) => ({
      id: f.id,
      label: f.label,
      icon: f.icon || "folder-outline",
      isActive: f.isActive,
    })), [])

  const mapComplianceToApi = useCallback((rows: ComplianceCheck[]) =>
    rows.map((c) => ({
      id: c.id,
      documentName: c.documentName,
      isRequired: c.isRequired,
      userType: c.userType,
      requiresUpload: c.requiresUpload ?? false,
      allowMultipleFiles: c.allowMultipleFiles ?? false,
      allowCamera: c.allowCamera ?? true,
      description: c.description,
    })), [])

  const mapDestinationsFromApi = useCallback((rows: any[]): TravelDestination[] =>
    rows.map((d: any) => ({
      id: d.id,
      cityName: d.cityName,
      country: d.country || "Nigeria",
      stateRegion: d.stateRegion || "",
      image: d.image || "",
      isActive: d.isActive !== false,
      isFeatured: !!d.isFeatured,
      totalStays: 0,
      tourismLevyRate: d.tourismLevyRate ?? 0,
    })), [])

  const persistConfig = async (
    nextCategories: BookingCategory[],
    nextDestinations: TravelDestination[],
    nextCompliance: ComplianceCheck[],
    nextFolders?: CollectionFolderRow[]
  ) => {
    setConfigSaving(true)
    try {
      const res = await fetch("/api/admin/property/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          categories: mapCategoriesToApi(nextCategories),
          destinations: mapDestinationsToApi(nextDestinations),
          compliance: mapComplianceToApi(nextCompliance),
          folders: mapFoldersToApi(nextFolders ?? collectionFolders),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || `Save failed (${res.status})`)
      }
      return data
    } catch (e) {
      console.error("Failed to save booking configuration", e)
      throw e
    } finally {
      setTimeout(() => setConfigSaving(false), 500)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch("/api/admin/property/settings")
        const data = await r.json()
        if (cancelled || !r.ok) return
        
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories.map((c: any) => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            description: c.description || "",
            image: c.image || "",
            icon: c.icon || "bed",
            isActive: c.isActive !== false,
            propertyCount: 0,
            minimumNights: c.minimumNights ?? 1,
          })))
        } else {
          setCategories([
            { id: "bcat-1", name: "Boutique Hotel Stay", slug: "hotels", description: "Serviced private lodging units featuring hotel suites, lobbies, and luxury room service.", image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80", icon: "bed", isActive: true, propertyCount: 14, minimumNights: 1 },
            { id: "bcat-2", name: "Beach Resort Villa", slug: "resorts", description: "Waterfront and beach-accessible multi-room spaces optimized for vacations.", image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80", icon: "island", isActive: true, propertyCount: 8, minimumNights: 2 }
          ])
        }

        if (Array.isArray(data.destinations) && data.destinations.length > 0) {
          setDestinations(data.destinations.map((d: any) => ({
            id: d.id,
            cityName: d.cityName,
            country: d.country || "Nigeria",
            stateRegion: d.stateRegion || "",
            image: d.image || "",
            isActive: d.isActive !== false,
            isFeatured: !!d.isFeatured,
            totalStays: 0,
            tourismLevyRate: d.tourismLevyRate ?? 0,
          })))
        } else {
          setDestinations([
            { id: "dest-1", cityName: "Victoria Island, Lagos", country: "Nigeria", stateRegion: "Lagos State", image: "https://images.unsplash.com/photo-1594142404563-64cccaf5a10f?auto=format&fit=crop&w=600&q=80", isActive: true, isFeatured: true, totalStays: 210, tourismLevyRate: 5.0 },
            { id: "dest-2", cityName: "Maitama, Abuja", country: "Nigeria", stateRegion: "Federal Capital Territory", image: "https://images.unsplash.com/photo-1628155930542-3c7a64e2c833?auto=format&fit=crop&w=600&q=80", isActive: true, isFeatured: true, totalStays: 104, tourismLevyRate: 4.5 }
          ])
        }

        if (Array.isArray(data.folders) && data.folders.length > 0) {
          setCollectionFolders(data.folders.map((f: any) => ({
            id: f.id,
            label: f.label,
            icon: f.icon || "folder-outline",
            isActive: f.isActive !== false,
          })))
        } else {
          setCollectionFolders([
            { id: "retreats", label: "Bali Retreats", icon: "palm-tree", isActive: true },
            { id: "beach", label: "Beachfront", icon: "waves", isActive: true },
            { id: "spas", label: "Wellness Spas", icon: "spa-outline", isActive: true },
          ])
        }

        if (Array.isArray(data.compliance) && data.compliance.length > 0) {
          setComplianceChecks(data.compliance.map((c: any) => ({
            id: c.id,
            documentName: c.documentName,
            isRequired: c.isRequired !== false,
            userType: c.userType || "HOST",
            requiresUpload: !!c.requiresUpload,
            allowMultipleFiles: !!c.allowMultipleFiles,
            allowCamera: c.allowCamera !== false,
            description: c.description || "",
          })))
        } else {
          setComplianceChecks([
            { id: "cc-1", documentName: "Tourism / Hospitality Permit License", isRequired: true, userType: "HOST", requiresUpload: true, description: "Official local authority license authorizing short-stay commercial lodging operations." },
            { id: "cc-2", documentName: "National Identity Verification", isRequired: true, userType: "GUEST", requiresUpload: true, allowCamera: true, description: "NIN slip, International Passport, or Voter's Card required to verify account registration." }
          ])
        }
      } catch (err) {
        console.error("Config fetch failed, using fallback stays", err)
      } finally {
        if (!cancelled) setConfigLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const openCategoryModal = (target: BookingCategory | null = null) => {
    setIconSearchTerm("")
    if (target) {
      setEditCategoryTarget(target)
      setCategoryForm({
        name: target.name,
        description: target.description,
        image: target.image,
        icon: target.icon || "bed",
        minimumNights: target.minimumNights,
        isActive: target.isActive
      })
    } else {
      setEditCategoryTarget(null)
      setCategoryForm({
        name: "",
        description: "",
        image: "",
        icon: "bed",
        minimumNights: 1,
        isActive: true
      })
    }
    setShowCategoryModal(true)
  }

  const saveCategory = () => {
    if (!categoryForm.name.trim()) return
    let next: BookingCategory[]
    if (editCategoryTarget) {
      next = categories.map(cat =>
        cat.id === editCategoryTarget.id
          ? {
              ...cat,
              name: categoryForm.name,
              description: categoryForm.description,
              image: categoryForm.image || "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
              icon: categoryForm.icon,
              minimumNights: categoryForm.minimumNights,
              isActive: categoryForm.isActive,
            }
          : cat
      )
    } else {
      const newCat: BookingCategory = {
        id: `bcat-${Date.now()}`,
        name: categoryForm.name,
        slug: categoryForm.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        description: categoryForm.description,
        image: categoryForm.image || "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
        icon: categoryForm.icon,
        isActive: categoryForm.isActive,
        propertyCount: 0,
        minimumNights: categoryForm.minimumNights,
      }
      next = [...categories, newCat]
    }
    setCategories(next)
    void persistConfig(next, destinations, complianceChecks)
    setShowCategoryModal(false)
  }

  // Destination actions
  const closeDestinationModal = () => {
    setShowDestinationModal(false)
    setEditDestinationTarget(null)
    setDestinationModalMode("add")
  }

  const openDestinationModal = (target: TravelDestination | null = null) => {
    if (target) {
      setDestinationModalMode("edit")
      setEditDestinationTarget(target)
      setDestinationForm({
        cityName: target.cityName,
        country: target.country || "Nigeria",
        stateRegion: target.stateRegion,
        image: target.image,
        tourismLevyRate: target.tourismLevyRate,
        isFeatured: target.isFeatured,
        isActive: target.isActive
      })
    } else {
      setDestinationModalMode("add")
      setEditDestinationTarget(null)
      setDestinationForm({
        cityName: "",
        country: "Nigeria",
        stateRegion: "",
        image: "",
        tourismLevyRate: 5.0,
        isFeatured: false,
        isActive: true
      })
    }
    setShowDestinationModal(true)
  }

  const deleteDestination = (id: string) => {
    const next = destinations.filter(d => d.id !== id)
    setDestinations(next)
    void persistConfig(categories, next, complianceChecks)
  }

  const saveDestination = async () => {
    if (!destinationForm.cityName.trim() || !destinationForm.country.trim()) {
      window.alert("Destination name and country are required.")
      return
    }

    const isEdit = destinationModalMode === "edit" && editDestinationTarget != null
    const defaultImage =
      "https://images.unsplash.com/photo-1594142404563-64cccaf5a10f?auto=format&fit=crop&w=600&q=80"

    let next: TravelDestination[]
    if (isEdit) {
      next = destinations.map((d) =>
        d.id === editDestinationTarget!.id
          ? {
              ...d,
              cityName: destinationForm.cityName.trim(),
              country: destinationForm.country,
              stateRegion: destinationForm.stateRegion,
              image: destinationForm.image || defaultImage,
              tourismLevyRate: destinationForm.tourismLevyRate,
              isFeatured: destinationForm.isFeatured,
              isActive: destinationForm.isActive,
            }
          : d
      )
    } else {
      const slugBase = destinationForm.cityName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
      const newId = `dest-${slugBase || "city"}-${Date.now()}`
      const newDest: TravelDestination = {
        id: newId,
        cityName: destinationForm.cityName.trim(),
        country: destinationForm.country,
        stateRegion: destinationForm.stateRegion,
        image: destinationForm.image || defaultImage,
        isActive: destinationForm.isActive,
        isFeatured: destinationForm.isFeatured,
        totalStays: 0,
        tourismLevyRate: destinationForm.tourismLevyRate,
      }
      next = [...destinations, newDest]
    }

    try {
      const saved = await persistConfig(categories, next, complianceChecks)
      if (Array.isArray(saved?.destinations)) {
        setDestinations(mapDestinationsFromApi(saved.destinations))
      } else {
        setDestinations(next)
      }
      closeDestinationModal()
    } catch (e: any) {
      window.alert(e?.message || "Failed to save destination. Please try again.")
    }
  }

  // Compliance CRUD
  const handleToggleFolder = (id: string) => {
    const next = collectionFolders.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f))
    setCollectionFolders(next)
    void persistConfig(categories, destinations, complianceChecks, next)
  }

  const openFolderModal = (target: CollectionFolderRow | null = null) => {
    setIconSearchTerm("")
    if (target) {
      setEditFolderTarget(target)
      setFolderForm({
        label: target.label,
        icon: target.icon || "folder-outline",
        isActive: target.isActive,
      })
    } else {
      setEditFolderTarget(null)
      setFolderForm({
        label: "",
        icon: "folder-outline",
        isActive: true,
      })
    }
    setShowFolderModal(true)
  }

  const deleteFolder = (id: string) => {
    const next = collectionFolders.filter((f) => f.id !== id)
    setCollectionFolders(next)
    void persistConfig(categories, destinations, complianceChecks, next)
  }

  const saveFolder = () => {
    if (!folderForm.label.trim()) return
    const slugId = editFolderTarget?.id || folderForm.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    if (!slugId) return
    let next: CollectionFolderRow[]
    if (editFolderTarget) {
      next = collectionFolders.map((f) =>
        f.id === editFolderTarget.id
          ? {
              ...f,
              label: folderForm.label.trim(),
              icon: folderForm.icon,
              isActive: folderForm.isActive,
            }
          : f
      )
    } else {
      if (collectionFolders.some((f) => f.id === slugId)) return
      next = [
        ...collectionFolders,
        {
          id: slugId,
          label: folderForm.label.trim(),
          icon: folderForm.icon,
          isActive: folderForm.isActive,
        },
      ]
    }
    setCollectionFolders(next)
    void persistConfig(categories, destinations, complianceChecks, next)
    setShowFolderModal(false)
  }

  const openComplianceModal = (target: ComplianceCheck | null = null) => {
    if (target) {
      setEditComplianceTarget(target)
      setComplianceForm({
        documentName: target.documentName,
        isRequired: target.isRequired,
        userType: target.userType,
        requiresUpload: !!target.requiresUpload,
        allowMultipleFiles: !!target.allowMultipleFiles,
        allowCamera: target.allowCamera !== false,
        description: target.description
      })
    } else {
      setEditComplianceTarget(null)
      setComplianceForm({
        documentName: "",
        isRequired: true,
        userType: "HOST",
        requiresUpload: false,
        allowMultipleFiles: false,
        allowCamera: true,
        description: ""
      })
    }
    setShowComplianceModal(true)
  }

  const saveCompliance = () => {
    if (!complianceForm.documentName.trim()) return
    let next: ComplianceCheck[]
    if (editComplianceTarget) {
      next = complianceChecks.map(c =>
        c.id === editComplianceTarget.id
          ? {
              ...c,
              documentName: complianceForm.documentName,
              isRequired: complianceForm.isRequired,
              userType: complianceForm.userType,
              requiresUpload: complianceForm.requiresUpload,
              allowMultipleFiles: complianceForm.allowMultipleFiles,
              allowCamera: complianceForm.allowCamera,
              description: complianceForm.description,
            }
          : c
      )
    } else {
      const newCheck: ComplianceCheck = {
        id: `cc-${Date.now()}`,
        documentName: complianceForm.documentName,
        isRequired: complianceForm.isRequired,
        userType: complianceForm.userType,
        requiresUpload: complianceForm.requiresUpload,
        allowMultipleFiles: complianceForm.allowMultipleFiles,
        allowCamera: complianceForm.allowCamera,
        description: complianceForm.description,
      }
      next = [...complianceChecks, newCheck]
    }
    setComplianceChecks(next)
    void persistConfig(categories, destinations, next)
    setShowComplianceModal(false)
  }

  const deleteComplianceRule = (id: string) => {
    const next = complianceChecks.filter(c => c.id !== id)
    setComplianceChecks(next)
    void persistConfig(categories, destinations, next)
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm hover:shadow-md transition-all duration-200"

  return (
    <div className="space-y-8 bg-slate-50 min-h-screen pb-10 font-sans antialiased relative">
      
      {/* Global Saving Indicator Overlay */}
      {configSaving && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center transition-all">
          <div className="bg-white px-6 py-5 rounded-2xl shadow-xl flex items-center space-x-4 border border-slate-100">
            <Loader2 className="h-6 w-6 text-emerald-600 animate-spin" />
            <div className="text-sm font-bold text-slate-800">Synchronising configurations...</div>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="h-8 w-8 text-emerald-600" />
            Booking System Settings
          </h1>
          <p className="text-slate-500 mt-1">Configure structural categories, mobile app icons, target destinations, and verification rules</p>
        </div>
      </div>

      {/* Primary Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 space-y-1">
            <button
              onClick={() => setActiveTab("categories")}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                activeTab === "categories"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Layers className="h-5 w-5" />
                <span>Stay Categories</span>
              </div>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${activeTab === 'categories' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {categories.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("destinations")}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                activeTab === "destinations"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center space-x-3">
                <MapPin className="h-5 w-5" />
                <span>Destinations</span>
              </div>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${activeTab === 'destinations' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {destinations.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("folders")}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                activeTab === "folders"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center space-x-3">
                <FolderOpen className="h-5 w-5" />
                <span>Collection Folders</span>
              </div>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${activeTab === 'folders' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {collectionFolders.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("compliance")}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold rounded-xl transition-all ${
                activeTab === "compliance"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <div className="flex items-center space-x-3">
                <ShieldCheck className="h-5 w-5" />
                <span>Compliance & IDs</span>
              </div>
              <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${activeTab === 'compliance' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {complianceChecks.length}
              </span>
            </button>
          </div>
          
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100/70 flex gap-3 text-xs text-emerald-800">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
            <p>Commission structures, tourism levy rates, and compliance parameters defined here affect booking flows during reservation checkouts.</p>
          </div>
        </div>

        {/* Workspace Display Area */}
        <div className="lg:col-span-3">
          
          {/* SKELETON LOADER STATE */}
          {configLoading ? (
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                <div className="h-6 w-1/3 bg-slate-200 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-slate-200 rounded animate-pulse" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  {[1, 2].map(n => (
                    <div key={n} className="border border-slate-200 rounded-2xl h-64 bg-slate-50 flex flex-col justify-between p-4 animate-pulse">
                      <div className="h-32 bg-slate-200 rounded-xl" />
                      <div className="h-4 bg-slate-200 rounded w-3/4" />
                      <div className="h-8 bg-slate-200 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: ACCOMMODATION STAYS */}
              {activeTab === "categories" && (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Stay Categories</h2>
                        <p className="text-slate-500 text-sm mt-0.5">Define custom stay layouts and booking boundaries for listing registers</p>
                      </div>
                      <button
                        onClick={() => openCategoryModal()}
                        className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold ${gradientBtnClass}`}
                      >
                        <Plus className="h-4 w-4 mr-1.5" /> Add Category
                      </button>
                    </div>

                    {/* Categories Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      {categories.map((cat) => (
                        <div
                          key={cat.id}
                          className="group bg-white border border-slate-200 hover:border-emerald-200 rounded-2xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md flex flex-col"
                        >
                          <div className="h-32 bg-slate-100 relative overflow-hidden">
                            <img
                              src={cat.image}
                              alt={cat.name}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 to-transparent"></div>
                            <div className="absolute bottom-3 left-4 right-4 flex justify-between items-end">
                              <div className="flex items-center space-x-2.5">
                                <div className="p-2 bg-white/20 backdrop-blur-md rounded-lg text-white">
                                  <RenderMaterialIcon name={cat.icon || "bed"} className="h-5 w-5" />
                                </div>
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider block">Stay Type</span>
                                  <h3 className="text-white font-bold text-base leading-tight">{cat.name}</h3>
                                </div>
                              </div>
                              <span className="text-xs font-semibold bg-white/20 backdrop-blur-md px-2 py-0.5 text-white rounded">
                                {cat.propertyCount} active stays
                              </span>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{cat.description}</p>
                            
                            <div className="bg-slate-50 rounded-xl p-2.5 flex items-center justify-between text-xs border border-slate-100">
                              <span className="text-slate-500 font-medium flex items-center gap-1">
                                Mobile Icon: <span className="font-mono text-emerald-600 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">{cat.icon || "bed"}</span>
                              </span>
                              <span className="font-bold text-slate-800">{cat.minimumNights} Nights min</span>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleToggleCategory(cat.id)}
                                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                                    cat.isActive ? "bg-emerald-500" : "bg-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                      cat.isActive ? "translate-x-5" : "translate-x-1"
                                    }`}
                                  />
                                </button>
                                <span className="text-xs font-semibold text-slate-700">
                                  {cat.isActive ? "Active" : "Disabled"}
                                </span>
                              </div>

                              <div className="flex items-center space-x-1">
                                <button
                                  onClick={() => openCategoryModal(cat)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-all"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    const next = categories.filter(c => c.id !== cat.id)
                                    setCategories(next)
                                    void persistConfig(next, destinations, complianceChecks)
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TRAVEL DESTINATIONS */}
              {activeTab === "destinations" && (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Tourism Destinations</h2>
                        <p className="text-slate-500 text-sm mt-0.5">Manage high-occupancy destination zones and local state stay tax rates</p>
                      </div>
                      <button
                        onClick={() => openDestinationModal()}
                        className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold ${gradientBtnClass}`}
                      >
                        <Plus className="h-4 w-4 mr-1.5" /> Add Destination
                      </button>
                    </div>

                    {/* Destinations Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
                      {destinations.map((dest) => (
                        <div
                          key={dest.id}
                          className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm flex flex-col"
                        >
                          <div className="h-28 bg-slate-100 relative">
                            <img
                              src={dest.image}
                              alt={dest.cityName}
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-slate-950/40"></div>
                            <div className="absolute top-2 right-2 flex space-x-1">
                              {dest.isFeatured && (
                                <span className="text-[9px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                  Trending Area
                                </span>
                              )}
                            </div>
                            <div className="absolute bottom-2 left-3">
                              <p className="text-[10px] text-slate-300 font-bold uppercase">{dest.country}</p>
                              <p className="text-[10px] text-slate-400 font-medium">{dest.stateRegion}</p>
                              <h4 className="text-white text-base font-bold leading-tight">{dest.cityName}</h4>
                            </div>
                          </div>

                          <div className="p-4 flex-1 flex flex-col justify-between space-y-3 text-sm">
                            <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                              <div className="flex justify-between text-xs">
                                <span className="text-slate-500 font-medium">Stays Available:</span>
                                <span className="font-bold text-slate-900">{dest.totalStays}</span>
                              </div>
                              <div className="flex justify-between text-xs mt-1">
                                <span className="text-slate-500 font-medium">Local Tourism Levy:</span>
                                <span className="font-semibold text-emerald-600">{dest.tourismLevyRate}%</span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleToggleDestination(dest.id)}
                                  className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                                    dest.isActive ? "bg-emerald-500" : "bg-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                      dest.isActive ? "translate-x-5" : "translate-x-1"
                                    }`}
                                  />
                                </button>
                                <span className="text-xs font-semibold text-slate-700">
                                  {dest.isActive ? "Active" : "Disabled"}
                                </span>
                              </div>

                              <div className="flex space-x-1">
                                <button
                                  onClick={() => openDestinationModal(dest)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-50 rounded-lg transition-colors"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => deleteDestination(dest.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: COLLECTION FOLDERS */}
              {activeTab === "folders" && (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Collection Folders</h2>
                        <p className="text-slate-500 text-sm mt-0.5">
                          Wishlist and vendor listing portfolio folders shown in the mobile app (replaces static folder list)
                        </p>
                      </div>
                      <button
                        onClick={() => openFolderModal()}
                        className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold ${gradientBtnClass}`}
                      >
                        <Plus className="h-4 w-4 mr-1.5" /> Add Folder
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                      {collectionFolders.map((folder) => (
                        <div
                          key={folder.id}
                          className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600">
                              <RenderMaterialIcon name={folder.icon || "folder-outline"} className="h-5 w-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{folder.id}</p>
                              <h4 className="text-sm font-bold text-slate-900 truncate">{folder.label}</h4>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleToggleFolder(folder.id)}
                                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
                                  folder.isActive ? "bg-emerald-500" : "bg-slate-200"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    folder.isActive ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </button>
                              <span className="text-xs font-semibold text-slate-600">
                                {folder.isActive ? "Active" : "Disabled"}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => openFolderModal(folder)}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-white rounded-lg"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => deleteFolder(folder.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: COMPLIANCE & HOST/GUEST IDENTITIES */}
              {activeTab === "compliance" && (
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">Compliance & Regulatory Audits</h2>
                        <p className="text-slate-500 text-sm mt-0.5">Control safety parameters, hosting authorizations, and guest identification uploads</p>
                      </div>
                      <button
                        onClick={() => openComplianceModal()}
                        className={`flex items-center px-4 py-2.5 rounded-xl text-sm font-semibold ${gradientBtnClass}`}
                      >
                        <Plus className="h-4 w-4 mr-1.5" /> Require Document
                      </button>
                    </div>

                    {/* Compliance checklist display list */}
                    <div className="space-y-4 mt-6">
                      {complianceChecks.map((check) => (
                        <div
                          key={check.id}
                          className="p-5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-200 hover:shadow-sm transition-all flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                        >
                          <div className="space-y-2 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900 text-sm leading-snug">{check.documentName}</h4>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                  <span className="px-2 py-0.5 text-[9px] bg-indigo-50 text-indigo-700 border border-indigo-100 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Users className="h-3 w-3" /> Target: {check.userType}
                                  </span>
                                  {check.isRequired ? (
                                    <span className="px-2 py-0.5 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                                      <CheckCircle className="h-3 w-3" /> Mandatory
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 text-[9px] bg-slate-100 text-slate-600 border border-slate-200 rounded font-bold uppercase tracking-wider flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" /> Optional
                                    </span>
                                  )}
                                  {check.requiresUpload && (
                                    <span className="px-2 py-0.5 text-[9px] bg-sky-50 text-sky-700 border border-sky-100 rounded font-bold uppercase tracking-wider">
                                      Requires Upload
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed max-w-2xl pl-11">{check.description}</p>
                          </div>

                          <div className="flex items-center space-x-4 justify-between md:justify-end border-t border-slate-100 md:border-0 pt-3 md:pt-0 pl-11 md:pl-0">
                            {/* Toggle Check Status Switch */}
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleToggleComplianceRequired(check.id)}
                                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors focus:outline-none ${
                                  check.isRequired ? "bg-emerald-500" : "bg-slate-200"
                                }`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                                    check.isRequired ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </button>
                              <span className="text-xs font-semibold text-slate-700">Required</span>
                            </div>

                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => openComplianceModal(check)}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition-all"
                                title="Edit Document Requirements"
                              >
                                <Edit className="h-4.5 w-4.5" />
                              </button>
                              <button
                                onClick={() => deleteComplianceRule(check.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="h-4.5 w-4.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* CATEGORY ADD/EDIT MODAL */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-100 animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editCategoryTarget ? "Edit Booking Category" : "Add Booking Category"}
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">Define metadata and configure stay behaviors</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm transition-all"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Category Display Name</label>
                  <input
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Eco Cabin Stay"
                  />
                </div>
                <div>
                  <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Minimum Stay Nights</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                    value={categoryForm.minimumNights}
                    onChange={(e) => setCategoryForm(prev => ({ ...prev, minimumNights: Number(e.target.value) }))}
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Detailed Category Description</label>
                <textarea
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none h-20 resize-none transition-all"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Summarize staying rules for this lodging classification."
                />
              </div>

              {/* Advanced Icons Selector */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <span className="font-bold text-xs text-slate-700 uppercase tracking-wider block">Select Mobile App Icon</span>
                    <span className="text-[10px] text-slate-500 block">
                      Browse or search stay representations. Read the{" "}
                      <a 
                        href="https://icons.expo.fyi/" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-emerald-600 font-bold hover:underline inline-flex items-center gap-0.5"
                      >
                        Expo Directory <ExternalLink className="h-3 w-3 inline" />
                      </a>{" "}
                      for custom keys.
                    </span>
                  </div>
                  <div className="relative w-full sm:w-48">
                    <input
                      type="text"
                      className="w-full border border-slate-300 bg-white rounded-lg pl-8 pr-2 py-1 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Search icons..."
                      value={iconSearchTerm}
                      onChange={(e) => setIconSearchTerm(e.target.value)}
                    />
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                  </div>
                </div>

                {/* Structured Curated Icons List Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-32 overflow-y-auto pr-1">
                  {filteredIcons.map((icon) => (
                    <button
                      key={icon.value}
                      type="button"
                      onClick={() => setCategoryForm(prev => ({ ...prev, icon: icon.value }))}
                      className={`flex items-center space-x-2 px-2.5 py-2 rounded-lg border text-xs text-left transition-all ${
                        categoryForm.icon === icon.value
                          ? "bg-emerald-500 text-white border-emerald-500 font-bold"
                          : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
                      }`}
                    >
                      <RenderMaterialIcon name={icon.value} className={`h-4 w-4 shrink-0 ${categoryForm.icon === icon.value ? 'text-white' : 'text-slate-500'}`} />
                      <div className="truncate">
                        <div className="truncate leading-tight">{icon.name}</div>
                        <div className={`text-[9px] truncate ${categoryForm.icon === icon.value ? 'text-emerald-100' : 'text-slate-400'}`}>{icon.value}</div>
                      </div>
                      {categoryForm.icon === icon.value && <Check className="h-3.5 w-3.5 shrink-0 ml-auto" />}
                    </button>
                  ))}
                  {filteredIcons.length === 0 && (
                    <div className="col-span-full py-4 text-center text-xs text-slate-400">No matching mobile icons found.</div>
                  )}
                </div>

                {/* Manual Icon Custom Input Control Option */}
                <div className="pt-2 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="font-bold text-[11px] text-slate-500 uppercase tracking-wider block">Manual / Custom Icon Value</label>
                    <span className="text-[10px] text-slate-400 block">Type custom Material Design value mapping</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      className="flex-1 border border-slate-300 bg-white rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500/20 font-mono"
                      value={categoryForm.icon}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, icon: e.target.value.toLowerCase().trim() }))}
                      placeholder="e.g. bed-double-outline"
                    />
                    <div className="p-2 bg-slate-100 border border-slate-200 rounded-xl flex items-center justify-center shrink-0">
                      <RenderMaterialIcon name={categoryForm.icon} className="h-4.5 w-4.5 text-slate-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cover Image Upload Layout */}
              <div>
                <span className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Cover image / illustration</span>
                <div className="flex gap-2 mt-1.5">
                  <input
                    className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none text-sm"
                    value={categoryForm.image}
                    onChange={(e) => setCategoryForm(prev => ({ ...prev, image: e.target.value }))}
                    placeholder="Provide image address URL or click upload"
                  />
                  <label className={`px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm font-semibold cursor-pointer hover:bg-slate-100 flex items-center space-x-1.5 ${uploadingImage === "category" ? "opacity-50 pointer-events-none" : ""}`}>
                    {uploadingImage === "category" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                        <span>Uploading…</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4 text-slate-600" />
                        <span>Upload File</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage === "category"}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadConfigImage(f, "category")
                      }}
                    />
                  </label>
                </div>
                {categoryForm.image ? (
                  <div className="mt-3 relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                    <img src={categoryForm.image} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setCategoryForm(prev => ({ ...prev, image: "" }))}
                      className="absolute top-2 right-2 bg-slate-900/60 text-white rounded-full p-1 hover:bg-slate-900"
                    >
                      <XCircle className="h-4.5 w-4.5" />
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  id="cat-active-check"
                  type="checkbox"
                  checked={categoryForm.isActive}
                  onChange={(e) => setCategoryForm(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4.5 w-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="cat-active-check" className="font-semibold text-slate-700 select-none cursor-pointer">
                  Activate Category (Visible on landing search portals)
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCategory}
                className={`px-6 py-2.5 rounded-xl font-semibold ${gradientBtnClass}`}
              >
                Save Stay Class
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DESTINATION ADD/EDIT MODAL */}
      {showDestinationModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-100 animate-scale-up">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {destinationModalMode === "edit" ? "Edit Destination" : "Add Target Destination"}
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">Control regional stays, tourism taxes, and destination flags</p>
              </div>
              <button
                type="button"
                onClick={closeDestinationModal}
                className="text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm transition-all"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700">
              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Country</label>
                <select
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow bg-white"
                  value={destinationForm.country}
                  onChange={(e) => setDestinationForm(prev => ({ ...prev, country: e.target.value }))}
                >
                  {DESTINATION_COUNTRIES.map((country) => (
                    <option key={country} value={country}>{country}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Destinations only appear in the mobile app for users browsing this country.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Destination Name</label>
                  <input
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                    value={destinationForm.cityName}
                    onChange={(e) => setDestinationForm(prev => ({ ...prev, cityName: e.target.value }))}
                    placeholder="e.g. Obudu, Calabar"
                  />
                </div>
                <div>
                  <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">State / Region Province</label>
                  <input
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                    value={destinationForm.stateRegion}
                    onChange={(e) => setDestinationForm(prev => ({ ...prev, stateRegion: e.target.value }))}
                    placeholder="e.g. Cross River State"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Tourism Levy Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                    value={destinationForm.tourismLevyRate}
                    onChange={(e) => setDestinationForm(prev => ({ ...prev, tourismLevyRate: Number(e.target.value) }))}
                  />
                </div>

                <div className="flex flex-col gap-2 justify-end pb-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={destinationForm.isFeatured}
                      onChange={(e) => setDestinationForm(prev => ({ ...prev, isFeatured: e.target.checked }))}
                      className="h-4.5 w-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-slate-700">Featured trending area</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Banner Image URL</label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text"
                    placeholder="https://... or upload file"
                    className="flex-1 border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow text-sm"
                    value={destinationForm.image}
                    onChange={(e) => setDestinationForm(prev => ({ ...prev, image: e.target.value }))}
                  />
                  <label className={`px-4 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-sm font-semibold cursor-pointer hover:bg-slate-100 flex items-center space-x-1 ${uploadingImage === "destination" ? "opacity-50 pointer-events-none" : ""}`}>
                    {uploadingImage === "destination" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
                        <span>Uploading…</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-4 w-4 text-slate-600" />
                        <span>Upload</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingImage === "destination"}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadConfigImage(f, "destination")
                      }}
                    />
                  </label>
                </div>
                {destinationForm.image ? (
                  <div className="mt-3 relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                    <img src={destinationForm.image} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setDestinationForm(prev => ({ ...prev, image: "" }))}
                      className="absolute top-2 right-2 bg-slate-900/60 text-white rounded-full p-1 hover:bg-slate-900"
                    >
                      <XCircle className="h-4.5 w-4.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={closeDestinationModal}
                className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveDestination()}
                className={`px-6 py-2.5 rounded-xl font-semibold ${gradientBtnClass}`}
              >
                {destinationModalMode === "edit" ? "Save Destination" : "Add Destination"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECTION FOLDER MODAL */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-100 animate-scale-up">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editFolderTarget ? "Edit Collection Folder" : "Add Collection Folder"}
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">Used for vendor listing portfolios and customer wishlist filters</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm transition-all"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700">
              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Folder label</label>
                <input
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                  value={folderForm.label}
                  onChange={(e) => setFolderForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="e.g. Beachfront"
                />
                {editFolderTarget ? (
                  <p className="text-xs text-slate-400 mt-1">Folder ID: <span className="font-mono">{editFolderTarget.id}</span></p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">ID is generated from the label (e.g. beachfront)</p>
                )}
              </div>

              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block mb-2">Mobile icon</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto">
                  {filteredIcons.slice(0, 24).map((icon) => (
                    <button
                      key={icon.value}
                      type="button"
                      onClick={() => setFolderForm((prev) => ({ ...prev, icon: icon.value }))}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg border text-xs ${
                        folderForm.icon === icon.value
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white border-slate-200 text-slate-700"
                      }`}
                    >
                      <RenderMaterialIcon name={icon.value} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{icon.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={folderForm.isActive}
                  onChange={(e) => setFolderForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                />
                <span className="font-semibold text-slate-700">Active in mobile app</span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowFolderModal(false)}
                className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button type="button" onClick={saveFolder} className={`px-6 py-2.5 rounded-xl font-semibold ${gradientBtnClass}`}>
                Save Folder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLIANCE / AUDIT DOCUMENT MODAL */}
      {showComplianceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-100 animate-scale-up">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {editComplianceTarget ? "Edit Compliance Rule" : "Require New Compliance Document"}
                </h3>
                <p className="text-slate-500 text-xs mt-0.5">Control safety parameters, hosting authorizations, and guest validation checks</p>
              </div>
              <button
                type="button"
                onClick={() => setShowComplianceModal(false)}
                className="text-slate-400 hover:text-slate-600 bg-white border border-slate-200 rounded-full p-1.5 shadow-sm transition-all"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1 text-sm text-slate-700">
              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Document Verification Title</label>
                <input
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-shadow"
                  value={complianceForm.documentName}
                  onChange={(e) => setComplianceForm(prev => ({ ...prev, documentName: e.target.value }))}
                  placeholder="e.g. Hotel Operations Safety Clearance"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Target Audience Scope</label>
                  <select
                    className="w-full border border-slate-300 rounded-xl px-4 py-2.5 mt-1.5 focus:ring-2 focus:ring-emerald-500 bg-white outline-none"
                    value={complianceForm.userType}
                    onChange={(e) => setComplianceForm(prev => ({ ...prev, userType: e.target.value as any }))}
                  >
                    <option value="HOST">Hosts / Managers (registration screens)</option>
                    <option value="GUEST">Guests / Renters (reservation checkouts)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end pb-3 pl-1">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={complianceForm.isRequired}
                        onChange={(e) => setComplianceForm(prev => ({ ...prev, isRequired: e.target.checked }))}
                      />
                      <div className="h-5 w-5 bg-white border-2 border-slate-300 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors"></div>
                      <CheckCircle className="absolute inset-0 h-5 w-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Mandatory check</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2.5 pl-1 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <span className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Interaction Rules</span>
                
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4.5 w-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={complianceForm.requiresUpload}
                    onChange={(e) => setComplianceForm(prev => ({ ...prev, requiresUpload: e.target.checked }))}
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Require digital document file upload
                  </span>
                </label>
                
                {complianceForm.userType === "GUEST" && (
                  <>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4.5 w-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={complianceForm.allowMultipleFiles}
                        onChange={(e) => setComplianceForm(prev => ({ ...prev, allowMultipleFiles: e.target.checked }))}
                      />
                      <span className="text-xs font-semibold text-slate-700">Allow guests to upload multi-page files</span>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="h-4.5 w-4.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={complianceForm.allowCamera}
                        onChange={(e) => setComplianceForm(prev => ({ ...prev, allowCamera: e.target.checked }))}
                      />
                      <span className="text-xs font-semibold text-slate-700">Allow live camera uploads on web checkout</span>
                    </label>
                  </>
                )}
              </div>

              <div>
                <label className="font-bold text-xs text-slate-500 uppercase tracking-wider block">Description / Verification Guidelines</label>
                <p className="text-[10px] text-slate-400 mb-1">Outline details for reviewers and submitters regarding documents</p>
                <textarea
                  className="w-full border border-slate-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none h-24 resize-none transition-shadow"
                  value={complianceForm.description}
                  onChange={(e) => setComplianceForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Identify guidelines (e.g. Needs to state commercial hotel usage license, scanned copies must be in colored format)."
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setShowComplianceModal(false)}
                className="px-5 py-2.5 border border-slate-300 bg-white text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCompliance}
                className={`px-6 py-2.5 rounded-xl font-semibold ${gradientBtnClass}`}
              >
                Save Compliance Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}