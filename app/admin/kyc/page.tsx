"use client"

import { useState, useEffect, useMemo } from "react"
import { 
  Search, Filter, Eye, CheckCircle, XCircle, Download, 
  FileText, User, Store, Bike, Utensils, ShoppingCart, 
  AlertCircle, Calendar, ShieldAlert, ChevronRight, 
  LayoutGrid, ArrowUpRight, ArrowDownRight, TrendingUp,
  Loader2, Sparkles, Activity
} from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"

// --- Interfaces ---
type KycModuleType =
  | "PHARMACY"
  | "RIDER"
  | "AUTO_PARTS"
  | "FOOD"
  | "GROCERY"
  | "WHOLESALER"
  | "FOOD_AND_GROCERY"
  | "MECHANIC"

interface RejectionHistoryItem {
  id: string
  rejectionReason: string
  rejectedFields: any
  rejectedBy: string
  rejectedAt: string
  isResolved: boolean
}

interface PendingKycItem {
  id: string
  type: KycModuleType
  name: string
  contactEmail: string
  contactPhone: string
  status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED"
  registeredDate: string // ISO String
  details: any
  rejectionHistory?: RejectionHistoryItem[]
}

interface StatMetric {
  total: number
  growth: number // Percentage
  trend: "up" | "down" | "neutral"
}

