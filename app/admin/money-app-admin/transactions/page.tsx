"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
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
import { 
  Search, 
  Eye, 
  Filter, 
  Loader2, 
  List, 
  ChevronLeft, 
  ChevronRight, 
  ArrowUpRight, 
  RefreshCcw,
  Copy,
  Wallet,
  CheckCircle2,
  Clock
} from "lucide-react"
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
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 10

  const { toast } = useToast()

  useEffect(() => {
    fetchTransactions()
  }, [statusFilter, currentPage])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (search) params.append("search", search)
      params.append("page", currentPage.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/admin/money-app-admin/transactions?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setTransactions(data.transfers)
        setTotalPages(data.pagination?.totalPages || data.totalPages || 1)
        setTotalItems(data.pagination?.total || data.total || data.transfers?.length || 0)
      }
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
      toast({ title: "Error", description: "Failed to load transactions", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

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

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const handleSearch = () => { setCurrentPage(1); fetchTransactions(); }
  const handleReset = () => { setSearch(""); setStatusFilter("all"); setCurrentPage(1); }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-12">
      
      {/* HEADER AREA */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Transactions</h1>
          <p className="text-slate-500 font-medium">Global ledger for cross-border money transfers.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchTransactions} 
            className="hidden md:flex bg-white border-slate-200 shadow-sm"
          >
            <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <div className="flex items-center space-x-2 bg-teal-600 text-white px-4 py-2 rounded-xl shadow-md shadow-teal-100">
            <List className="h-4 w-4" />
            <span className="text-sm font-bold">Ledger View</span>
          </div>
        </div>
      </div>

      {/* QUICK STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm bg-white overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-teal-50 flex items-center justify-center">
              <Wallet className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Total Transactions</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalItems}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Success Rate</p>
              <h3 className="text-2xl font-bold text-slate-900">98.4%</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-500" />
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Pending Actions</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {transactions.filter(t => t.status === 'PENDING').length}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTER BAR */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search reference, name, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-10 bg-slate-50/50 border-slate-200 focus-visible:ring-teal-600"
              />
            </div>
            <div className="flex w-full md:w-auto gap-3">
              <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
                <SelectTrigger className="w-full md:w-[180px] bg-white border-slate-200">
                  <div className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5 text-slate-400" />
                    <SelectValue placeholder="All Status" />
                  </div>
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
              <Button onClick={handleSearch} className="bg-teal-600 hover:bg-teal-700 shadow-sm px-6">
                Search
              </Button>
              <Button variant="ghost" onClick={handleReset} className="text-slate-500 hover:text-slate-900">
                Reset
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MAIN TABLE CARD */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="hover:bg-transparent border-b border-slate-200">
                <TableHead className="w-[140px] text-xs font-bold text-slate-500 uppercase py-4 pl-6">Reference</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase py-4">Sender</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase py-4">Receiver</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase py-4">Amount Details</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase py-4">Status</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase py-4">Date</TableHead>
                <TableHead className="text-xs font-bold text-slate-500 uppercase py-4 text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
                      <p className="text-sm font-medium text-slate-500">Loading ledger data...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Search className="h-10 w-10 mb-2 opacity-20" />
                      <p className="font-medium text-slate-500">No transactions match your criteria</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((transaction) => (
                  <TableRow key={transaction.id} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {transaction.reference.substring(0, 10)}...
                        </span>
                        <Copy className="h-3 w-3 text-slate-300 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity hover:text-teal-600" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                          {getInitials(transaction.sender.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{transaction.sender.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{transaction.sender.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-teal-50 border border-teal-100 flex items-center justify-center text-[10px] font-bold text-teal-600 shrink-0">
                          {getInitials(transaction.receiver.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{transaction.receiver.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{transaction.receiver.phone || 'No phone'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-sm font-black text-slate-900">
                            {transaction.baseAmount 
                              ? Number(transaction.baseAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })
                              : transaction.amount.toFixed(2)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500">{transaction.baseCurrency || transaction.currency}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ArrowUpRight className="h-3 w-3 text-slate-400" />
                          <span className="text-[10px] font-medium text-slate-500">
                            {transaction.currency} {transaction.amount} → {transaction.receiveCurrency} {transaction.receiveAmount}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1.5">
                        <Badge variant="outline" className={`text-[10px] px-2 py-0 h-5 font-bold uppercase tracking-wider ${getStatusBadge(transaction.status)}`}>
                          {transaction.status}
                        </Badge>
                        {transaction.payout && (
                          <div className="flex items-center gap-1 ml-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${transaction.payout.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                            <span className="text-[9px] font-bold text-slate-400 tracking-tight">PAYOUT: {transaction.payout.status}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-xs font-semibold text-slate-600">{formatDate(transaction.createdAt)}</p>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-full transition-all"
                        onClick={() => window.location.href = `/admin/money-app-admin/transactions/${transaction.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* PAGINATION */}
        {!loading && transactions.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <div className="text-xs font-medium text-slate-500">
              Showing <span className="text-slate-900 font-bold">{(currentPage - 1) * limit + 1}</span> to <span className="text-slate-900 font-bold">{Math.min(currentPage * limit, totalItems)}</span> of <span className="text-slate-900 font-bold">{totalItems}</span> results
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-3 border-slate-200 bg-white text-slate-600 hover:text-teal-600 shadow-sm"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <div className="flex items-center gap-1 mx-2">
                <span className="text-xs font-bold text-teal-600 bg-teal-50 px-2 py-1 rounded">{currentPage}</span>
                <span className="text-xs font-bold text-slate-300">/</span>
                <span className="text-xs font-bold text-slate-500">{totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-3 border-slate-200 bg-white text-slate-600 hover:text-teal-600 shadow-sm"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}