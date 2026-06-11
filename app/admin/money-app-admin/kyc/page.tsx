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
  ChevronLeft, 
  ChevronRight,
  Building2,
  AlertCircle,
  Users,
  Clock,
  Copy,
  Check,
  Mail,
  Phone
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
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
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
    } catch (error) {
      console.error("Failed to load accounts:", error)
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
        toast({ title: "Status Updated", description: verify ? "Account verified successfully" : "Verification retracted" })
        
        if (selectedAccount && selectedAccount.id === accountId) {
          setSelectedAccount(prev => prev ? { ...prev, isVerified: verify } : null)
        }
        
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

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    toast({ description: "Copied value to clipboard.", duration: 2000 })
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* HEADER SECTION - Styled exactly like Dashboard Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">KYC Verification</h1>
          <p className="text-sm text-slate-500 mt-1">Audit and approve user bank identities for cross-border transfers.</p>
        </div>
        <div className="flex items-center space-x-2 bg-teal-50 px-4 py-2 rounded-xl border border-teal-100 self-start md:self-auto">
          <ShieldCheck className="h-4 w-4 text-teal-600" />
          <span className="text-sm font-bold text-teal-700">KYC Portal Active</span>
        </div>
      </div>

      {/* QUICK STATS BAR - Structured with custom dark-teal gradient & standard borders */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Total Accounts - Custom Primary Gradient Card */}
        <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-6 rounded-2xl shadow-md border border-[#0f766e]/20 group relative overflow-hidden text-white">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/5 blur-2xl"></div>
          <div className="flex items-start justify-between mb-4 relative z-10">
            <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-sm border border-white/10">
              <Users className="h-6 w-6 text-[#2dd4bf]" />
            </div>
          </div>
          <div className="relative z-10">
            <p className="text-sm font-semibold text-teal-100 uppercase tracking-wider mb-1">Total Accounts</p>
            <p className="text-3xl font-black">{totalItems}</p>
            <p className="text-xs text-teal-100/70 mt-2 font-medium">All registered bank transfer profiles</p>
          </div>
        </div>

        {/* Pending Audit Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-slate-50 group-hover:bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-slate-100 group-hover:border-teal-100">
              <Clock className="h-6 w-6 text-amber-500 group-hover:text-amber-600 transition-colors" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Pending Audit</p>
            <p className="text-3xl font-black text-slate-900">
              {bankAccounts.filter(a => !a.isVerified).length}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Awaiting manual validation reviews</p>
          </div>
        </div>

        {/* Verified Profiles Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:border-teal-200 hover:shadow-md transition-all group">
          <div className="flex items-start justify-between mb-4">
            <div className="h-12 w-12 bg-teal-50 transition-colors rounded-xl flex items-center justify-center border border-teal-100">
              <CheckCircle className="h-6 w-6 text-teal-600" />
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-1">Verified Profiles</p>
            <p className="text-3xl font-black text-slate-900">
              {bankAccounts.filter(a => a.isVerified).length}
            </p>
            <p className="text-xs text-slate-500 mt-2 font-medium">Successfully audited accounts</p>
          </div>
        </div>
      </div>

      {/* FILTERS & TABLE CARD */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden bg-white">
        <div className="p-5 flex flex-col lg:flex-row gap-4 items-center bg-slate-50/50 border-b border-slate-100">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by name, email, or account number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10 h-10 bg-white border-slate-200 focus-visible:ring-teal-600 rounded-xl text-sm"
            />
          </div>
          <div className="flex w-full lg:w-auto gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}>
              <SelectTrigger className="w-full sm:w-[180px] h-10 bg-white border-slate-200 rounded-xl text-xs font-semibold text-slate-700">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="verified">Verified Only</SelectItem>
                <SelectItem value="unverified">Unverified Only</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleSearch} className="h-10 bg-[#0f766e] hover:bg-[#0d615b] px-6 text-xs font-bold rounded-xl text-white">
              Search
            </Button>
            {(search || statusFilter !== "all") && (
              <Button variant="ghost" onClick={handleReset} className="h-10 text-slate-500 text-xs font-bold hover:text-slate-900">
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* TABLE SECTION */}
        <div className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Querying KYC database...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow className="border-b border-slate-200">
                    <TableHead className="py-4 pl-6 text-xs font-semibold uppercase tracking-wider text-slate-500">User Identity</TableHead>
                    <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Legal Account Name</TableHead>
                    <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Bank Institution</TableHead>
                    <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</TableHead>
                    <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Onboard Date</TableHead>
                    <TableHead className="py-4 text-xs font-semibold uppercase tracking-wider text-slate-500 text-right pr-6">Management</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((account) => (
                    <TableRow key={account.id} className="group hover:bg-slate-50/40 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 group-hover:bg-[#0f766e] group-hover:text-white transition-all">
                            {account.user.name.substring(0, 2).toUpperCase()}
                          </div>
                          <div className="space-y-0.5">
                            <p className="font-bold text-slate-900 text-sm truncate max-w-[150px]">{account.user.name}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[150px]">{account.user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-700 text-sm">{account.accountHolderName}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">{account.bankName}</span>
                          <span className="text-[11px] font-mono text-slate-500">{account.accountNumber}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {account.isVerified ? (
                          <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-100 font-bold px-2.5 py-0.5 h-6 text-xs rounded-lg">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Verified
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-100 font-bold px-2.5 py-0.5 h-6 text-xs rounded-lg">
                            <AlertCircle className="h-3.5 w-3.5 mr-1" /> Unverified
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {new Date(account.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-all"
                            onClick={() => { setSelectedAccount(account); setShowDetails(true); }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!account.isVerified ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 border-teal-100 bg-white text-teal-700 hover:bg-[#0f766e] hover:text-white text-xs font-semibold rounded-lg transition-all"
                              onClick={() => handleVerify(account.id, true)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify"}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 px-3 border-rose-100 bg-white text-rose-600 hover:bg-rose-600 hover:text-white text-xs font-semibold rounded-lg transition-all"
                              onClick={() => handleVerify(account.id, false)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
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

        {/* PAGINATION PANEL */}
        {!loading && bankAccounts.length > 0 && (
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500">
              Page <span className="text-slate-900 font-bold">{currentPage}</span> of <span className="text-slate-900 font-bold">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 px-3 bg-white border-slate-200 text-slate-600 hover:text-[#0f766e] text-xs font-semibold rounded-lg"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 px-3 bg-white border-slate-200 text-slate-600 hover:text-[#0f766e] text-xs font-semibold rounded-lg"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* PORTFOLIO AUDIT DIALOG */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-xl sm:rounded-2xl border-slate-200 shadow-2xl p-0 overflow-hidden bg-white">
          
          {/* Accent Header - Styled precisely with Dashboard's custom gradient */}
          <div className="p-6 bg-gradient-to-br from-[#0f766e] to-[#1A2433] text-white relative">
            <ShieldCheck className="absolute right-6 top-6 h-16 w-16 text-white/5 pointer-events-none" />
            <DialogHeader>
              <DialogTitle className="text-xl font-bold tracking-tight">KYC Profile Audit</DialogTitle>
              <DialogDescription className="text-teal-100/70 text-xs">
                Detailed bank association logs for compliance auditing.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          <div className="p-6 space-y-6">
            {selectedAccount && (
              <>
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">User Contact Profile</Label>
                    <p className="font-bold text-slate-900 text-sm">{selectedAccount.user.name}</p>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Mail className="h-3 w-3" />
                      <span>{selectedAccount.user.email}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Phone className="h-3 w-3" />
                      <span>{selectedAccount.user.phone}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bank Institution</Label>
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-4 w-4 text-[#0f766e]" />
                      <p className="font-bold text-slate-900 text-sm">{selectedAccount.bankName}</p>
                    </div>
                    <p className="text-xs text-slate-500 uppercase font-semibold">{selectedAccount.accountType} Account</p>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-xl border border-slate-150 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Legal Account Name</Label>
                      <p className="text-sm font-bold text-slate-900">{selectedAccount.accountHolderName}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Account Number</Label>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono font-bold text-teal-800 tracking-tight">{selectedAccount.accountNumber}</p>
                        <button 
                          onClick={() => copyToClipboard(selectedAccount.accountNumber, "acc")}
                          className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-700 transition"
                        >
                          {copiedId === "acc" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200/60 pt-4">
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Routing Number</Label>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-slate-600">{selectedAccount.routingNumber || "—"}</p>
                        {selectedAccount.routingNumber && (
                          <button 
                            onClick={() => copyToClipboard(selectedAccount.routingNumber || "", "rtn")}
                            className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-700 transition"
                          >
                            {copiedId === "rtn" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">SWIFT / BIC</Label>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-mono text-slate-600">{selectedAccount.swiftCode || "—"}</p>
                        {selectedAccount.swiftCode && (
                          <button 
                            onClick={() => copyToClipboard(selectedAccount.swiftCode || "", "swf")}
                            className="p-1 hover:bg-slate-200/60 rounded text-slate-400 hover:text-slate-700 transition"
                          >
                            {copiedId === "swf" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-teal-50/50 rounded-xl border border-teal-100">
                   <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-teal-700" />
                      <span className="text-xs font-semibold text-teal-800 tracking-tight">Profile Verification Status</span>
                   </div>
                   {selectedAccount.isVerified ? (
                    <Badge className="bg-[#0f766e] hover:bg-[#0f766e] text-white border-none font-bold text-[10px] tracking-wide rounded-md">VERIFIED</Badge>
                  ) : (
                    <Badge className="bg-amber-500 hover:bg-amber-500 text-white border-none font-bold text-[10px] tracking-wide rounded-md">UNVERIFIED</Badge>
                  )}
                </div>
              </>
            )}
          </div>
          
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setShowDetails(false)}
                className="text-xs font-semibold border-slate-200 rounded-lg text-slate-500 hover:text-slate-800"
              >
                Close Audit Logs
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}