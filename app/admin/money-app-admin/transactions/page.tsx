"use client"

import { useState, useEffect } from "react"
// Kept imports for UI components you are using
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
import { Search, Eye, Filter, Loader2, List, ChevronLeft, ChevronRight } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Transaction {
  id: string
  reference: string
  sender: { id: string; name: string; email: string; phone: string }
  receiver: { id: string; name: string; email: string; phone: string }
  amount: number
  currency: string
  ngnAmount: number | null
  exchangeRate: number | null
  baseCurrency: string | null
  baseAmount: number | null
  receiveAmount: number | null
  receiveCurrency: string | null
  fee: number | null
  feeBase: number | null
  fxMarginBase: number | null
  status: string
  stripePaymentIntentId: string
  payout: { id: string; status: string; paystackReference: string; failureReason: string } | null
  description: string
  createdAt: string
  completedAt: string | null
  failedAt: string | null
}

export default function MoneyTransferTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  
  // Pagination State added
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 10 // Items per page

  const { toast } = useToast()

  // Updated to include currentPage in dependency array
  useEffect(() => {
    fetchTransactions()
  }, [statusFilter, currentPage])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (search) params.append("search", search)
      
      // Added pagination parameters
      params.append("page", currentPage.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/admin/money-app-admin/transactions?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setTransactions(data.transfers)
        // Assume API returns pagination data, fallback gracefully if not yet implemented
        setTotalPages(data.pagination?.totalPages || data.totalPages || 1)
        setTotalItems(data.pagination?.total || data.total || data.transfers?.length || 0)
      }
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
      toast({
        title: "Error",
        description: "Failed to load transactions",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Updated to match your Dashboard's color palette (Teal/Amber/Rose/Blue)
  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      PENDING: "bg-amber-50 text-amber-700 border-amber-200",
      PROCESSING: "bg-blue-50 text-blue-700 border-blue-200",
      SENT: "bg-teal-50 text-teal-700 border-teal-200",
      COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
      FAILED: "bg-rose-50 text-rose-700 border-rose-200",
      CANCELLED: "bg-slate-100 text-slate-700 border-slate-200",
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
    setCurrentPage(1) // Reset to page 1 on new search
    fetchTransactions()
  }

  const handleReset = () => {
    setSearch("")
    setStatusFilter("all")
    setCurrentPage(1)
    fetchTransactions()
  }

  return (
    // Applied Dashboard Wrapper animations and spacing
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER - Replicated from Dashboard */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Money Transfer Transactions</h1>
          <p className="text-sm text-slate-500 mt-1">View and manage all money transfers across the network.</p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-50 px-4 py-2 rounded-xl border border-teal-100">
          <List className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-bold text-teal-700">Ledger View</span>
        </div>
      </div>

      {/* FILTERS CARD - Replaced generic Card with specific dashboard styling */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-6">
          <Filter className="h-5 w-5 text-teal-600" />
          <h3 className="text-lg font-bold text-slate-900">Filters</h3>
        </div>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              placeholder="Search by reference, name, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-md border-slate-200 focus-visible:ring-teal-600"
            />
          </div>
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
            <SelectTrigger className="w-full md:w-[200px] border-slate-200 focus:ring-teal-600">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="PROCESSING">Processing</SelectItem>
              <SelectItem value="SENT">Sent</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button 
              onClick={handleSearch}
              className="bg-teal-600 hover:bg-teal-700 text-white transition-colors"
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

      {/* TRANSACTIONS TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Transactions</h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {totalItems} transaction{totalItems !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
        
        <div className="p-0">
          {loading ? (
            // Replicated Loading State from Dashboard
            <div className="flex flex-col items-center justify-center h-64 bg-white animate-pulse">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
              <p className="text-sm font-medium text-slate-500">Syncing transaction data...</p>
            </div>
          ) : transactions?.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 mx-auto mb-4">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-base font-semibold text-slate-900">No transactions found</p>
              <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="hover:bg-transparent">
                    {/* Updated headers to match Card Labels from dashboard */}
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Reference</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Sender</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Receiver</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Amount</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Payout Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Date</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions?.map((transaction) => (
                    <TableRow key={transaction.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-mono text-xs font-medium text-slate-600">
                        {transaction.reference}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{transaction?.sender?.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{transaction.sender.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{transaction.receiver.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{transaction.receiver.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-bold text-slate-900">
                            {transaction.baseAmount != null && transaction.baseCurrency ? (
                              <>
                                {Number(transaction.baseAmount).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}{" "}
                                {transaction.baseCurrency}
                                <span className="text-slate-400 font-medium text-xs ml-1">(reporting)</span>
                              </>
                            ) : (
                              <>
                                {transaction.currency} {transaction.amount.toFixed(2)}
                                <span className="text-slate-400 font-medium text-xs ml-1">(no base snapshot)</span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-medium">
                            Send: <span className="text-slate-700">{transaction.currency} {transaction.amount.toFixed(2)}</span>
                            {transaction.receiveAmount != null && transaction.receiveCurrency
                              ? <> &middot; Set: <span className="text-slate-700">{Number(transaction.receiveAmount).toFixed(2)} {transaction.receiveCurrency}</span></>
                              : ""}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-bold border ${getStatusBadge(transaction.status)}`}>
                          {transaction.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {transaction.payout ? (
                          <Badge variant="outline" className={`font-bold border ${getStatusBadge(transaction.payout.status)}`}>
                            {transaction.payout.status}
                          </Badge>
                        ) : (
                          <span className="text-slate-400 font-medium">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-600">
                        {formatDate(transaction.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-teal-600 hover:bg-teal-50 transition-colors rounded-xl"
                          onClick={() => {
                            window.location.href = `/admin/money-app-admin/transactions/${transaction.id}`
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {!loading && transactions?.length > 0 && (
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