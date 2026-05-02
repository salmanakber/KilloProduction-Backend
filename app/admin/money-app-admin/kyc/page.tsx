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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, CheckCircle, XCircle, Eye, Loader2, ShieldCheck, Filter, ChevronLeft, ChevronRight } from "lucide-react"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

interface BankAccount {
  id: string
  userId: string
  accountHolderName: string
  bankName: string
  accountNumber: string
  routingNumber: string | null
  swiftCode: string | null
  accountType: string
  isDefault: boolean
  isVerified: boolean
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    phone: string
  }
}

export default function MoneyTransferKYC() {
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [selectedAccount, setSelectedAccount] = useState<BankAccount | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [verifying, setVerifying] = useState<string | null>(null)
  
  // Pagination State Added
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 10

  const { toast } = useToast()

  // Appended currentPage to dependencies
  useEffect(() => {
    fetchBankAccounts()
  }, [statusFilter, currentPage])

  const fetchBankAccounts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") {
        params.append("status", statusFilter === "verified" ? "verified" : "unverified")
      }
      if (search) params.append("search", search)
      
      // Pagination params
      params.append("page", currentPage.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/admin/money-app-admin/bank-accounts?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setBankAccounts(data.bankAccounts)
        // Extracting pagination safely
        setTotalPages(data.pagination?.totalPages || data.totalPages || 1)
        setTotalItems(data.pagination?.total || data.total || data.bankAccounts?.length || 0)
      }
    } catch (error) {
      console.error("Failed to fetch bank accounts:", error)
      toast({
        title: "Error",
        description: "Failed to load bank accounts",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (accountId: string, verify: boolean) => {
    try {
      setVerifying(accountId)
      const response = await fetch("/api/admin/money-app-admin/verify-bank-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, isVerified: verify }),
      })

      const data = await response.json()
      
      if (data.success) {
        toast({
          title: "Success",
          description: verify ? "Bank account verified" : "Bank account verification removed",
        })
        fetchBankAccounts()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to update verification",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update verification",
        variant: "destructive",
      })
    } finally {
      setVerifying(null)
    }
  }

  // Search & Reset Handlers for Pagination
  const handleSearch = () => {
    setCurrentPage(1)
    fetchBankAccounts()
  }

  const handleReset = () => {
    setSearch("")
    setStatusFilter("all")
    setCurrentPage(1)
    fetchBankAccounts()
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bank Account Verification</h1>
          <p className="text-sm text-slate-500 mt-1">Verify user bank accounts (KYC) for money transfers.</p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-50 px-4 py-2 rounded-xl border border-teal-100">
          <ShieldCheck className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-bold text-teal-700">KYC Portal</span>
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
              placeholder="Search by name, email, account number..."
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
              <SelectItem value="all">All Accounts</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="unverified">Unverified</SelectItem>
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

      {/* ACCOUNTS TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Registered Accounts</h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {totalItems} account{totalItems !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>

        <div className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 bg-white animate-pulse">
              <Loader2 className="h-8 w-8 animate-spin text-teal-500 mb-4" />
              <p className="text-sm font-medium text-slate-500">Syncing KYC records...</p>
            </div>
          ) : bankAccounts.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-12 w-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 mx-auto mb-4">
                <Search className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-base font-semibold text-slate-900">No bank accounts found</p>
              <p className="text-sm text-slate-500 mt-1">Try adjusting your filters or search query.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-200">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">User</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Account Name</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Bank</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Account Number</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Status</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4">Date Added</TableHead>
                    <TableHead className="text-xs font-semibold text-slate-500 uppercase tracking-wider py-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((account) => (
                    <TableRow key={account.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <TableCell>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{account.user.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{account.user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{account.accountHolderName}</TableCell>
                      <TableCell className="font-medium text-slate-600">{account.bankName}</TableCell>
                      <TableCell className="font-mono text-xs font-medium text-slate-600">
                        {account.accountNumber}
                      </TableCell>
                      <TableCell>
                        {account.isVerified ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 font-bold">
                            <CheckCircle className="h-3 w-3 mr-1.5" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold">
                            <XCircle className="h-3 w-3 mr-1.5" />
                            Unverified
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-medium text-slate-600">
                        {new Date(account.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-500 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                            onClick={() => {
                              setSelectedAccount(account)
                              setShowDetails(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!account.isVerified ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-slate-200 text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
                              onClick={() => handleVerify(account.id, true)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
                              ) : (
                                "Verify"
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-slate-200 text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
                              onClick={() => handleVerify(account.id, false)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                              ) : (
                                "Unverify"
                              )}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {!loading && bankAccounts.length > 0 && (
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

      {/* DETAILS DIALOG */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:rounded-3xl border-slate-200 shadow-xl p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-900">Bank Account Details</DialogTitle>
              <DialogDescription className="text-slate-500 text-sm">
                Complete KYC information for this banking profile.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6">
            {selectedAccount && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">User Identity</Label>
                  <p className="font-bold text-slate-900">{selectedAccount.user.name}</p>
                  <p className="text-sm text-slate-500 font-medium">{selectedAccount.user.email}</p>
                  <p className="text-sm text-slate-500 font-medium">{selectedAccount.user.phone}</p>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Holder</Label>
                  <p className="font-bold text-slate-900">{selectedAccount.accountHolderName}</p>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bank Name</Label>
                  <p className="font-bold text-slate-900">{selectedAccount.bankName}</p>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Number</Label>
                  <p className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-1 rounded w-fit">{selectedAccount.accountNumber}</p>
                </div>
                
                {selectedAccount.routingNumber && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Routing Number</Label>
                    <p className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-1 rounded w-fit">{selectedAccount.routingNumber}</p>
                  </div>
                )}
                
                {selectedAccount.swiftCode && (
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">SWIFT Code</Label>
                    <p className="font-mono font-medium text-slate-900 bg-slate-100 px-2 py-1 rounded w-fit">{selectedAccount.swiftCode}</p>
                  </div>
                )}
                
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Account Type</Label>
                  <p className="font-bold text-slate-900 capitalize">{selectedAccount.accountType}</p>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">KYC Status</Label>
                  {selectedAccount.isVerified ? (
                    <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 font-bold">
                      <CheckCircle className="h-3 w-3 mr-1.5" />
                      Verified Profile
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold">
                      <XCircle className="h-3 w-3 mr-1.5" />
                      Unverified Profile
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowDetails(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-100"
              >
                Close Details
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}