export default function KycManagementPage() {
  const [pendingKyc, setPendingKyc] = useState<PendingKycItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [typeFilter, setTypeFilter] = useState<KycModuleType | "ALL">("ALL")
  
  // Modal State
  const [selectedKycItem, setSelectedKycItem] = useState<PendingKycItem | null>(null)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const [rejectedFields, setRejectedFields] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    fetchPendingKyc()
  }, [])

  const fetchPendingKyc = async () => {
    setLoading(true)
    try {
      // Simulation of API calls - In production, keep your existing fetch logic
      const endpoints = [
        { url: '/api/admin/modules/pharmacy/list?status=PENDING', type: 'PHARMACY' },
        { url: '/api/admin/modules/rider/list?status=PENDING', type: 'RIDER' },
        { url: '/api/admin/modules/auto-parts/list?status=PENDING', type: 'AUTO_PARTS' },
        { url: '/api/admin/modules/food/list?status=PENDING', type: 'FOOD' },
        { url: '/api/admin/modules/grocery/list?status=PENDING', type: 'GROCERY' },
        { url: '/api/admin/modules/wholesaler/list?status=PENDING', type: 'WHOLESALER' },
        { url: '/api/admin/modules/ /list?status=PENDING', type: 'MECHANIC' },
      ]

      const responses = await Promise.all(
        endpoints.map((ep) =>
          fetch(ep.url, { credentials: "include" }).then((res) => res.json().catch(() => ({})))
        )
      )
      
      let combinedData: PendingKycItem[] = []

      // Normalizers
      if(responses[0]?.pharmacies) combinedData = [...combinedData, ...responses[0].pharmacies.map((p: any) => normalizeData(p, 'PHARMACY', p.name, p.registrationDate, p.rejectionHistory))]
      if(responses[1]?.riders) combinedData = [...combinedData, ...responses[1].riders.map((p: any) => normalizeData(p, 'RIDER', p.name, p.createdAt, p.rejectionHistory))]
      if(responses[2]?.stores) combinedData = [...combinedData, ...responses[2].stores.map((p: any) => normalizeData(p, 'AUTO_PARTS', p.businessName, p.createdAt, p.rejectionHistory))]
      if(responses[3]?.restaurants) combinedData = [...combinedData, ...responses[3].restaurants.map((p: any) => normalizeData(p, 'FOOD', p.name, p.createdAt, p.rejectionHistory))]
      if(responses[4]?.stores) combinedData = [...combinedData, ...responses[4].stores.map((p: any) => normalizeData(p, 'GROCERY', p.storeName, p.createdAt, p.rejectionHistory))]
      if(responses[5]?.wholesalers) combinedData = [...combinedData, ...responses[5].wholesalers.map((p: any) => normalizeData(p, 'WHOLESALER', p.name, p.createdAt || p.registrationDate, p.rejectionHistory))]
      if(responses[6]?.mechanics) combinedData = [...combinedData, ...responses[6].mechanics.map((p: any) => normalizeData(p, 'MECHANIC', p.name, p.createdAt || p.registrationDate, p.rejectionHistory))]
      // Sort by newest first
      combinedData.sort((a, b) => new Date(b.registeredDate).getTime() - new Date(a.registeredDate).getTime())

      setPendingKyc(combinedData)
    } catch (error) {
      console.error("Failed to fetch pending KYC data:", error)
    } finally {
      setLoading(false)
    }
  }

  const normalizeData = (data: any, type: KycModuleType, name: string, date: string, rejectionHistory?: RejectionHistoryItem[]): PendingKycItem => ({
    id: data.id,
    type: type as KycModuleType,
    name: name || "Unknown Name",
    contactEmail: data.email || "No Email",
    contactPhone: data.phone || "No Phone",
    status: data.status,
    registeredDate: date || new Date().toISOString(),
    details: data,
    rejectionHistory: rejectionHistory || data.rejectionHistory || [],
  })

  // --- Filtering ---
  const filteredKyc = useMemo(() => {
    return pendingKyc.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.contactEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.contactPhone.includes(searchTerm) || 
        item.id.toLowerCase().includes(searchTerm.toLowerCase())
      
      let matchesType = false
      if (typeFilter === "ALL") {
        matchesType = true
      } else if (typeFilter === "FOOD_AND_GROCERY") {
        matchesType = item.type === "FOOD" || item.type === "GROCERY"
      } else {
        matchesType = item.type === typeFilter
      }
      
      return matchesSearch && matchesType
    })
  }, [pendingKyc, searchTerm, typeFilter])

  // --- Reporting & Stats Logic ---
  const calculateStats = (type: KycModuleType | "ALL"): StatMetric => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    // Logic for Last Month
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = lastMonthDate.getMonth()
    const lastMonthYear = lastMonthDate.getFullYear()

    // Filter by type first
    let relevantItems: PendingKycItem[]
    if (type === "ALL") {
      relevantItems = pendingKyc
    } else if (type === "FOOD_AND_GROCERY") {
      // Combine both FOOD and GROCERY types
      relevantItems = pendingKyc.filter(i => i.type === "FOOD" || i.type === "GROCERY")
    } else {
      relevantItems = pendingKyc.filter(i => i.type === type)
    }

    let currentMonthCount = 0
    let lastMonthCount = 0

    relevantItems.forEach(item => {
      const d = new Date(item.registeredDate)
      if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
        currentMonthCount++
      } else if (d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear) {
        lastMonthCount++
      }
    })

    // Calculate Growth
    let growth = 0
    let trend: "up" | "down" | "neutral" = "neutral"

    if (lastMonthCount === 0) {
      growth = currentMonthCount > 0 ? 100 : 0
      trend = currentMonthCount > 0 ? "up" : "neutral"
    } else {
      growth = ((currentMonthCount - lastMonthCount) / lastMonthCount) * 100
      trend = growth > 0 ? "up" : growth < 0 ? "down" : "neutral"
    }

    return {
      total: relevantItems.length,
      growth: Math.round(Math.abs(growth)),
      trend
    }
  }

  // --- Actions ---
  const handleExport = () => {
    if (filteredKyc.length === 0) return

    // Define CSV Headers
    const headers = ["ID", "Name", "Type", "Email", "Phone", "Registered Date", "Status"]
    
    // Map Data to CSV Rows
    const rows = filteredKyc.map(item => [
      item.id,
      `"${item.name.replace(/"/g, '""')}"`, // Escape quotes
      item.type,
      item.contactEmail,
      `'${item.contactPhone}`, // Force string for phone
      new Date(item.registeredDate).toLocaleDateString(),
      item.status
    ])

    // Build CSV Content
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n")

    // Trigger Download
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `kyc_export_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleKycAction = async (id: string, type: KycModuleType, action: "approve" | "reject") => {
    if (action === "reject" && !rejectionReason.trim()) {
      alert("Please provide a reason for rejection.")
      return
    }

    setIsProcessing(true)
    try {
      const endpointMap: Partial<Record<KycModuleType, string>> = {
        PHARMACY: "pharmacy",
        RIDER: "rider",
        AUTO_PARTS: "auto-parts",
        FOOD: "food",
        GROCERY: "grocery",
        WHOLESALER: "wholesaler",
        MECHANIC: "mechanic",
        FOOD_AND_GROCERY: "food" // This won't be used for actions, but needed for type safety
      }
      
      // FOOD_AND_GROCERY is not a valid action type, so we skip it
      if (type === "FOOD_AND_GROCERY") {
        alert("Cannot perform action on combined Food/Grocery type. Please select a specific type.")
        setIsProcessing(false)
        return
      }
      
      const endpoint = endpointMap[type]
      if (!endpoint) {
        alert("Invalid module type")
        setIsProcessing(false)
        return
      }

      const payload: any = { 
        action, 
        reason: action === "reject" ? rejectionReason : undefined,
        status: action === "approve" ? "APPROVED" : "REJECTED" 
      }
      
      if (action === "reject" && rejectedFields.length > 0) payload.rejectedFields = rejectedFields

      const response = await fetch(`/api/admin/modules/${endpoint}/${id}/kyc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        setPendingKyc(prev => prev.filter(item => item.id !== id))
        setShowDetailsModal(false)
        setSelectedKycItem(null)
      } else {
        alert("Action failed. Please try again.")
      }
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setIsProcessing(false)
    }
  }

  // --- Render Helpers ---
  const getTypeStyles = (type: KycModuleType) => {
    switch (type) {
      case "PHARMACY": return { bg: "bg-rose-50", text: "text-rose-700", ring: "border-rose-200" }
      case "RIDER": return { bg: "bg-blue-50", text: "text-blue-700", ring: "border-blue-200" }
      case "FOOD": return { bg: "bg-amber-50", text: "text-amber-700", ring: "border-amber-200" }
      case "GROCERY": return { bg: "bg-emerald-50", text: "text-emerald-700", ring: "border-emerald-200" }
      case "FOOD_AND_GROCERY": return { bg: "bg-amber-50", text: "text-amber-700", ring: "border-amber-200" }
      case "AUTO_PARTS": return { bg: "bg-purple-50", text: "text-purple-700", ring: "border-purple-200" }
      case "WHOLESALER": return { bg: "bg-cyan-50", text: "text-cyan-700", ring: "border-cyan-200" }
      case "MECHANIC": return { bg: "bg-indigo-50", text: "text-indigo-700", ring: "border-indigo-200" }
      default: return { bg: "bg-slate-50", text: "text-slate-700", ring: "border-slate-200" }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] bg-transparent">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col items-center animate-pulse">
          <Loader2 className="h-10 w-10 animate-spin text-teal-600 mb-4" />
          <p className="text-sm font-bold text-slate-700">Synchronizing Applications...</p>
          <p className="text-xs text-slate-500 mt-1">Retrieving pending KYC profiles securely.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* 1. BRANDED HEADER with Premium Teal Gradient */}
      <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-8 rounded-3xl shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between border border-[#0f766e]/20">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-10 bottom-0 h-32 w-32 rounded-full bg-teal-400/10 blur-3xl"></div>
        
        <div className="relative z-10 flex items-center gap-5">
          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
            <ShieldAlert className="h-8 w-8 text-teal-300" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">KYC Verifications</h1>
            <p className="text-teal-100/80 mt-1.5 font-medium max-w-md">Manage incoming vendor applications and rider validations.</p>
          </div>
        </div>

        <div className="relative z-10 mt-6 md:mt-0 flex gap-3">
          <Button 
            onClick={handleExport}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm transition-all h-11 rounded-xl px-5"
          >
            <Download className="h-4 w-4 mr-2" /> 
            Export Report
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        
        {/* 2. ADVANCED STATISTICS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total Pending" icon={AlertCircle} metric={calculateStats("ALL")} color="teal" />
          <StatCard title="Pharmacies" icon={FileText} metric={calculateStats("PHARMACY")} color="rose" />
          <StatCard title="Riders" icon={Bike} metric={calculateStats("RIDER")} color="blue" />
          <StatCard title="Food/Grocery" icon={Utensils} metric={calculateStats("FOOD_AND_GROCERY")} color="amber" />
          <StatCard title="Auto Parts" icon={Store} metric={calculateStats("AUTO_PARTS")} color="purple" />
        </div>

        {/* 3. CONTROL PANEL */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-col md:flex-row gap-5 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                placeholder="Search by Name, ID, Phone or Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 border-slate-200 bg-white focus-visible:ring-teal-500 rounded-xl transition-all"
              />
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              <Filter className="h-4 w-4 text-slate-400 hidden sm:block" />
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as KycModuleType | "ALL")}>
                <SelectTrigger className="w-full md:w-[220px] h-11 border-slate-200 bg-white rounded-xl focus:ring-teal-500">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Applications</SelectItem>
                  <SelectItem value="PHARMACY">Pharmacy</SelectItem>
                  <SelectItem value="RIDER">Rider</SelectItem>
                  <SelectItem value="FOOD">Restaurants</SelectItem>
                  <SelectItem value="GROCERY">Grocery Stores</SelectItem>
                  <SelectItem value="AUTO_PARTS">Auto Parts</SelectItem>
                  <SelectItem value="WHOLESALER">Wholesalers</SelectItem>
                  <SelectItem value="MECHANIC">Mechanics</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* 4. DATA TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Application Queue</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">{filteredKyc.length} pending verifications found</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-200">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="py-4 pl-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Applicant Identity</TableHead>
                  <TableHead className="py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Module Type</TableHead>
                  <TableHead className="py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Contact Details</TableHead>
                  <TableHead className="py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Application Date</TableHead>
                  <TableHead className="py-4 text-right pr-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredKyc.length > 0 ? (
                  filteredKyc.map((item) => {
                    const styles = getTypeStyles(item.type)
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50/50 transition-colors border-b border-slate-100 group">
                        <TableCell className="py-4 pl-6">
                          <div className="flex items-center gap-4">
                            <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm border ${styles.bg} ${styles.text} ${styles.ring}`}>
                               {item.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900 group-hover:text-teal-700 transition-colors">
                                {item.name}
                              </span>
                              <span className="text-xs font-medium text-slate-500 mt-0.5">
                                #{item.id.substring(0, 8)}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                           <Badge variant="outline" className={`font-bold border ${styles.bg} ${styles.text} ${styles.ring} px-2.5 py-0.5`}>
                            {item.type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col space-y-0.5">
                            <span className="text-sm text-slate-700 font-bold">{item.contactEmail}</span>
                            <span className="text-xs text-slate-500 font-medium">{item.contactPhone}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center text-slate-600 text-sm font-medium">
                            <Calendar className="h-4 w-4 mr-2 text-slate-400" />
                            {new Date(item.registeredDate).toLocaleDateString(undefined, {
                              month: 'short', day: 'numeric', year: 'numeric'
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-right pr-6">
                          <Button 
                            onClick={() => { 
                              setSelectedKycItem(item); 
                              setShowDetailsModal(true); 
                              setRejectionReason(""); 
                              setRejectedFields([]);
                            }}
                            className="bg-white hover:bg-teal-50 text-slate-600 hover:text-teal-700 border border-slate-200 hover:border-teal-200 shadow-sm transition-all rounded-xl"
                            size="sm"
                          >
                            Review <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center opacity-80">
                        <div className="h-12 w-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center mb-4">
                          <Search className="h-6 w-6 text-slate-400" />
                        </div>
                        <h3 className="text-base font-bold text-slate-900">No applications found</h3>
                        <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or search query.</p>
                        <Button variant="link" onClick={() => { setSearchTerm(""); setTypeFilter("ALL") }} className="text-teal-600 mt-2 font-bold">Clear all filters</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* 5. PROFESSIONAL DETAILS MODAL */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="sm:max-w-5xl sm:rounded-3xl p-0 gap-0 overflow-hidden flex flex-col bg-slate-50 border-slate-200 shadow-xl max-h-[95vh]">
          {selectedKycItem && (
            <>
              {/* Modal Header - Clean Slate System */}
              <div className="bg-white border-b border-slate-100 p-6 flex justify-between items-start shrink-0 z-20 shadow-sm">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 mb-1">
                    <Badge variant="outline" className={`font-bold border px-2.5 py-0.5 ${getTypeStyles(selectedKycItem.type).bg} ${getTypeStyles(selectedKycItem.type).text} ${getTypeStyles(selectedKycItem.type).ring}`}>
                      {selectedKycItem.type.replace("_", " ")}
                    </Badge>
                    <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">
                      ID: {selectedKycItem.id}
                    </span>
                  </div>
                  <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">
                    {selectedKycItem.name}
                  </DialogTitle>
                  <p className="text-slate-500 text-sm font-medium flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-slate-400" /> 
                    Submitted: {new Date(selectedKycItem.registeredDate).toLocaleString()}
                  </p>
                </div>
                <div className="h-14 w-14 bg-teal-50 rounded-2xl flex items-center justify-center border border-teal-100 text-teal-600 shadow-sm">
                   <User className="h-7 w-7" />
                </div>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                <Tabs defaultValue="overview" className="w-full">
                  <div className="flex items-center justify-between mb-6">
                     <TabsList className="bg-white border border-slate-200 shadow-sm p-1 rounded-xl w-max">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 rounded-lg font-medium px-4 py-2 text-slate-600 transition-all">Overview</TabsTrigger>
                        <TabsTrigger value="documents" className="data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 rounded-lg font-medium px-4 py-2 text-slate-600 transition-all">Documents & Proofs</TabsTrigger>
                        <TabsTrigger value="history" className="data-[state=active]:bg-teal-50 data-[state=active]:text-teal-700 rounded-lg font-medium px-4 py-2 text-slate-600 transition-all">
                          Rejection History
                          {selectedKycItem.rejectionHistory && selectedKycItem.rejectionHistory.length > 0 && (
                            <Badge variant="outline" className="ml-2 bg-rose-50 text-rose-700 border-rose-200 font-bold px-1.5 py-0.5">
                              {selectedKycItem.rejectionHistory.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>
                  </div>

                  <TabsContent value="overview" className="mt-0 outline-none">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left: Contact Info */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">Contact Information</h3>
                        <div className="space-y-4">
                          <InfoRow label="Email Address" value={selectedKycItem.contactEmail} />
                          <InfoRow label="Phone Number" value={selectedKycItem.contactPhone} />
                          <InfoRow label="Address" value={selectedKycItem.details.address} />
                          <InfoRow label="Emergency Contact" value={selectedKycItem.details.emergencyContact} />
                        </div>
                      </div>
                      
                      {/* Right: Business/Rider Details */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3 mb-4">Module Specific Details</h3>
                        <div className="space-y-4">
                          <InfoSection item={selectedKycItem} />
                        </div>
                      </div>

                      {/* Full Width: Description */}
                      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm md:col-span-2">
                        <h3 className="text-lg font-bold text-slate-900 mb-3">Description / Notes</h3>
                        <p className="text-sm text-slate-700 font-medium leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                          {selectedKycItem.details.description || "No description provided by the applicant."}
                        </p>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0 outline-none">
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2 border-b border-slate-100 pb-3">
                          <FileText className="h-5 w-5 text-teal-600" /> Attached Proofs
                        </h3>
                        <DocumentSection item={selectedKycItem} />
                     </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 outline-none">
                     <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2 border-b border-slate-100 pb-3">
                          <AlertCircle className="h-5 w-5 text-rose-600" /> Rejection History
                        </h3>
                        <RejectionHistorySection item={selectedKycItem} />
                     </div>
                  </TabsContent>
                </Tabs>

                {/* Verification Zone */}
                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm mt-8">
                  <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-teal-600" />
                    <h3 className="text-lg font-bold text-slate-900">Verification Decision</h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                       <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                         Reason for Rejection (Optional if Approving)
                       </label>
                       <Textarea 
                         placeholder="Enter descriptive feedback for the applicant..." 
                         value={rejectionReason}
                         onChange={(e) => setRejectionReason(e.target.value)}
                         className="min-h-[120px] bg-slate-50 resize-y focus:bg-white transition-all rounded-xl border-slate-200 focus-visible:ring-teal-500"
                       />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                         Flag Specific Fields
                       </label>
                       <FieldCheckboxes 
                         type={selectedKycItem.type} 
                         selectedFields={rejectedFields}
                         onFieldsChange={setRejectedFields}
                         details={selectedKycItem.details}
                       />
                    </div>
                  </div>
                </div>

              </div>

              {/* Modal Footer - Sticky */}
              <div className="p-5 bg-white border-t border-slate-200 flex justify-end gap-3 shrink-0 z-20">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDetailsModal(false)}
                  disabled={isProcessing}
                  className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border-slate-200 font-medium"
                >
                  Cancel
                </Button>
                <Button 
                  disabled={isProcessing || !rejectionReason.trim()}
                  onClick={() => handleKycAction(selectedKycItem.id, selectedKycItem.type, 'reject')}
                  className="bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 shadow-none transition-colors rounded-xl font-bold"
                >
                  <XCircle className="h-4 w-4 mr-2" /> 
                  Reject Application
                </Button>
                <Button 
                  onClick={() => handleKycAction(selectedKycItem.id, selectedKycItem.type, 'approve')}
                  disabled={isProcessing}
                  className="bg-teal-600 hover:bg-teal-700 text-white shadow-md border-0 transition-all rounded-xl font-bold"
                >
                  {isProcessing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" /> Approve & Verify
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- Component Helpers ---

const StatCard = ({ title, value, icon: Icon, color, metric }: any) => {
  const colors: any = {
    teal: "bg-teal-50 text-teal-600 border-teal-100",
    rose: "bg-rose-50 text-rose-600 border-rose-100",
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    purple: "bg-purple-50 text-purple-600 border-purple-100",
  }
  
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-teal-200 hover:shadow-md transition-all group">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">{metric.total}</h3>
        </div>
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center border ${colors[color]} group-hover:scale-110 transition-transform`}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
      
      <div className="mt-4 flex items-center text-xs font-bold">
        {metric.trend === "up" && (
          <span className="text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md flex items-center border border-emerald-200">
            <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
            {metric.growth}%
          </span>
        )}
        {metric.trend === "down" && (
          <span className="text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md flex items-center border border-rose-200">
            <ArrowDownRight className="h-3.5 w-3.5 mr-1" />
            {metric.growth}%
          </span>
        )}
        {metric.trend === "neutral" && (
          <span className="text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md flex items-center border border-slate-200">
            <TrendingUp className="h-3.5 w-3.5 mr-1" />
            0%
          </span>
        )}
        <span className="text-slate-500 font-medium ml-2">vs last month</span>
      </div>
    </div>
  )
}

