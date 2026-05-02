"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Search, RefreshCw, Loader2, AlertCircle, Filter, ChevronLeft, ChevronRight, Activity } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Payout {
  id: string
  transfer: {
    id: string
    reference: string
    sender: { id: string; name: string }
    receiver: { id: string; name: string }
  }
  amount: number
  currency: string
  status: string
  bankName: string
  accountNumber: string
  accountName: string
  paystackTransferCode: string | null
  paystackReference: string | null
  failureReason: string | null
  retryCount: number
  createdAt: string
  processedAt: string | null
  completedAt: string | null
  failedAt: string | null
}

export default function MoneyTransferPayouts() {
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [retrying, setRetrying] = useState<string | null>(null)
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 10 

  const { toast } = useToast()

  useEffect(() => {
    fetchPayouts()
  }, [statusFilter, currentPage])

  const fetchPayouts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (search) params.append("search", search)
      
      params.append("page", currentPage.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/admin/money-app-admin/payouts?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setPayouts(data.payouts)
        setTotalPages(data.pagination?.totalPages || data.totalPages || 1)
        setTotalItems(data.pagination?.total || data.total || data.payouts?.length || 0)
      }
    } catch (error) {
      console.error("Failed to fetch payouts:", error)
      toast({
        title: "Error",
        description: "Failed to load payouts",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleRetryPayout = async (payoutId: string) => {
    try {
      setRetrying(payoutId)
      const response = await fetch("/api/admin/money-app-admin/retry-payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId }),
      })

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: "Payout retry initiated",
        })
        fetchPayouts()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to retry payout",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to retry payout",
        variant: "destructive",
      })
    } finally {
      setRetrying(null)
    }
  }

  // Keeping logical status colors for badges only
  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      PENDING: "bg-amber-50 text-amber-700 border-amber-200",
      PROCESSING: "bg-teal-50 text-teal-700 border-teal-200", 
      SUCCESS: "bg-emerald-50 text-emerald-700 border-emerald-200",
      FAILED: "bg-rose-50 text-rose-700 border-rose-200",
      REVERSED: "bg-slate-100 text-slate-700 border-slate-200",
    }
    return variants[status] || "bg-slate-100 text-slate-700 border-slate-200"
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleSearch = () => {
    setCurrentPage(1)
    fetchPayouts()
  }

  const handleReset = () => {
    setSearch("")
    setStatusFilter("all")
    setCurrentPage(1)
    fetchPayouts()
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Money Transfer Payouts</h1>
          <p className="text-sm text-slate-500 mt-1">Monitor and manage Paystack payouts across the network.</p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-50 px-4 py-2 rounded-xl border border-teal-100">
          <Activity className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-bold text-teal-700">Payout Network</span>
        </div>
      </div>

      {/* FILTERS CARD */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="h-5 w-5 text-teal-600" />
          <h3 className="text-lg font-bold text-slate-900">Filters</h3>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by reference, account number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-md border-slate-200 focus-visible:ring-teal-500"
            />
          </div>
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
            <SelectTrigger className="w-full md:w-[200px] border-slate-200 focus:ring-teal-500">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="SUCCESS">Success</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button 
              onClick={handleSearch}
              className="bg-teal-500 hover:bg-teal-600 text-white transition-colors"
            >
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button 
              variant="outline" 
              onClick={handleReset}
              className="border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            >
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* PAYOUTS TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Payout Ledger</h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {totalItems} payout{totalItems !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>

        <div className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white animate-pulse">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
              <p className="text-sm font-medium text-slate-500">Syncing payout data...</p>
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 mx-auto mb-4">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-base font-semibold text-slate-900">No payouts found</p>
              <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Transfer Ref</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Receiver</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Amount</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Bank Details</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Paystack Ref</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Retries</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-mono text-xs font-medium text-slate-600">
                        {payout.transfer.reference}
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-900 text-sm">{payout.transfer.receiver.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-900">
                          ₦{(payout.amount / 100).toFixed(2)}
                        </div>
                        <div className="text-xs text-slate-500 font-medium">{payout.currency}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="font-bold text-slate-900">{payout.bankName}</div>
                          <div className="text-xs text-slate-500 mt-0.5 font-medium">
                            {payout.accountNumber} - {payout.accountName}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-bold border ${getStatusBadge(payout.status)}`}>
                          {payout.status}
                        </Badge>
                        {payout.failureReason && (
                          <div className="text-xs text-rose-600 mt-2 flex items-start gap-1 font-medium max-w-[150px] leading-tight">
                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{payout.failureReason}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">
                        {payout.paystackReference || "-"}
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-md text-xs">
                          {payout.retryCount}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-600">
                        {formatDate(payout.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        {payout.status === "FAILED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-slate-200 text-slate-600 hover:text-teal-700 hover:bg-teal-50 hover:border-teal-200 transition-colors"
                            onClick={() => handleRetryPayout(payout.id)}
                            disabled={retrying === payout.id}
                          >
                            {retrying === payout.id ? (
                              <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                            ) : (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                Retry
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {!loading && payouts.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
            <p className="text-sm text-slate-500 font-medium">
              Showing page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="border-slate-200 text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="border-slate-200 text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}