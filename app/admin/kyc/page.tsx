"use client"

import { useState, useEffect, useMemo } from "react"
import { 
  Search, Filter, Eye, CheckCircle, XCircle, Download, 
  FileText, User, Store, Bike, Utensils, ShoppingCart, 
  AlertCircle, Calendar, ShieldAlert, ChevronRight, 
  LayoutGrid, ArrowUpRight, ArrowDownRight, TrendingUp 
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
    // (Keep your existing action logic mostly same, just styled alerts if needed)
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
      case "PHARMACY": return { bg: "bg-pink-100", text: "text-pink-700", ring: "ring-pink-600/20" }
      case "RIDER": return { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-600/20" }
      case "FOOD": return { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-600/20" }
      case "GROCERY": return { bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-600/20" }
      case "FOOD_AND_GROCERY": return { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-600/20" }
      case "AUTO_PARTS": return { bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-600/20" }
      case "WHOLESALER": return { bg: "bg-cyan-100", text: "text-cyan-700", ring: "ring-cyan-600/20" }
      case "MECHANIC": return { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-600/20" }
      default: return { bg: "bg-gray-100", text: "text-gray-700", ring: "ring-gray-600/20" }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-gray-200 border-t-emerald-500 animate-spin"></div>
        </div>
        <p className="mt-4 text-gray-500 font-medium animate-pulse">Synchronizing Applications...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans pb-20">
      
      {/* 1. BRANDED HEADER with Gradient */}
      <div className="bg-gradient-to-tr from-green-600 to-emerald-600 pb-24 pt-10 px-6 shadow-lg shadow-green-900/10">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="text-white">
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-green-100" />
              KYC Verifications
            </h1>
            <p className="text-green-50 mt-2 text-lg font-light opacity-90">
              Manage incoming vendor applications and rider validations.
            </p>
          </div>
          <div className="flex gap-3">
             <Button 
               onClick={handleExport}
               className="bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm transition-all"
             >
              <Download className="h-4 w-4 mr-2" /> 
              Export Report
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-6 -mt-16 space-y-8">
        
        {/* 2. ADVANCED STATISTICS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard title="Total Pending" icon={AlertCircle} metric={calculateStats("ALL")} color="amber" />
          <StatCard title="Pharmacies" icon={FileText} metric={calculateStats("PHARMACY")} color="pink" />
          <StatCard title="Riders" icon={Bike} metric={calculateStats("RIDER")} color="blue" />
          <StatCard title="Food/Grocery" icon={Utensils} metric={calculateStats("FOOD_AND_GROCERY")} color="orange" />
          <StatCard title="Auto Parts" icon={Store} metric={calculateStats("AUTO_PARTS")} color="violet" />
        </div>

        {/* 3. CONTROL PANEL */}
        <Card className="border-none shadow-md shadow-gray-200/50 bg-white rounded-xl">
          <CardContent className="p-5 flex flex-col md:flex-row gap-5 items-center justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search by Name, ID, Phone or Email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11 border-gray-200 bg-gray-50 focus:bg-white focus:ring-green-500 focus:border-green-500 rounded-lg transition-all"
              />
            </div>

            <div className="flex items-center gap-4 w-full md:w-auto">
              <span className="text-sm font-medium text-gray-500 hidden sm:block">Filter by Module:</span>
              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as KycModuleType | "ALL")}>
                <SelectTrigger className="w-full md:w-[220px] h-11 border-gray-200 bg-white">
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
          </CardContent>
        </Card>

        {/* 4. DATA TABLE */}
        <Card className="border-none shadow-lg shadow-gray-200/50 overflow-hidden bg-white rounded-xl">
          <Table>
            <TableHeader className="bg-gray-50/50">
              <TableRow className="border-gray-100 hover:bg-gray-50/50">
                <TableHead className="py-5 font-semibold text-gray-600">Applicant Identity</TableHead>
                <TableHead className="font-semibold text-gray-600">Module Type</TableHead>
                <TableHead className="font-semibold text-gray-600">Contact Details</TableHead>
                <TableHead className="font-semibold text-gray-600">Application Date</TableHead>
                <TableHead className="text-right font-semibold text-gray-600 pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKyc.length > 0 ? (
                filteredKyc.map((item) => {
                  const styles = getTypeStyles(item.type)
                  return (
                    <TableRow key={item.id} className="hover:bg-gray-50/50 transition-colors border-gray-100 group">
                      <TableCell className="py-5 pl-6">
                        <div className="flex items-center gap-4">
                          <div className={`h-11 w-11 rounded-full flex items-center justify-center text-sm font-bold shadow-sm ${styles.bg} ${styles.text}`}>
                             {item.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                              {item.name}
                            </span>
                            <span className="text-xs text-gray-400 font-mono mt-0.5">
                              #{item.id.substring(0, 8)}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                         <Badge variant="outline" className={`${styles.bg} ${styles.text} ${styles.ring} border-0 px-3 py-1 font-semibold tracking-wide`}>
                          {item.type.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col space-y-1">
                          <span className="text-sm text-gray-700 font-medium">{item.contactEmail}</span>
                          <span className="text-xs text-gray-400">{item.contactPhone}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center text-gray-500 text-sm bg-gray-50 w-fit px-3 py-1 rounded-full border border-gray-100">
                          <Calendar className="h-3.5 w-3.5 mr-2 text-gray-400" />
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
                          className="bg-white hover:bg-green-50 text-gray-700 hover:text-green-700 border border-gray-200 hover:border-green-200 shadow-sm transition-all"
                          size="sm"
                        >
                          Review <ChevronRight className="ml-1 h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center opacity-60">
                      <LayoutGrid className="h-12 w-12 text-gray-300 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900">No applications found</h3>
                      <p className="text-gray-500 mt-1">Try adjusting your filters.</p>
                      <Button variant="link" onClick={() => { setSearchTerm(""); setTypeFilter("ALL") }} className="text-green-600">Clear all filters</Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* 5. PROFESSIONAL DETAILS MODAL */}
      <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-0 gap-0 overflow-hidden flex flex-col bg-gray-50">
          {selectedKycItem && (
            <>
              {/* Modal Header - Gradient */}
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6 flex justify-between items-start shrink-0 z-20 shadow-md">
                <div className="text-white space-y-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm">
                      {selectedKycItem.type.replace("_", " ")}
                    </Badge>
                    <span className="text-green-100 text-xs font-mono uppercase tracking-wider opacity-80">
                      ID: {selectedKycItem.id}
                    </span>
                  </div>
                  <DialogTitle className="text-2xl font-bold tracking-tight text-white">
                    {selectedKycItem.name}
                  </DialogTitle>
                  <p className="text-green-50 text-sm flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" /> 
                    Submitted: {new Date(selectedKycItem.registeredDate).toLocaleString()}
                  </p>
                </div>
                <div className="h-14 w-14 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/20 text-white">
                   <User className="h-7 w-7" />
                </div>
              </div>

              {/* Modal Body - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                <Tabs defaultValue="overview" className="w-full">
                  <div className="flex items-center justify-between mb-4">
                     <TabsList className="bg-white border border-gray-200 shadow-sm p-1 rounded-lg">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700">Application Overview</TabsTrigger>
                        <TabsTrigger value="documents" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700">Documents & Evidence</TabsTrigger>
                        <TabsTrigger value="history" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-700">
                          Rejection History
                          {selectedKycItem.rejectionHistory && selectedKycItem.rejectionHistory.length > 0 && (
                            <Badge variant="destructive" className="ml-2 h-5 px-1.5 text-xs">
                              {selectedKycItem.rejectionHistory.length}
                            </Badge>
                          )}
                        </TabsTrigger>
                      </TabsList>
                  </div>

                  <TabsContent value="overview" className="mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left: Contact Info */}
                      <Card className="border-gray-200 shadow-sm">
                        <CardContent className="p-6 space-y-4">
                           <h3 className="font-semibold text-gray-900 border-b pb-2 mb-4">Contact Information</h3>
                           <InfoRow label="Email Address" value={selectedKycItem.contactEmail} />
                           <InfoRow label="Phone Number" value={selectedKycItem.contactPhone} />
                           <InfoRow label="Address" value={selectedKycItem.details.address} />
                           <InfoRow label="Emergency Contact" value={selectedKycItem.details.emergencyContact} />
                        </CardContent>
                      </Card>
                      
                      {/* Right: Business/Rider Details */}
                      <Card className="border-gray-200 shadow-sm">
                        <CardContent className="p-6 space-y-4">
                           <h3 className="font-semibold text-gray-900 border-b pb-2 mb-4">Module Specific Details</h3>
                           <InfoSection item={selectedKycItem} />
                        </CardContent>
                      </Card>

                      {/* Full Width: Description */}
                      <Card className="md:col-span-2 border-gray-200 shadow-sm">
                         <CardContent className="p-6">
                           <h3 className="font-semibold text-gray-900 mb-2">Description / Notes</h3>
                           <p className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                             {selectedKycItem.details.description || "No description provided by the applicant."}
                           </p>
                         </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0">
                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
                          <FileText className="h-5 w-5 text-green-600" /> Attached Proofs
                        </h3>
                        <DocumentSection item={selectedKycItem} />
                     </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0">
                     <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <h3 className="font-semibold text-gray-900 mb-6 flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-red-600" /> Rejection History
                        </h3>
                        <RejectionHistorySection item={selectedKycItem} />
                     </div>
                  </TabsContent>
                </Tabs>

                {/* Verification Zone */}
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm mt-8">
                  <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-gray-500" />
                    <h3 className="font-semibold text-gray-900">Verification Decision</h3>
                  </div>
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                       <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
                         Reason for Rejection (Optional if Approving)
                       </label>
                       <Textarea 
                         placeholder="Enter comments here..." 
                         value={rejectionReason}
                         onChange={(e) => setRejectionReason(e.target.value)}
                         className="min-h-[120px] bg-gray-50 resize-none focus:bg-white transition-all"
                       />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">
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
              <div className="p-5 bg-white border-t border-gray-200 flex justify-end gap-3 shrink-0 z-20">
                <Button 
                  variant="ghost" 
                  onClick={() => setShowDetailsModal(false)}
                  disabled={isProcessing}
                  className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </Button>
                <Button 
                  disabled={isProcessing || !rejectionReason.trim()}
                  onClick={() => handleKycAction(selectedKycItem.id, selectedKycItem.type, 'reject')}
                  className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 shadow-none hover:shadow-sm transition-all"
                >
                  <XCircle className="h-4 w-4 mr-2" /> 
                  Reject Application
                </Button>
                <Button 
                  onClick={() => handleKycAction(selectedKycItem.id, selectedKycItem.type, 'approve')}
                  disabled={isProcessing}
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-200 border-0"
                >
                  {isProcessing ? "Processing..." : (
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
    amber: "bg-amber-50 text-amber-600 ring-amber-500/10",
    pink: "bg-pink-50 text-pink-600 ring-pink-500/10",
    blue: "bg-blue-50 text-blue-600 ring-blue-500/10",
    orange: "bg-orange-50 text-orange-600 ring-orange-500/10",
    violet: "bg-violet-50 text-violet-600 ring-violet-500/10",
  }
  
  return (
    <Card className="border-none shadow-md shadow-gray-200/50 hover:shadow-lg transition-shadow bg-white rounded-xl overflow-hidden relative group">
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <h3 className="text-3xl font-bold text-gray-900 mt-2 tracking-tight">{metric.total}</h3>
          </div>
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center ring-1 ${colors[color]}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        
        <div className="mt-4 flex items-center text-xs font-medium">
          {metric.trend === "up" && (
            <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center border border-green-100">
              <ArrowUpRight className="h-3 w-3 mr-1" />
              {metric.growth}%
            </span>
          )}
          {metric.trend === "down" && (
            <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center border border-red-100">
              <ArrowDownRight className="h-3 w-3 mr-1" />
              {metric.growth}%
            </span>
          )}
          {metric.trend === "neutral" && (
            <span className="text-gray-500 bg-gray-50 px-2 py-0.5 rounded-full flex items-center border border-gray-100">
              <TrendingUp className="h-3 w-3 mr-1" />
              0%
            </span>
          )}
          <span className="text-gray-400 ml-2">vs last month</span>
        </div>
      </CardContent>
    </Card>
  )
}

const InfoRow = ({ label, value }: { label: string, value: string | React.ReactNode }) => (
  <div className="grid grid-cols-3 gap-2 py-1">
    <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wide col-span-1 pt-0.5">{label}</dt>
    <dd className="text-sm font-medium text-gray-900 col-span-2 break-words">{value || <span className="text-gray-300 italic">N/A</span>}</dd>
  </div>
)

const InfoSection = ({ item }: { item: PendingKycItem }) => {
  const d = item.details
  if (item.type === "PHARMACY") return (
    <>
      <InfoRow label="Pharmacy Name" value={d.name || d.pharmacyName} />
      <InfoRow label="Owner Name" value={d.ownerName} />
      <InfoRow label="License No." value={<span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs text-gray-700">{d.licenseNumber}</span>} />
    </>
  )
  if (item.type === "RIDER") return (
    <>
      <InfoRow label="Full Name" value={d.name} />
      <InfoRow label="Vehicle" value={<Badge variant="secondary">{d.vehicleType}</Badge>} />
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
      <InfoRow label="License No." value={<span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs text-gray-700">{d.licenseNumber}</span>} />
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
          <h4 className="text-sm font-semibold text-gray-900 mb-3">Vehicle Photos</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {vehiclePhotos.map((url, idx) => (
              <Card key={`${url}-${idx}`} className="group overflow-hidden border border-gray-200 hover:border-green-400 transition-all cursor-pointer">
                <div className="aspect-square bg-gray-100 relative flex items-center justify-center overflow-hidden">
                  <img src={url} alt={`Vehicle photo ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="icon" variant="secondary" className="rounded-full" onClick={() => window.open(url, "_blank")}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {docs.map((doc, idx) => (
          <Card key={idx} className="group overflow-hidden border border-gray-200 hover:border-green-400 transition-all cursor-pointer">
            <div className="aspect-square bg-gray-100 relative flex items-center justify-center overflow-hidden">
              {doc.url ? (
                <>
                  <img src={doc.url} alt={doc.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="icon" variant="secondary" className="rounded-full" onClick={() => doc.url && window.open(doc.url, "_blank")}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-gray-300 text-center p-2">
                  <FileText className="h-8 w-8 mx-auto mb-1" />
                  <span className="text-[10px]">Missing</span>
                </div>
              )}
            </div>
            <div className="p-2.5 bg-white border-t border-gray-100 text-center">
              <span className="text-xs font-semibold text-gray-600">{doc.title}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

const RejectionHistorySection = ({ item }: { item: PendingKycItem }) => {
  if (!item.rejectionHistory || item.rejectionHistory.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">No rejection history found</p>
        <p className="text-sm text-gray-400 mt-1">This application has not been rejected before.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {item.rejectionHistory.map((rejection, idx) => (
        <Card key={rejection.id} className={`border-l-4 ${rejection.isResolved ? 'border-l-green-500 bg-green-50/30' : 'border-l-red-500 bg-red-50/30'}`}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center ${rejection.isResolved ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900">
                    Rejection #{item.rejectionHistory!.length - idx}
                    {rejection.isResolved && (
                      <Badge variant="outline" className="ml-2 bg-green-100 text-green-700 border-green-300">
                        Resolved
                      </Badge>
                    )}
                  </h4>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Rejected by {rejection.rejectedBy} on {new Date(rejection.rejectedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                  Rejection Reason
                </label>
                <p className="text-sm text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                  {rejection.rejectionReason || "No reason provided"}
                </p>
              </div>
              
              {rejection.rejectedFields && Array.isArray(rejection.rejectedFields) && rejection.rejectedFields.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">
                    Rejected Fields
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {rejection.rejectedFields.map((field: string, fieldIdx: number) => (
                      <Badge key={fieldIdx} variant="outline" className="bg-red-50 text-red-700 border-red-200">
                        {field}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
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
    <div className="bg-white p-4 rounded-lg border border-gray-200 max-h-64 overflow-y-auto">
      <div className="grid grid-cols-2 gap-2">
        {fields.map((field) => (
          <label key={field.key} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
            <input
              type="checkbox"
              checked={selectedFields.includes(field.key)}
              onChange={() => toggleField(field.key)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">{field.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}