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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  Search, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Loader2, 
  ShieldCheck, 
  Filter, 
  ChevronLeft, 
  ChevronRight,
  User,
  Building2,
  AlertCircle,
  Users,
  UserCheck,
  Clock
} from "lucide-react"
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
  
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const limit = 10

  const { toast } = useToast()

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
      params.append("page", currentPage.toString())
      params.append("limit", limit.toString())

      const response = await fetch(`/api/admin/money-app-admin/bank-accounts?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setBankAccounts(data.bankAccounts)
        setTotalPages(data.pagination?.totalPages || data.totalPages || 1)
        setTotalItems(data.pagination?.total || data.total || data.bankAccounts?.length || 0)
      }
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
        toast({ title: "Success", description: verify ? "Account verified" : "Verification retracted" })
        fetchBankAccounts()
      } else throw new Error(data.error)
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Update failed", variant: "destructive" })
    } finally {
      setVerifying(null)
    }
  }

  const handleSearch = () => { setCurrentPage(1); fetchBankAccounts(); }
  const handleReset = () => { setSearch(""); setStatusFilter("all"); setCurrentPage(1); fetchBankAccounts(); }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">KYC Verification</h1>
          <p className="text-slate-500 font-medium mt-1">Audit and approve user bank identities for cross-border transfers.</p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-600 text-white px-5 py-2.5 rounded-2xl shadow-lg shadow-teal-100">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-bold">KYC Portal Active</span>
        </div>
      </div>

      {/* QUICK STATS BAR */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center border border-slate-100">
              <Users className="h-6 w-6 text-slate-500" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Accounts</p>
              <h3 className="text-2xl font-bold text-slate-900">{totalItems}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center border border-amber-100">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pending Audit</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {bankAccounts.filter(a => !a.isVerified).length}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-teal-50 flex items-center justify-center border border-teal-100">
              <UserCheck className="h-6 w-6 text-teal-600" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verified Profiles</p>
              <h3 className="text-2xl font-bold text-slate-900">
                {bankAccounts.filter(a => a.isVerified).length}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FILTERS */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-6 flex flex-col md:flex-row gap-4 items-center bg-slate-50/50">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, email, or account number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 h-11 bg-white border-slate-200 focus-visible:ring-teal-600 rounded-xl shadow-sm"
            />
          </div>
          <div className="flex w-full md:w-auto gap-3">
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full md:w-[180px] h-11 bg-white border-slate-200 rounded-xl shadow-sm">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} className="h-11 bg-teal-600 hover:bg-teal-700 px-6 font-bold shadow-md shadow-teal-100 rounded-xl">
              Search
            </Button>
            <Button variant="ghost" onClick={handleReset} className="h-11 text-slate-500 font-bold hover:text-slate-900">
              Reset
            </Button>
          </div>
        </div>

        {/* TABLE */}
        <div className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Scanning KYC database...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-slate-500">User Identity</TableHead>
                    <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Legal Account Name</TableHead>
                    <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Bank Institution</TableHead>
                    <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Status</TableHead>
                    <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Onboard Date</TableHead>
                    <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right pr-6">Management</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((account) => (
                    <TableRow key={account.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-black text-slate-500 group-hover:bg-teal-600 group-hover:text-white transition-all">
                            {account.user.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 text-sm truncate max-w-[150px]">{account.user.name}</p>
                            <p className="text-[11px] text-slate-500 truncate max-w-[150px]">{account.user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold text-slate-700 text-sm">{account.accountHolderName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">{account.bankName}</span>
                          <span className="text-[11px] font-mono text-slate-500">{account.accountNumber}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.isVerified ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100 font-bold px-2 py-0 h-5">
                            <CheckCircle className="h-3 w-3 mr-1" /> Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 font-bold px-2 py-0 h-5">
                            <AlertCircle className="h-3 w-3 mr-1" /> Unverified
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-semibold text-slate-500">
                        {new Date(account.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-lg transition-all"
                            onClick={() => { setSelectedAccount(account); setShowDetails(true); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!account.isVerified ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-4 border-teal-100 bg-white text-teal-700 hover:bg-teal-600 hover:text-white font-bold rounded-lg transition-all"
                              onClick={() => handleVerify(account.id, true)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-4 border-rose-100 bg-white text-rose-600 hover:bg-rose-600 hover:text-white font-bold rounded-lg transition-all"
                              onClick={() => handleVerify(account.id, false)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Unverify"}
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

        {/* PAGINATION */}
        {!loading && bankAccounts.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Page <span className="text-slate-900">{currentPage}</span> of <span className="text-slate-900">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-4 bg-white border-slate-200 text-slate-600 hover:text-teal-600 font-bold"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-4 bg-white border-slate-200 text-slate-600 hover:text-teal-600 font-bold"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* DETAILS DIALOG */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-xl sm:rounded-3xl border-slate-200 shadow-2xl p-0 overflow-hidden bg-white">
          <div className="p-8 bg-slate-900 text-white relative">
            <ShieldCheck className="absolute right-8 top-8 h-20 w-20 text-white/5" />
            <DialogHeader>
              <DialogTitle className="text-2xl font-black tracking-tight">KYC Profile Audit</DialogTitle>
              <DialogDescription className="text-slate-400 font-medium">
                Detailed bank association for user {selectedAccount?.user.name}
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-8 space-y-8">
            {selectedAccount && (
              <>
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User Contact</Label>
                    <p className="font-bold text-slate-900">{selectedAccount.user.name}</p>
                    <p className="text-xs text-slate-500 font-medium">{selectedAccount.user.email}</p>
                    <p className="text-xs text-slate-500 font-medium">{selectedAccount.user.phone}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bank Institution</Label>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-teal-600" />
                      <p className="font-bold text-slate-900">{selectedAccount.bankName}</p>
                    </div>
                    <p className="text-xs text-slate-500 font-medium uppercase">{selectedAccount.accountType} Account</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legal Account Name</Label>
                      <p className="text-sm font-bold text-slate-900">{selectedAccount.accountHolderName}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Account Number</Label>
                      <p className="text-sm font-mono font-black text-teal-700 tracking-tighter">{selectedAccount.accountNumber}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200/50 pt-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Routing Number</Label>
                      <p className="text-sm font-mono text-slate-600">{selectedAccount.routingNumber || "—"}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">SWIFT / BIC</Label>
                      <p className="text-sm font-mono text-slate-600">{selectedAccount.swiftCode || "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-teal-50/50 rounded-2xl border border-teal-100">
                   <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-teal-600" />
                      <span className="text-xs font-bold text-teal-800 tracking-tight">Profile Verification Status</span>
                   </div>
                   {selectedAccount.isVerified ? (
                    <Badge className="bg-teal-600 text-white border-none font-bold">VERIFIED</Badge>
                  ) : (
                    <Badge className="bg-amber-500 text-white border-none font-bold">UNVERIFIED</Badge>
                  )}
                </div>
              </>
            )}
          </div>
          
          <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <DialogFooter>
              <Button 
                variant="ghost" 
                onClick={() => setShowDetails(false)}
                className="text-slate-500 font-bold hover:text-slate-900"
              >
                Close Audit
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}