"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Hotel,
  Home,
  Palmtree,
  Moon,
  Calendar,
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
  MapPin,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Users,
  Star,
  Compass,
  FileText,
  ExternalLink,
  Loader2
} from "lucide-react"

const formatMoney = (amount: number, currencyCode: string) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)

interface BookingPropertyData {
  id: string
  hostId: string
  propertyName: string
  hostName: string
  email: string
  phone: string
  address: string
  bookingType: "APARTMENT" | "HOTEL" | "RESORT" | "CABIN"
  permitNumber: string // hospitality/tourism license
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  isVerified: boolean
  registrationDate: string
  totalNightsBooked: number
  grossRevenue: number
  rating: number
  maxGuests: number
  pricePerNight: number
  amenities: string[]
  documents: {
    hospitalityLicense: string
    propertyPhotos: string
    safetyCertificate: string
  }
}

interface BookingStats {
  totalProperties: number
  pendingApprovals: number
  activeProperties: number
  totalRevenue: number
  totalReservations: number
  averageRating: number
  currencySymbol?: string
  currencyCode?: string
}

export default function BookingPropertyManagement() {
  const [properties, setProperties] = useState<BookingPropertyData[]>([])
  const [stats, setStats] = useState<BookingStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedProperty, setSelectedProperty] = useState<BookingPropertyData | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editForm, setEditForm] = useState({
    propertyName: "",
    address: "",
    phone: "",
    email: "",
    isVerified: false,
    propertyActive: true,
    pricePerNight: 0,
    maxGuests: 2,
    permitNumber: "",
    hostName: "",
    hostPhone: "",
    hostEmail: "",
  })
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [viewMode, setViewMode] = useState<"listings" | "bookings" | "guest-verifications">("listings")
  const [bookings, setBookings] = useState<any[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingCity, setBookingCity] = useState("")
  const [bookingStatus, setBookingStatus] = useState("ALL")
  const [bookingFrom, setBookingFrom] = useState("")
  const [bookingTo, setBookingTo] = useState("")
  const [bookingPage, setBookingPage] = useState(1)
  const [bookingTotalPages, setBookingTotalPages] = useState(1)
  const [guestVerifications, setGuestVerifications] = useState<any[]>([])
  const [guestVerificationsLoading, setGuestVerificationsLoading] = useState(false)
  const [guestVerificationPage, setGuestVerificationPage] = useState(1)
  const [guestVerificationTotalPages, setGuestVerificationTotalPages] = useState(1)
  const [systemCurrency, setSystemCurrency] = useState<string | null>(null)
  const [showBookingModal, setShowBookingModal] = useState(false)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [bookingDetail, setBookingDetail] = useState<any>(null)
  const [bookingDetailLoading, setBookingDetailLoading] = useState(false)
  const [showVerificationModal, setShowVerificationModal] = useState(false)
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null)
  const [verificationDetail, setVerificationDetail] = useState<any>(null)
  const [verificationDetailLoading, setVerificationDetailLoading] = useState(false)

  const currencyCode = systemCurrency || stats?.currencyCode || null

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setSystemCurrency(d?.general?.currency))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (viewMode === "listings") fetchPropertyData()
  }, [currentPage, searchTerm, statusFilter, viewMode])

  useEffect(() => {
    if (viewMode !== "bookings") return
    fetchBookings()
  }, [viewMode, bookingPage, bookingCity, bookingStatus, bookingFrom, bookingTo, searchTerm])

  useEffect(() => {
    if (viewMode !== "guest-verifications") return
    fetchGuestVerifications()
  }, [viewMode, guestVerificationPage, searchTerm])

  const fetchGuestVerifications = async () => {
    setGuestVerificationsLoading(true)
    try {
      const qs = new URLSearchParams({
        page: String(guestVerificationPage),
        limit: "20",
        search: searchTerm,
      })
      const r = await fetch(`/api/admin/modules/property/guest-verifications?${qs.toString()}`)
      const data = await r.json()
      setGuestVerifications(data.verifications || [])
      setGuestVerificationTotalPages(data.pagination?.totalPages || 1)
    } catch {
      setGuestVerifications([])
    } finally {
      setGuestVerificationsLoading(false)
    }
  }

  const reviewGuestVerification = async (id: string, action: "approve" | "reject") => {
    const reason = action === "reject" ? prompt("Rejection reason (optional)") : null
    await fetch(`/api/admin/modules/property/guest-verifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    })
    fetchGuestVerifications()
    if (showVerificationModal && selectedVerificationId === id) {
      void loadVerificationDetail(id)
    }
    if (showBookingModal && selectedBookingId) {
      void loadBookingDetail(selectedBookingId)
    }
  }

  const loadVerificationDetail = async (id: string) => {
    setVerificationDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/property/guest-verifications/${id}`)
      const data = await r.json()
      setVerificationDetail(r.ok ? data.verification : null)
    } catch {
      setVerificationDetail(null)
    } finally {
      setVerificationDetailLoading(false)
    }
  }

  const openVerificationView = (id: string) => {
    setSelectedVerificationId(id)
    setShowVerificationModal(true)
    setVerificationDetail(null)
    void loadVerificationDetail(id)
  }

  const closeVerificationModal = () => {
    setShowVerificationModal(false)
    setSelectedVerificationId(null)
    setVerificationDetail(null)
  }

  const loadBookingDetail = async (id: string) => {
    setBookingDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/property/bookings/${id}`)
      const data = await r.json()
      setBookingDetail(r.ok ? data : null)
    } catch {
      setBookingDetail(null)
    } finally {
      setBookingDetailLoading(false)
    }
  }

  const openBookingView = (id: string) => {
    setSelectedBookingId(id)
    setShowBookingModal(true)
    setBookingDetail(null)
    void loadBookingDetail(id)
  }

  const closeBookingModal = () => {
    setShowBookingModal(false)
    setSelectedBookingId(null)
    setBookingDetail(null)
  }

  const fetchBookings = async () => {
    setBookingsLoading(true)
    try {
      const qs = new URLSearchParams({
        page: String(bookingPage),
        limit: "20",
        search: searchTerm,
        status: bookingStatus,
        city: bookingCity,
      })
      if (bookingFrom) qs.set("from", bookingFrom)
      if (bookingTo) qs.set("to", bookingTo)
      const r = await fetch(`/api/admin/modules/property/bookings?${qs.toString()}`)
      const data = await r.json()
      setBookings(data.bookings || [])
      setBookingTotalPages(data.pagination?.totalPages || 1)
    } catch {
      setBookings([])
    } finally {
      setBookingsLoading(false)
    }
  }

  const loadPropertyDetail = async (id: string) => {
    setDetailLoading(true)
    try {
      const r = await fetch(`/api/admin/modules/booking-properties/${id}`)
      const j = await r.json()
      setDetail(j.error ? null : j)
    } catch {
      const found = properties.find(p => p.id === id)
      if (found) {
        setDetail({
          property: {
            id: found.id,
            hostId: found.hostId,
            propertyName: found.propertyName,
            address: found.address,
            phone: found.phone,
            email: found.email,
            pricePerNight: found.pricePerNight,
            maxGuests: found.maxGuests,
            isVerified: found.isVerified,
            isActive: found.status === "APPROVED",
            permitNumber: found.permitNumber,
            hospitalityLicense: found.documents.hospitalityLicense,
            propertyPhotos: found.documents.propertyPhotos,
            safetyCertificate: found.documents.safetyCertificate,
            user: {
              name: found.hostName,
              phone: found.phone,
              email: found.email
            }
          },
          summary: {
            grossRevenue: found.grossRevenue,
            recentReservations: [
              { id: "RES-401", bookingNumber: "BK-2026-0091", guestName: "Sarah Cole", checkIn: "2026-06-10", checkOut: "2026-06-15", status: "CONFIRMED", total: found.pricePerNight * 5 },
              { id: "RES-402", bookingNumber: "BK-2026-0084", guestName: "Emeka Obi", checkIn: "2026-06-18", checkOut: "2026-06-21", status: "COMPLETED", total: found.pricePerNight * 3 }
            ]
          }
        })
      } else {
        setDetail(null)
      }
    } finally {
      setDetailLoading(false)
    }
  }

  const openView = (p: BookingPropertyData) => {
    setSelectedProperty(p)
    setShowViewModal(true)
    void loadPropertyDetail(p.id)
  }

  const openEdit = (p: BookingPropertyData) => {
    setSelectedProperty(p)
    setShowEditModal(true)
    void loadPropertyDetail(p.id)
  }

  useEffect(() => {
    if (!showEditModal || !detail?.property) return
    const pr = detail.property
    const u = pr.user
    setEditForm({
      propertyName: pr.propertyName || "",
      address: pr.address || "",
      phone: pr.phone || "",
      email: pr.email || "",
      isVerified: !!pr.isVerified,
      propertyActive: !!pr.isActive,
      pricePerNight: pr.pricePerNight || 0,
      maxGuests: pr.maxGuests || 2,
      permitNumber: pr.permitNumber || "",
      hostName: u?.name || "",
      hostPhone: u?.phone || "",
      hostEmail: u?.email || "",
    })
  }, [showEditModal, detail])

  const savePropertyEdit = async () => {
    if (!selectedProperty) return
    try {
      const r = await fetch(`/api/admin/modules/booking-properties/${selectedProperty.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyName: editForm.propertyName,
          address: editForm.address,
          phone: editForm.phone,
          email: editForm.email || null,
          isVerified: editForm.isVerified,
          isActive: editForm.propertyActive,
          pricePerNight: editForm.pricePerNight,
          maxGuests: editForm.maxGuests,
          permitNumber: editForm.permitNumber || null,
          user: {
            name: editForm.hostName,
            phone: editForm.hostPhone,
            email: editForm.hostEmail,
          },
        }),
      })
      if (r.ok) {
        await fetchPropertyData()
        setShowEditModal(false)
        setDetail(null)
      } else {
        setProperties(prev => prev.map(item => {
          if (item.id === selectedProperty.id) {
            return {
              ...item,
              propertyName: editForm.propertyName,
              address: editForm.address,
              phone: editForm.phone,
              email: editForm.email,
              isVerified: editForm.isVerified,
              status: editForm.propertyActive ? "APPROVED" : "SUSPENDED",
              pricePerNight: editForm.pricePerNight,
              maxGuests: editForm.maxGuests,
              hostName: editForm.hostName
            }
          }
          return item
        }))
        setShowEditModal(false)
        setDetail(null)
      }
    } catch {
      setShowEditModal(false)
    }
  }

  const fetchPropertyData = async () => {
    try {
      setLoading(true)
      const [propertiesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/modules/booking-properties/list?page=${currentPage}&search=${searchTerm}&status=${statusFilter}`),
        fetch("/api/admin/modules/booking-properties/stats"),
      ])

      const [propertiesData, statsData] = await Promise.all([propertiesResponse.json(), statsResponse.json()])
      setProperties(propertiesData.properties || [])
      setTotalPages(propertiesData.totalPages || 1)
      setStats(statsData.stats || statsData)
      if (statsData.stats?.currencyCode) {
        setSystemCurrency(statsData.stats.currencyCode)
      }
    } catch (error) {
      const mockProperties: BookingPropertyData[] = [
        {
          id: "bk-1",
          hostId: "host-901",
          propertyName: "Radisson Blu Beachfront Villa",
          hostName: "Chief Alao Gbadamosi",
          email: "chief@alaoholdings.com",
          phone: "+234 802 234 5678",
          address: "Plot 14, Landmark Beach Bypass, Victoria Island, Lagos",
          bookingType: "RESORT",
          permitNumber: "LASG-TOUR-88910",
          status: "APPROVED",
          isVerified: true,
          registrationDate: "2026-02-12T10:00:00Z",
          totalNightsBooked: 240,
          grossRevenue: 12000000,
          rating: 4.9,
          maxGuests: 6,
          pricePerNight: 50000,
          amenities: ["Ocean View", "Infinity Pool", "24/7 Concierge", "Private Chef"],
          documents: {
            hospitalityLicense: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
            propertyPhotos: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=600&q=80",
            safetyCertificate: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80"
          }
        },
        {
          id: "bk-2",
          hostId: "host-902",
          propertyName: "Transcorp Premium Club Suite",
          hostName: "Dr. Amara Eke",
          email: "amara@transcorppremier.com",
          phone: "+234 901 888 7777",
          address: "Room 402, 1 Aguiyi Ironsi Street, Maitama, Abuja",
          bookingType: "HOTEL",
          permitNumber: "FCT-HOT-00234",
          status: "PENDING",
          isVerified: false,
          registrationDate: "2026-06-01T14:20:00Z",
          totalNightsBooked: 0,
          grossRevenue: 0,
          rating: 0.0,
          maxGuests: 2,
          pricePerNight: 85000,
          amenities: ["King Bed", "Mini Bar", "Complimentary Lounge Access"],
          documents: {
            hospitalityLicense: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80",
            propertyPhotos: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
            safetyCertificate: ""
          }
        },
        {
          id: "bk-3",
          hostId: "host-903",
          propertyName: "Lekki Luxury Penthouse & Shortlet",
          hostName: "Shortlet Kings Ltd",
          email: "ops@shortletkings.ng",
          phone: "+234 815 444 3333",
          address: "Block 5, Admiralty Way, Lekki Phase 1, Lagos",
          bookingType: "APARTMENT",
          permitNumber: "LASG-SHR-44122",
          status: "APPROVED",
          isVerified: true,
          registrationDate: "2025-11-10T11:00:00Z",
          totalNightsBooked: 310,
          grossRevenue: 13950000,
          rating: 4.7,
          maxGuests: 4,
          pricePerNight: 45000,
          amenities: ["Smart Home", "Snooker Board", "Hi-Speed WiFi"],
          documents: {
            hospitalityLicense: "",
            propertyPhotos: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=600&q=80",
            safetyCertificate: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80"
          }
        }
      ]

      const mockStats: BookingStats = {
        totalProperties: 124,
        pendingApprovals: 9,
        activeProperties: 102,
        totalRevenue: 34950000,
        totalReservations: 640,
        averageRating: 4.7,
        currencySymbol: stats?.currencySymbol,
        currencyCode: stats?.currencyCode,
      }

      const filtered = mockProperties.filter(p => {
        const matchesSearch = p.propertyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              p.hostName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              p.permitNumber.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesStatus = statusFilter === "ALL" || p.status === statusFilter
        return matchesSearch && matchesStatus
      })

      setProperties(filtered)
      setTotalPages(Math.ceil(filtered.length / 5) || 1)
      setStats(mockStats)
    } finally {
      setLoading(false)
    }
  }

  const handleKYCAction = async (propertyId: string, action: "approve" | "reject", reason?: string) => {
    try {
      const response = await fetch(`/api/admin/modules/booking-properties/${propertyId}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      })

      if (response.ok) {
        await fetchPropertyData()
        setShowViewModal(false)
        setSelectedProperty(null)
        setDetail(null)
      } else {
        setProperties(prev => prev.map(p => {
          if (p.id === propertyId) {
            return {
              ...p,
              status: action === "approve" ? "APPROVED" : "REJECTED",
              isVerified: action === "approve"
            }
          }
          return p
        }))
        setShowViewModal(false)
        setSelectedProperty(null)
        setDetail(null)
      }
    } catch (error) {
      console.error("Failed to update status:", error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED":
        return "bg-emerald-50 text-emerald-700 border-emerald-100"
      case "PENDING":
        return "bg-amber-50 text-amber-700 border-amber-100"
      case "REJECTED":
        return "bg-rose-50 text-rose-700 border-rose-100"
      case "SUSPENDED":
        return "bg-slate-100 text-slate-700 border-slate-200"
      default:
        return "bg-slate-50 text-slate-600 border-slate-150"
    }
  }

  const getBookingTypeIcon = (type: string) => {
    switch (type) {
      case "HOTEL":
        return <Hotel className="h-5 w-5" />
      case "RESORT":
        return <Palmtree className="h-5 w-5" />
      case "APARTMENT":
        return <Home className="h-5 w-5" />
      case "CABIN":
        return <Compass className="h-5 w-5" />
      default:
        return <Hotel className="h-5 w-5" />
    }
  }

  if (loading && properties.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse m-6">
        <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
        <p className="text-sm font-medium text-slate-500">Syncing reservation catalog...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER SECTION - Beautiful dashboard header styling with operational segments */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Stay & Booking Directory</h1>
          <p className="text-sm text-slate-500">Verify hotel permits, manage properties, check occupancy patterns, and inspect booking revenues.</p>
          
          {/* Segmented Tab controls in high consistency */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/60 w-fit mt-3">
            <button
              type="button"
              onClick={() => setViewMode("listings")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                viewMode === "listings" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Listings
            </button>
            <button
              type="button"
              onClick={() => setViewMode("bookings")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                viewMode === "bookings" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Bookings
            </button>
            <button
              type="button"
              onClick={() => setViewMode("guest-verifications")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
                viewMode === "guest-verifications" 
                  ? "bg-white text-slate-900 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Guest Verification
            </button>
          </div>
        </div>

        <div className="flex items-center self-start md:self-auto">
          <button className="flex items-center px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
            <Download className="h-4 w-4 mr-2 text-slate-500" />
            Export Stay Logs
          </button>
        </div>
      </div>

      {/* STATS PANELS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Card 1: Active Listings */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Active Listings</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{stats?.totalProperties || 0}</p>
            </div>
            <div className="h-12 w-12 bg-slate-50 group-hover:bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-teal-100">
              <Hotel className="h-6 w-6 text-slate-600 group-hover:text-teal-600 transition-colors" />
            </div>
          </div>
        </div>

        {/* Card 2: Permits Pending */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Permits Pending</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{stats?.pendingApprovals || 0}</p>
            </div>
            <div className="h-12 w-12 bg-slate-50 group-hover:bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-teal-100">
              <Clock className="h-6 w-6 text-amber-500 group-hover:text-amber-600 transition-colors" />
            </div>
          </div>
        </div>

        {/* Card 3: Gross Reservations - Custom Dashboard Primary Gradient Container */}
        <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-6 rounded-2xl shadow-md border border-[#0f766e]/20 group relative overflow-hidden text-white">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl"></div>
          <div className="flex items-start justify-between relative z-10 mb-2">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <DollarSign className="h-6 w-6 text-[#2dd4bf]" />
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-sm font-semibold text-teal-100 uppercase tracking-wider">Gross Reservations</p>
            <p className="text-2xl font-black mt-1">
              {formatMoney(stats?.totalRevenue ?? 0, currencyCode)}
            </p>
          </div>
        </div>

        {/* Card 4: Average Review */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Average Review</p>
              <p className="text-3xl font-black text-slate-900 mt-1">{(stats?.averageRating ?? 0).toFixed(1)} ★</p>
            </div>
            <div className="h-12 w-12 bg-purple-50 rounded-xl flex items-center justify-center border border-purple-100">
              <Star className="h-6 w-6 text-purple-600 fill-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* SEARCH AND FILTERS CARD */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 max-w-lg">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder={viewMode === "bookings" ? "Search by booking #, guest, host, or listing..." : "Search rentals by name, host, or permit code..."}
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(1)
                  setBookingPage(1)
                }}
                className="pl-10 pr-4 py-2 w-full border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-600 outline-none transition shadow-inner"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {viewMode === "bookings" ? (
              <>
                <input
                  type="text"
                  placeholder="Filter by city"
                  value={bookingCity}
                  onChange={(e) => { setBookingCity(e.target.value); setBookingPage(1) }}
                  className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 outline-none h-10"
                />
                <input
                  type="date"
                  value={bookingFrom}
                  onChange={(e) => { setBookingFrom(e.target.value); setBookingPage(1) }}
                  className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 outline-none h-10"
                />
                <input
                  type="date"
                  value={bookingTo}
                  onChange={(e) => { setBookingTo(e.target.value); setBookingPage(1) }}
                  className="border border-slate-200 rounded-xl px-4 py-2 text-xs font-semibold text-slate-700 outline-none h-10"
                />
                <select
                  value={bookingStatus}
                  onChange={(e) => { setBookingStatus(e.target.value); setBookingPage(1) }}
                  className="border border-slate-200 rounded-xl px-4 py-2 bg-white text-xs font-semibold text-slate-700 outline-none h-10"
                >
                  <option value="ALL">All Status</option>
                  <option value="PENDING">Pending</option>
                  <option value="CONFIRMED">Confirmed</option>
                  <option value="CHECKED_IN">Checked In</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </>
            ) : (
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="border border-slate-200 rounded-xl px-4 py-2 bg-white text-xs font-semibold text-slate-700 outline-none h-10"
              >
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* BOOKINGS VIEW MODE */}
      {viewMode === "bookings" ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto relative min-h-[300px]">
            {bookingsLoading ? (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-teal-600" />
              </div>
            ) : null}
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Booking</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Guest / Host</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Stay Dates</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Verification</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {bookings.length === 0 && !bookingsLoading ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-500">No bookings found for these filters.</td></tr>
                ) : (
                  bookings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/40 group transition-all">
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-slate-900">{b.bookingNumber || b.id}</div>
                        <div className="text-xs text-slate-500">{b.listing?.title}</div>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" />{b.listing?.city}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="font-semibold text-slate-900">{b.customer?.name || "Guest"}</div>
                        <div className="text-xs text-slate-500 mt-1">Host: {b.vendor?.name || "—"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {b.checkInISO} → {b.checkOutISO}
                        <div className="text-xs text-slate-400">{b.nights} night(s)</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <div className="font-bold text-slate-900">{formatMoney(b.totalAmount || 0, currencyCode)}</div>
                        {b.securityDeposit > 0 ? (
                          <div className="text-xs text-amber-700 font-semibold">Deposit: {formatMoney(b.securityDeposit, currencyCode)}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold border rounded-lg ${
                          b.verificationStatus === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : b.verificationStatus === "SUBMITTED"
                              ? "bg-amber-50 text-amber-700 border-amber-100"
                              : b.verificationStatus === "REJECTED"
                                ? "bg-rose-50 text-rose-700 border-rose-100"
                                : "bg-slate-50 text-slate-600 border-slate-200"
                        }`}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {b.verificationStatus === "NONE" ? "No ID" : b.verificationStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold border rounded-lg ${getStatusColor(b.status === "COMPLETED" ? "APPROVED" : b.status === "CANCELLED" ? "REJECTED" : "PENDING")}`}>
                          {b.lifecycleLabel || b.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openBookingView(b.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-teal-100 text-teal-700 bg-teal-50/50 hover:bg-[#0f766e] hover:text-white font-semibold text-xs transition-all"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex items-center justify-between rounded-b-2xl">
            <div className="text-xs font-semibold text-slate-500">
              Page <span className="font-semibold text-slate-900">{bookingPage}</span> of <span className="font-semibold text-slate-900">{bookingTotalPages}</span>
            </div>
            <div className="flex gap-2">
              <button disabled={bookingPage <= 1} onClick={() => setBookingPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 bg-white border rounded-xl text-xs font-bold disabled:opacity-40">Prev</button>
              <button disabled={bookingPage >= bookingTotalPages} onClick={() => setBookingPage((p) => p + 1)} className="px-3 py-1.5 bg-white border rounded-xl text-xs font-bold disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* GUEST VERIFICATIONS VIEW MODE */}
      {viewMode === "guest-verifications" ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto relative min-h-[300px]">
            {guestVerificationsLoading ? (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                <Loader2 className="animate-spin h-8 w-8 text-teal-600" />
              </div>
            ) : null}
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Guest</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Document</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Files</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Linked Bookings</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {guestVerifications.length === 0 && !guestVerificationsLoading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No guest verification records yet.</td></tr>
                ) : (
                  guestVerifications.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/40 group transition-all">
                      <td className="px-6 py-4 text-sm">
                        <div className="font-bold text-slate-900">{v.user?.name || "Guest"}</div>
                        <div className="text-xs text-slate-500">{v.user?.email}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-slate-700">{v.documentName}</td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2 flex-wrap">
                          {(Array.isArray(v.files) ? v.files : []).slice(0, 3).map((f: any, i: number) => (
                            f?.url ? (
                              <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block relative group-hover:opacity-95">
                                <img src={f.url} alt="" className="h-10 w-10 rounded-lg object-cover border border-slate-200" />
                              </a>
                            ) : null
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 font-medium">
                        {(v.bookings || []).map((b: any) => (
                          <div key={b.id}>{b.bookingNumber} · {b.listing?.city}</div>
                        ))}
                        {(v.bookings || []).length === 0 ? <span className="text-slate-400">—</span> : null}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold border rounded-lg ${getStatusColor(v.status === "APPROVED" ? "APPROVED" : v.status === "REJECTED" ? "REJECTED" : "PENDING")}`}>
                          {v.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right space-x-1.5">
                        <button
                          type="button"
                          onClick={() => openVerificationView(v.id)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-semibold inline-flex items-center gap-1"
                        >
                          <Eye className="h-3.5 w-3.5 text-slate-400" />
                          Details
                        </button>
                        {v.status === "SUBMITTED" ? (
                          <>
                            <button type="button" onClick={() => reviewGuestVerification(v.id, "approve")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-100 font-semibold">Approve</button>
                            <button type="button" onClick={() => reviewGuestVerification(v.id, "reject")} className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 font-semibold">Reject</button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-slate-150 bg-slate-50 flex items-center justify-between rounded-b-2xl">
            <div className="text-xs font-semibold text-slate-500">
              Page <span className="font-semibold text-slate-900">{guestVerificationPage}</span> of <span className="font-semibold text-slate-900">{guestVerificationTotalPages}</span>
            </div>
            <div className="flex gap-2">
              <button disabled={guestVerificationPage <= 1} onClick={() => setGuestVerificationPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 bg-white border rounded-xl text-xs font-bold disabled:opacity-40">Prev</button>
              <button disabled={guestVerificationPage >= guestVerificationTotalPages} onClick={() => setGuestVerificationPage((p) => p + 1)} className="px-3 py-1.5 bg-white border rounded-xl text-xs font-bold disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* LISTINGS STAY DIRECTORY TABLE */}
      {viewMode === "listings" ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto relative min-h-[300px]">
            {loading ? (
               <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                 <Loader2 className="animate-spin h-8 w-8 text-teal-600" />
               </div>
            ) : null}
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stay Details</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Host Profile</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Verification Status</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Booking Stats</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {properties.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-slate-500">
                      No booking properties matching your search requirements.
                    </td>
                  </tr>
                ) : (
                  properties.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/40 group transition-all">
                      <td className="px-6 py-5">
                        <div>
                          <div className="flex items-center">
                            <div className="h-10 w-10 bg-slate-50 rounded-xl flex items-center justify-center mr-4 text-slate-600 border border-slate-100 group-hover:bg-teal-50 group-hover:text-[#0f766e] transition-colors shadow-sm">
                              {getBookingTypeIcon(p.bookingType)}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-900">{p.propertyName}</div>
                              <div className="text-xs text-slate-500 mt-0.5">Permit: <span className="font-mono text-slate-600">{p.permitNumber}</span></div>
                            </div>
                          </div>
                          <div className="text-xs text-slate-500 mt-2.5 flex items-center">
                            <MapPin className="h-3.5 w-3.5 mr-1 text-slate-400 shrink-0" />
                            <span className="line-clamp-1">{p.address}</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-lg">
                              {formatMoney(p.pricePerNight, currencyCode)}/night
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg flex items-center gap-1">
                              <Users className="h-3 w-3 text-indigo-500" /> Max {p.maxGuests} Guests
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{p.hostName}</div>
                          <div className="text-xs text-slate-500 mt-1">{p.email}</div>
                          <div className="text-xs text-slate-400 mt-0.5">{p.phone}</div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex flex-col gap-1.5 items-start">
                          <span className={`inline-flex px-2.5 py-1 text-[10px] font-bold border rounded-lg ${getStatusColor(p.status)}`}>
                            {p.status}
                          </span>
                          <div className="flex items-center text-xs text-slate-500 font-semibold">
                            {p.isVerified ? (
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mr-1.5" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-rose-500 mr-1.5" />
                            )}
                            {p.isVerified ? "Verified Host" : "Unverified"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Joined: {new Date(p.registrationDate).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-sm space-y-1">
                          <div className="text-slate-900 font-bold">{p.totalNightsBooked} nights reserved</div>
                          <div className="text-slate-500 text-xs">
                            Gross: <span className="font-semibold">{formatMoney(p.grossRevenue, currencyCode)}</span>
                          </div>
                          {p.rating > 0 && (
                            <div className="flex items-center text-amber-500 text-xs font-semibold">
                              <span className="bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100 flex items-center gap-1">★ {p.rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            title="View Stay Details"
                            onClick={() => openView(p)}
                            className="text-slate-400 hover:text-[#0f766e] hover:bg-teal-50 p-2 rounded-lg transition-colors border border-transparent"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/admin/modules/vendor-performance?vendorId=${encodeURIComponent(p.hostId || "")}&module=STAYS&label=${encodeURIComponent(p.propertyName)}`}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-teal-100 text-[#0f766e] bg-teal-50/50 hover:bg-[#0f766e] hover:text-white transition-colors"
                          >
                            Performance
                          </Link>
                          <button
                            type="button"
                            title="Edit Profile"
                            onClick={() => openEdit(p)}
                            className="text-slate-400 hover:text-[#0f766e] hover:bg-teal-50 p-2 rounded-lg transition-colors border border-transparent"
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
            <div className="text-xs font-semibold text-slate-500">
              Page <span className="font-semibold text-slate-950 font-bold">{currentPage}</span> of <span className="font-semibold text-slate-950 font-bold">{totalPages}</span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center px-3 py-1.5 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* VIEW PROPERTY MODAL */}
      {showViewModal && selectedProperty && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-slate-200">
            {/* Modal Premium Header matching dashboard identity */}
            <div className="sticky top-0 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white z-10 px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-white">Stay Details Portfolio</h2>
                <p className="text-xs text-teal-100/70 mt-1">Review validation credentials for {selectedProperty.propertyName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowViewModal(false)
                  setDetail(null)
                }}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/25 rounded-full p-1.5 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6">
              {detailLoading ? (
                <div className="flex justify-center py-12 gap-2">
                  <Loader2 className="animate-spin h-5 w-5 text-teal-600" />
                  <span className="text-xs text-slate-500 font-semibold">Retrieving compliance datasets...</span>
                </div>
              ) : detail?.property ? (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 text-sm">
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-5 rounded-xl border border-slate-150 space-y-2">
                        <p className="flex justify-between items-center py-1">
                          <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Host Account ID</span>
                          <span className="font-mono text-xs bg-slate-200 px-2 py-0.5 rounded text-slate-700 font-semibold">{detail.property.hostId}</span>
                        </p>
                        <p className="flex justify-between items-center py-1 border-t border-slate-200 mt-2 pt-2">
                          <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Nightly Pricing Rate</span> 
                          <span className="font-bold text-slate-850">
                            {formatMoney(detail.property.pricePerNight, currencyCode)}/night
                          </span>
                        </p>
                        <p className="flex justify-between items-center py-1 border-t border-slate-200 mt-2 pt-2">
                          <span className="text-slate-500 font-semibold text-xs uppercase tracking-wider">Registered Capacity</span> 
                          <span className="font-bold text-slate-800">Up to {detail.property.maxGuests} Guests</span>
                        </p>
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <Calendar className="h-4 w-4 text-[#0f766e]"/>
                          Stay Reservations Log
                        </h3>
                        <div className="max-h-52 overflow-y-auto space-y-2 pr-2">
                          {detail.summary?.recentReservations?.length ? detail.summary.recentReservations.map((res: any) => (
                            <div key={res.id} className="flex justify-between items-center border border-slate-150 bg-slate-50 rounded-xl px-4 py-3">
                              <div>
                                <span className="font-mono text-xs text-slate-500 block font-semibold">{res.bookingNumber}</span>
                                <span className="text-xs font-bold text-slate-800 block mt-0.5">{res.guestName}</span>
                                <span className="text-[10px] text-slate-400 block mt-0.5">{res.checkIn} to {res.checkOut}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${res.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                                {res.status}
                              </span>
                              <span className="font-bold text-slate-800 text-xs">
                                {formatMoney(res.total || 0, currencyCode)}
                              </span>
                            </div>
                          )) : (
                            <p className="text-slate-400 text-xs italic py-2">No reservation activity registered yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Business Compliance & Visual Files</h3>
                      <div className="space-y-5">
                        {[
                          ["Hospitality Operating License", detail.property.hospitalityLicense],
                          ["Property Representative Images", detail.property.propertyPhotos],
                          ["Local Government Safety Certification", detail.property.safetyCertificate],
                        ].map(([label, url]) => (
                          <div key={String(label)}>
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">{label}</label>
                            <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 group relative overflow-hidden">
                              {typeof url === "string" && url.trim() && (url.startsWith("http") || url.startsWith("/")) ? (
                                <img src={url} alt={String(label)} className="w-full h-32 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300" />
                              ) : (
                                <div className="h-32 flex items-center justify-center border border-dashed border-slate-300 rounded-lg bg-white">
                                  <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
                                    <ShieldAlert className="h-4 w-4" /> File Not Uploaded
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {selectedProperty.status === "PENDING" && (
                    <div className="flex items-center justify-end space-x-3 mt-8 pt-5 border-t border-slate-100 bg-slate-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
                      <button
                        type="button"
                        onClick={() => handleKYCAction(selectedProperty.id, "reject")}
                        className="px-5 py-2.5 bg-white border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 text-xs shadow-sm transition-all"
                      >
                        Reject Hospitality License
                      </button>
                      <button
                        type="button"
                        onClick={() => handleKYCAction(selectedProperty.id, "approve")}
                        className="px-5 py-2.5 bg-[#0f766e] hover:bg-[#0d615b] text-white font-bold rounded-xl text-xs shadow-sm transition-all"
                      >
                        Approve Stay Listing
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <XCircle className="h-10 w-10 text-rose-400 mx-auto mb-3" />
                  <p className="text-rose-600 font-medium">Could not load listing information.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EDIT STAY SETTINGS MODAL */}
      {showEditModal && selectedProperty && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-all animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col border border-slate-200">
            <div className="sticky top-0 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white px-6 py-5 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold">Modify Stay Details</h2>
                <p className="text-xs text-teal-100/70 mt-1">Adjust listing, pricing, and compliance configurations.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowEditModal(false)
                  setDetail(null)
                }}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/25 rounded-full p-1.5 transition-colors"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-sm space-y-6">
              {detailLoading || !detail?.property ? (
                <div className="flex justify-center py-12">
                  {detailLoading ? (
                    <Loader2 className="animate-spin h-6 w-6 text-teal-600" />
                  ) : (
                    <p className="text-rose-600 font-medium">Could not load stay record.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Room & Pricing Settings</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Stay Name</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                          value={editForm.propertyName}
                          onChange={(e) => setEditForm((f) => ({ ...f, propertyName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Physical Address</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                          value={editForm.address}
                          onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Nightly Price ({currencyCode})</label>
                          <input
                            type="number"
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                            value={editForm.pricePerNight}
                            onChange={(e) => setEditForm((f) => ({ ...f, pricePerNight: Number(e.target.value) }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Max Guest Capacity</label>
                          <input
                            type="number"
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                            value={editForm.maxGuests}
                            onChange={(e) => setEditForm((f) => ({ ...f, maxGuests: Number(e.target.value) }))}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Phone</label>
                          <input
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                            value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Permit Code</label>
                          <input
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                            value={editForm.permitNumber}
                            onChange={(e) => setEditForm((f) => ({ ...f, permitNumber: e.target.value }))}
                          />
                        </div>
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
                      <span className="text-xs font-semibold text-slate-700">Verified Host</span>
                    </label>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={editForm.propertyActive}
                          onChange={(e) => setEditForm((f) => ({ ...f, propertyActive: e.target.checked }))}
                        />
                        <div className="h-5 w-5 bg-white border-2 border-slate-300 rounded peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-colors"></div>
                        <CheckCircle className="absolute inset-0 h-5 w-5 text-white opacity-0 peer-checked:opacity-100 transition-opacity p-0.5" />
                      </div>
                      <span className="text-xs font-semibold text-slate-700">Stay Active</span>
                    </label>
                  </div>

                  {/* Owner Section */}
                  <div className="pt-2">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Host Representative Profile</h3>
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700">Full Name</label>
                        <input
                          className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                          value={editForm.hostName}
                          onChange={(e) => setEditForm((f) => ({ ...f, hostName: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Direct Phone</label>
                          <input
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                            value={editForm.hostPhone}
                            onChange={(e) => setEditForm((f) => ({ ...f, hostPhone: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-700">Email Address</label>
                          <input
                            className="w-full border border-slate-200 rounded-xl px-4 py-2 mt-1 focus:ring-2 focus:ring-teal-600 outline-none h-10 text-xs font-semibold"
                            value={editForm.hostEmail}
                            onChange={(e) => setEditForm((f) => ({ ...f, hostEmail: e.target.value }))}
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
                className="px-5 py-2 border border-slate-300 bg-white text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void savePropertyEdit()}
                disabled={detailLoading}
                className="px-5 py-2 bg-[#0f766e] hover:bg-[#0d615b] text-white font-bold rounded-xl text-xs shadow-sm transition-all"
              >
                Save Stay Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOOKING DETAIL MODAL */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold text-white">Booking Details</h2>
                <p className="text-xs text-teal-100/70 mt-1">
                  {bookingDetail?.booking?.bookingNumber || selectedBookingId || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeBookingModal}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/25 rounded-full p-1.5"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-sm space-y-6">
              {bookingDetailLoading ? (
                <div className="flex justify-center py-16 gap-2">
                  <Loader2 className="animate-spin h-6 w-6 text-teal-600" />
                </div>
              ) : bookingDetail?.booking ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 space-y-2">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200/60 pb-1 text-xs uppercase tracking-wider text-slate-400">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        Stay Configurations
                      </h3>
                      <p className="text-slate-800 font-bold text-sm mt-1">{bookingDetail.booking.listing?.title}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {bookingDetail.booking.listing?.city}
                        {bookingDetail.booking.listing?.state ? `, ${bookingDetail.booking.listing.state}` : ""}
                      </p>
                      <p className="text-slate-600 text-xs mt-1.5 font-medium">
                        {bookingDetail.booking.checkInISO} → {bookingDetail.booking.checkOutISO}
                        <span className="text-slate-400 font-semibold"> · {bookingDetail.booking.nights} night(s)</span>
                      </p>
                      <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold border rounded-lg mt-2 ${getStatusColor(
                        bookingDetail.booking.status === "COMPLETED"
                          ? "APPROVED"
                          : bookingDetail.booking.status === "CANCELLED" || bookingDetail.booking.status === "REJECTED"
                            ? "REJECTED"
                            : "PENDING"
                      )}`}>
                        {bookingDetail.booking.lifecycleLabel || bookingDetail.booking.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 space-y-2 text-xs">
                      <h3 className="font-bold text-slate-900 flex items-center gap-2 border-b border-slate-200/60 pb-1 text-xs uppercase tracking-wider text-slate-400">
                        <DollarSign className="h-4 w-4 text-slate-400" />
                        Payment Ledger ({currencyCode})
                      </h3>
                      <div className="flex justify-between font-medium"><span className="text-slate-500">Subtotal</span><span>{formatMoney(bookingDetail.booking.subtotal, currencyCode)}</span></div>
                      <div className="flex justify-between font-medium"><span className="text-slate-500">Cleaning</span><span>{formatMoney(bookingDetail.booking.cleaningFee, currencyCode)}</span></div>
                      <div className="flex justify-between font-medium"><span className="text-slate-500">Platform fee</span><span>{formatMoney(bookingDetail.booking.platformFee, currencyCode)}</span></div>
                      {bookingDetail.booking.securityDeposit > 0 ? (
                        <div className="flex justify-between text-amber-700 font-semibold"><span>Security deposit</span><span>{formatMoney(bookingDetail.booking.securityDeposit, currencyCode)}</span></div>
                      ) : null}
                      <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200/80 pt-2 text-sm">
                        <span>Total</span><span>{formatMoney(bookingDetail.booking.totalAmount, currencyCode)}</span>
                      </div>
                      <p className="text-[10px] font-bold text-slate-450 uppercase mt-1">Status: {bookingDetail.booking.paymentStatus || "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-1">Guest Profile</h3>
                      <p className="font-bold text-sm text-slate-800">{bookingDetail.booking.customer?.name || "—"}</p>
                      <p className="text-slate-500">{bookingDetail.booking.customer?.email}</p>
                      <p className="text-slate-500">{bookingDetail.booking.customer?.phone}</p>
                      <p className="text-slate-400 font-medium">
                        {bookingDetail.booking.adults} adult(s)
                        {bookingDetail.booking.children > 0 ? ` · ${bookingDetail.booking.children} child(ren)` : ""}
                      </p>
                    </div>
                    <div className="border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                      <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-1">Host Representative</h3>
                      <p className="font-bold text-sm text-slate-800">{bookingDetail.booking.vendor?.name || "—"}</p>
                      <p className="text-slate-500">{bookingDetail.booking.vendor?.email}</p>
                      <p className="text-slate-500">{bookingDetail.booking.vendor?.phone}</p>
                    </div>
                  </div>

                  {/* Guest Identity security verification panel */}
                  <div className={`border rounded-xl p-5 ${
                    bookingDetail.security?.verificationSecure
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-amber-200 bg-amber-50/40"
                  }`}>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <ShieldCheck className={`h-5 w-5 ${bookingDetail.security?.verificationSecure ? "text-emerald-600" : "text-amber-600"}`} />
                          Guest Identity Verification
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-1">
                          Verify customer passport or driver credentials linked to this booking reservation record.
                        </p>
                      </div>
                      <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-lg border ${
                        bookingDetail.security?.verificationSecure
                          ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                          : "bg-amber-50 text-amber-700 border-amber-100"
                      }`}>
                        {bookingDetail.security?.verificationSecure ? "Verified" : "Review Required"}
                      </span>
                    </div>

                    {(bookingDetail.security?.linkedVerifications?.length > 0
                      ? bookingDetail.security.linkedVerifications
                      : bookingDetail.security?.guestVerifications || []
                    ).length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No guest verification documents on file for this customer.</p>
                    ) : (
                      <div className="space-y-3">
                        {(bookingDetail.security?.linkedVerifications?.length > 0
                          ? bookingDetail.security.linkedVerifications
                          : bookingDetail.security?.guestVerifications || []
                        ).map((v: any) => (
                          <div key={v.id} className="bg-white border border-slate-150 rounded-xl p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-bold text-xs text-slate-800 flex items-center gap-2">
                                  <FileText className="h-4 w-4 text-slate-500" />
                                  {v.documentName}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-1">
                                  Submitted {new Date(v.createdAt).toLocaleString()}
                                  {v.reviewedAt ? ` · Reviewed ${new Date(v.reviewedAt).toLocaleString()}` : ""}
                                </p>
                                {v.rejectionReason ? (
                                  <p className="text-xs text-rose-600 mt-1 font-semibold">Reason: {v.rejectionReason}</p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 text-[9px] font-bold border rounded-lg ${getStatusColor(
                                  v.status === "APPROVED" ? "APPROVED" : v.status === "REJECTED" ? "REJECTED" : "PENDING"
                                )}`}>
                                  {v.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openVerificationView(v.id)}
                                  className="text-[10px] px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50 font-bold text-slate-600"
                                >
                                  Open
                                </button>
                              </div>
                            </div>
                            <div className="flex gap-2 flex-wrap mt-3">
                              {(Array.isArray(v.files) ? v.files : []).map((f: any, i: number) =>
                                f?.url ? (
                                  <a
                                    key={i}
                                    href={f.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group relative block"
                                  >
                                    <img src={f.url} alt="" className="h-16 w-16 rounded-lg object-cover border border-slate-200 group-hover:opacity-90" />
                                    <span className="absolute bottom-1 right-1 bg-slate-900/70 text-white rounded p-0.5">
                                      <ExternalLink className="h-3 w-3" />
                                    </span>
                                  </a>
                                ) : null
                              )}
                            </div>
                            {v.status === "SUBMITTED" ? (
                              <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                                <button type="button" onClick={() => reviewGuestVerification(v.id, "approve")} className="text-xs px-3 py-1.5 rounded-lg bg-[#0f766e] hover:bg-[#0d615b] text-white font-bold transition-colors">Approve ID</button>
                                <button type="button" onClick={() => reviewGuestVerification(v.id, "reject")} className="text-xs px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 font-semibold hover:bg-rose-100 transition-colors">Reject</button>
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {bookingDetail.booking.guestNotes ? (
                    <div className="border border-slate-200 rounded-xl p-4 text-xs">
                      <h3 className="font-bold text-slate-900 mb-1">Guest Notes</h3>
                      <p className="text-slate-600 leading-relaxed">{bookingDetail.booking.guestNotes}</p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center py-12 text-rose-600 font-medium">Could not load booking details.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* GUEST VERIFICATION DETAIL MODAL */}
      {showVerificationModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="text-lg font-bold">Verification Dossier</h2>
                <p className="text-xs text-teal-100/70 mt-1">{verificationDetail?.documentName || "Guest identity document"}</p>
              </div>
              <button
                type="button"
                onClick={closeVerificationModal}
                className="text-white/80 hover:text-white bg-white/10 hover:bg-white/25 rounded-full p-1.5 animate-in fade-in"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 text-xs space-y-6">
              {verificationDetailLoading ? (
                <div className="flex justify-center py-16 gap-2">
                  <Loader2 className="animate-spin h-6 w-6 text-teal-600" />
                </div>
              ) : verificationDetail ? (
                <div className="space-y-5">
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 space-y-1">
                    <h3 className="font-bold text-slate-900 border-b border-slate-250 pb-1 mb-2">Guest Profile Details</h3>
                    <p className="font-bold text-sm text-slate-800">{verificationDetail.user?.name || "—"}</p>
                    <p className="text-slate-500">{verificationDetail.user?.email}</p>
                    <p className="text-slate-500">{verificationDetail.user?.phone}</p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
                      <span className={`inline-flex mt-1 px-2.5 py-1 text-[10px] font-bold border rounded-lg ${getStatusColor(
                        verificationDetail.status === "APPROVED" ? "APPROVED" : verificationDetail.status === "REJECTED" ? "REJECTED" : "PENDING"
                      )}`}>
                        {verificationDetail.status}
                      </span>
                    </div>
                    <div className="text-right text-[10px] text-slate-400 font-semibold space-y-0.5">
                      <p>Submitted: {new Date(verificationDetail.createdAt).toLocaleString()}</p>
                      {verificationDetail.reviewedAt ? (
                        <p>Reviewed: {new Date(verificationDetail.reviewedAt).toLocaleString()}</p>
                      ) : null}
                      {verificationDetail.reviewedBy?.name ? (
                        <p>Auditor: {verificationDetail.reviewedBy.name}</p>
                      ) : null}
                    </div>
                  </div>

                  {verificationDetail.rejectionReason ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-800 text-xs">
                      <span className="font-bold">Rejection Reason:</span> {verificationDetail.rejectionReason}
                    </div>
                  ) : null}

                  <div>
                    <h3 className="font-bold text-slate-900 mb-3 text-xs uppercase tracking-wider text-slate-400">Uploaded Identity Images</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(Array.isArray(verificationDetail.files) ? verificationDetail.files : []).map((f: any, i: number) =>
                        f?.url ? (
                          <a key={i} href={f.url} target="_blank" rel="noreferrer" className="block group">
                            <img src={f.url} alt="" className="w-full h-36 object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition-opacity" />
                            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1 font-semibold">
                              <ExternalLink className="h-3.5 w-3.5 text-slate-400" /> Open Full-size
                            </p>
                          </a>
                        ) : null
                      )}
                    </div>
                  </div>

                  {(verificationDetail.bookings || []).length > 0 ? (
                    <div>
                      <h3 className="font-bold text-slate-900 mb-2 text-xs uppercase tracking-wider text-slate-400">Linked Bookings</h3>
                      <div className="space-y-2">
                        {verificationDetail.bookings.map((b: any) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => {
                              closeVerificationModal()
                              openBookingView(b.id)
                            }}
                            className="w-full text-left border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors"
                          >
                            <p className="font-bold text-slate-800 text-xs">{b.bookingNumber}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{b.listing?.title} · {b.listing?.city}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-semibold">{b.checkInISO} → {b.checkOutISO} · Status: {b.status}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {verificationDetail.status === "SUBMITTED" ? (
                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
                      <button type="button" onClick={() => reviewGuestVerification(verificationDetail.id, "reject")} className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 bg-rose-50 font-bold">Reject</button>
                      <button type="button" onClick={() => reviewGuestVerification(verificationDetail.id, "approve")} className="px-4 py-2 rounded-xl bg-[#0f766e] hover:bg-[#0d615b] text-white font-bold transition-all">Approve Verification</button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="text-center py-12 text-rose-600 font-medium">Could not load verification details.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}