const InfoRow = ({ label, value }: { label: string, value: string | React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-3 py-1.5 border-b border-slate-50 last:border-0">
    <dt className="text-xs font-bold text-slate-500 uppercase tracking-wider col-span-1 pt-0.5">{label}</dt>
    <dd className="text-sm font-bold text-slate-900 col-span-2 break-words leading-snug">{value || <span className="text-slate-400 font-medium italic">N/A</span>}</dd>
  </div>
)

const InfoSection = ({ item }: { item: PendingKycItem }) => {
  const d = item.details
  if (item.type === "PHARMACY") return (
    <>
      <InfoRow label="Pharmacy Name" value={d.name || d.pharmacyName} />
      <InfoRow label="Owner Name" value={d.ownerName} />
      <InfoRow label="License No." value={<span className="font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs text-slate-700">{d.licenseNumber}</span>} />
    </>
  )
  if (item.type === "RIDER") return (
    <>
      <InfoRow label="Full Name" value={d.name} />
      <InfoRow label="Vehicle" value={<Badge variant="outline" className="bg-slate-50 border-slate-200 font-bold">{d.vehicleType}</Badge>} />
      <InfoRow label="Plate No." value={d.licensePlate} />
      <InfoRow label="Model" value={d.vehicleModel} />
    </>
  )
  if (item.type === "GROCERY" || item.type === "FOOD") return (
    <>
      <InfoRow label="Store Name" value={d.storeName || d.name} />
      <InfoRow label="Type" value={Array.isArray(d.storeType) ? d.storeType.join(", ") : (d.restaurantType || d.storeType)} />
      <InfoRow label="Reg No." value={d.registrationNumber} />
    </>
  )
  if (item.type === "AUTO_PARTS") return (
    <>
      <InfoRow label="Business" value={d.storeName || d.businessName} />
      <InfoRow label="Tax ID" value={d.taxId} />
      <InfoRow label="Brands" value={d.brandsCarried} />
    </>
  )
  if (item.type === "WHOLESALER") return (
    <>
      <InfoRow label="Company" value={d.companyName || d.name} />
      <InfoRow label="License No." value={<span className="font-mono bg-slate-100 px-2 py-1 rounded border border-slate-200 text-xs text-slate-700">{d.licenseNumber}</span>} />
      <InfoRow label="Phone" value={d.phone} />
      <InfoRow label="Website" value={d.website} />
    </>
  )
  if (item.type === "MECHANIC") return (
    <>
      <InfoRow label="Business" value={d.businessName || d.name} />
      <InfoRow label="Business type" value={d.businessType} />
      <InfoRow label="Address" value={[d.address, d.city, d.state].filter(Boolean).join(", ")} />
      <InfoRow label="Tax ID" value={d.taxId} />
    </>
  )
  return null
}

const DocumentSection = ({ item }: { item: PendingKycItem }) => {
  const d = item.details.documents || item.details
  let docs: { title: string, url: string | null }[] = []

  // (Mapping logic matches your original code for types)
  if (item.type === "PHARMACY") docs = [{title: "License", url: d.licenseDocument || d.businessLicense}, {title: "Store Front", url: d.storeFrontImage}, {title: "Owner ID", url: d.ownerPhoto}]
  else if (item.type === "RIDER") docs = [
    { title: "Driver's License", url: d.licensePhoto || null },
    { title: "Insurance", url: d.insurancePhoto || null },
    { title: "National ID", url: d.nationalIdPhoto || null },
    { title: "Selfie", url: d.selfiePhoto || null },
  ]
  else if (item.type === "AUTO_PARTS") docs = [{title: "License", url: d.businessLicense}, {title: "Store Front", url: d.storeFront}, {title: "Inventory", url: d.inventory}]
  else if (item.type === "FOOD") docs = [{title: "Business License", url: d.businessLicense}, {title: "Food License", url: d.foodLicense}, {title: "Restaurant Front", url: d.restaurantFront}, {title: "Kitchen Photo", url: d.kitchenPhoto} , {title: "Menu Sample", url: d.menuSample}]
  else if (item.type === "GROCERY") docs = [{title: "Business License", url: d.businessLicense}, {title: "Food License", url: d.tradeLicense}, {title: "Store Front", url: d.storeFront}, {title: "Store Interior", url: d.storeInterior}, {title: "Product Sample", url: d.productSample}]
  else if (item.type === "WHOLESALER") docs = [{ title: "Logo", url: d.logo || null }]
  else if (item.type === "MECHANIC") {
    const docBlock = item.details.documents || d
    docs = [
      { title: "Business license", url: docBlock.businessLicense || null },
      { title: "Logo", url: docBlock.logo || null },
      { title: "Cover", url: docBlock.coverImage || null },
    ]
  }

  const vehiclePhotos: string[] = Array.isArray(d.vehiclePhotos) ? d.vehiclePhotos.filter((x: any) => typeof x === "string" && x.trim()) : []

  return (
    <div className="space-y-6">
      {item.type === "RIDER" && vehiclePhotos.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Vehicle Photos</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {vehiclePhotos.map((url, idx) => (
              <div key={`${url}-${idx}`} className="group overflow-hidden rounded-xl border border-slate-200 hover:border-teal-400 hover:shadow-md transition-all cursor-pointer bg-white">
                <div className="aspect-square bg-slate-50 relative flex items-center justify-center overflow-hidden">
                  <img src={url} alt={`Vehicle photo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="icon" variant="secondary" className="rounded-full bg-white text-slate-900 hover:bg-teal-50 hover:text-teal-700" onClick={() => window.open(url, "_blank")}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {docs.map((doc, idx) => (
          <div key={idx} className="group overflow-hidden rounded-xl border border-slate-200 hover:border-teal-400 hover:shadow-md transition-all cursor-pointer bg-white flex flex-col">
            <div className="aspect-square bg-slate-50 relative flex items-center justify-center overflow-hidden">
              {doc.url ? (
                <>
                  <img src={doc.url} alt={doc.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="icon" variant="secondary" className="rounded-full bg-white text-slate-900 hover:bg-teal-50 hover:text-teal-700" onClick={() => doc.url && window.open(doc.url, "_blank")}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-slate-300 text-center p-2 flex flex-col items-center">
                  <FileText className="h-8 w-8 mb-2" />
                  <span className="text-xs font-bold uppercase tracking-wider">Missing</span>
                </div>
              )}
            </div>
            <div className="p-3 bg-white border-t border-slate-100 text-center mt-auto">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{doc.title}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const RejectionHistorySection = ({ item }: { item: PendingKycItem }) => {
  if (!item.rejectionHistory || item.rejectionHistory.length === 0) {
    return (
      <div className="text-center py-12 border border-slate-200 border-dashed rounded-2xl bg-slate-50">
        <AlertCircle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-900 font-bold">No rejection history found</p>
        <p className="text-sm text-slate-500 mt-1 font-medium">This application has not been rejected before.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {item.rejectionHistory.map((rejection, idx) => (
        <div key={rejection.id} className={`rounded-xl border-l-4 overflow-hidden shadow-sm ${rejection.isResolved ? 'border-l-emerald-500 border-y border-r border-slate-200 bg-white' : 'border-l-rose-500 border-y border-r border-slate-200 bg-white'}`}>
          <div className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${rejection.isResolved ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center">
                    Rejection #{item.rejectionHistory!.length - idx}
                    {rejection.isResolved && (
                      <Badge variant="outline" className="ml-2 bg-emerald-50 text-emerald-700 border-emerald-200 font-bold px-2 py-0.5">
                        Resolved
                      </Badge>
                    )}
                  </h4>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Rejected by <span className="font-bold text-slate-700">{rejection.rejectedBy}</span> on {new Date(rejection.rejectedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                  Feedback Provided
                </label>
                <p className="text-sm text-slate-800 font-medium">
                  {rejection.rejectionReason || "No descriptive reason provided."}
                </p>
              </div>
              
              {rejection.rejectedFields && Array.isArray(rejection.rejectedFields) && rejection.rejectedFields.length > 0 && (
                <div className="pt-3 border-t border-slate-200">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">
                    Flagged Fields
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {rejection.rejectedFields.map((field: string, fieldIdx: number) => (
                      <Badge key={fieldIdx} variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-bold">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

const FieldCheckboxes = ({ 
  type, 
  selectedFields, 
  onFieldsChange, 
  details 
}: { 
  type: KycModuleType
  selectedFields: string[]
  onFieldsChange: (fields: string[]) => void
  details: any
}) => {
  const getFieldsForType = (): { key: string, label: string }[] => {
    switch(type) {
      case "PHARMACY":
        return [
          { key: "pharmacyName", label: "Pharmacy Name" },
          { key: "name", label: "Pharmacy Name (Alt)" },
          { key: "ownerName", label: "Owner Name" },
          { key: "licenseNumber", label: "License Number" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Address" },
          { key: "description", label: "Description" },
          { key: "emergencyContact", label: "Emergency Contact" },
          { key: "licenseDocument", label: "License Document" },
          { key: "businessLicense", label: "Business License" },
          { key: "storeFrontImage", label: "Store Front Image" },
          { key: "ownerPhoto", label: "Owner Photo" },
        ]
      case "RIDER":
        return [
          { key: "name", label: "Full Name" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "vehicleType", label: "Vehicle Type" },
          { key: "vehicleBrand", label: "Vehicle Brand" },
          { key: "vehicleModel", label: "Vehicle Model" },
          { key: "vehicleYear", label: "Vehicle Year" },
          { key: "vehicleColor", label: "Vehicle Color" },
          { key: "licensePlate", label: "License Plate" },
          { key: "licenseNumber", label: "License Number" },
          { key: "nationalId", label: "National ID" },
          { key: "emergencyContact", label: "Emergency Contact" },
          { key: "licensePhoto", label: "Driver's License Photo" },
          { key: "driversLicense", label: "Driver's License (Alt)" },
          { key: "vehicleRegistration", label: "Vehicle Registration" },
          { key: "insurance", label: "Insurance" },
          { key: "insurancePhoto", label: "Insurance Photo" },
          { key: "nationalIdPhoto", label: "National ID Photo" },
          { key: "selfiePhoto", label: "Selfie Photo" },
          { key: "vehiclePhotos", label: "Vehicle Photos" },
        ]
      case "GROCERY":
        return [
          { key: "storeName", label: "Store Name" },
          { key: "storeType", label: "Store Type" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Address" },
          { key: "description", label: "Description" },
          { key: "businessRegistration", label: "Business Registration" },
          { key: "healthPermit", label: "Health Permit" },
          { key: "storeSize", label: "Store Size" },
          { key: "numberOfEmployees", label: "Number of Employees" },
          { key: "productCategories", label: "Product Categories" },
          { key: "businessLicense", label: "Business License" },
          { key: "tradeLicense", label: "Trade License" },
          { key: "storeFront", label: "Store Front" },
          { key: "storeInterior", label: "Store Interior" },
          { key: "productSample", label: "Product Sample" },
        ]
      case "FOOD":
        return [
          { key: "name", label: "Restaurant Name" },
          { key: "restaurantName", label: "Restaurant Name (Alt)" },
          { key: "restaurantType", label: "Restaurant Type" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Address" },
          { key: "description", label: "Description" },
          { key: "cuisine", label: "Cuisine Types" },
          { key: "priceRange", label: "Price Range" },
          { key: "seatingCapacity", label: "Seating Capacity" },
          { key: "businessRegistration", label: "Business Registration" },
          { key: "foodHandlersCert", label: "Food Handlers Certificate" },
          { key: "fireServiceCert", label: "Fire Service Certificate" },
          { key: "businessLicense", label: "Business License" },
          { key: "foodLicense", label: "Food License" },
          { key: "restaurantFront", label: "Restaurant Front" },
          { key: "kitchenPhoto", label: "Kitchen Photo" },
          { key: "menuSample", label: "Menu Sample" },
        ]
      case "AUTO_PARTS":
        return [
          { key: "storeName", label: "Store Name" },
          { key: "businessName", label: "Business Name" },
          { key: "businessType", label: "Business Type" },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "address", label: "Address" },
          { key: "description", label: "Description" },
          { key: "registrationNumber", label: "Registration Number" },
          { key: "taxId", label: "Tax ID" },
          { key: "yearsInBusiness", label: "Years in Business" },
          { key: "brandsCarried", label: "Brands Carried" },
          { key: "specializations", label: "Specializations" },
          { key: "businessLicense", label: "Business License" },
          { key: "storeFront", label: "Store Front" },
          { key: "inventory", label: "Inventory" },
        ]
      default:
        return []
    }
  }

  const fields = getFieldsForType()

  const toggleField = (fieldKey: string) => {
    if (selectedFields.includes(fieldKey)) {
      onFieldsChange(selectedFields.filter(f => f !== fieldKey))
    } else {
      onFieldsChange([...selectedFields, fieldKey])
    }
  }

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 max-h-64 overflow-y-auto">
      <div className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <label key={field.key} className={`flex items-center space-x-2 cursor-pointer p-2 rounded-lg border transition-colors ${selectedFields.includes(field.key) ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-transparent hover:bg-slate-100'}`}>
            <input
              type="checkbox"
              checked={selectedFields.includes(field.key)}
              onChange={() => toggleField(field.key)}
              className="sr-only"
            />
            <div className={`h-4 w-4 rounded flex items-center justify-center border shrink-0 ${selectedFields.includes(field.key) ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 bg-white'}`}>
              {selectedFields.includes(field.key) && <CheckCircle className="h-3 w-3" />}
            </div>
            <span className={`text-sm font-medium ${selectedFields.includes(field.key) ? 'text-rose-800' : 'text-slate-700'}`}>{field.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}