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
import { Search, CheckCircle, XCircle, Eye, Loader2 } from "lucide-react"
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
  const { toast } = useToast()

  useEffect(() => {
    fetchBankAccounts()
  }, [statusFilter])

  const fetchBankAccounts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") {
        params.append("status", statusFilter === "verified" ? "verified" : "unverified")
      }
      if (search) params.append("search", search)

      const response = await fetch(`/api/admin/money-app-admin/bank-accounts?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setBankAccounts(data.bankAccounts)
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
      // Create endpoint: POST /api/admin/money-app-admin/verify-bank-account
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Bank Account Verification</h1>
        <p className="text-gray-600 mt-1">Verify user bank accounts for money transfer</p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name, email, account number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="unverified">Unverified</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={fetchBankAccounts}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Bank Accounts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Accounts</CardTitle>
          <CardDescription>
            Verify bank accounts to enable money transfer functionality
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : bankAccounts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No bank accounts found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{account.user.name}</div>
                          <div className="text-xs text-gray-500">{account.user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{account.accountHolderName}</TableCell>
                      <TableCell>{account.bankName}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {account.accountNumber}
                      </TableCell>
                      <TableCell>
                        {account.isVerified ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-100 text-yellow-800">
                            <XCircle className="h-3 w-3 mr-1" />
                            Unverified
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(account.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
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
                              onClick={() => handleVerify(account.id, true)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Verify"
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleVerify(account.id, false)}
                              disabled={verifying === account.id}
                            >
                              {verifying === account.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
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
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bank Account Details</DialogTitle>
            <DialogDescription>View complete bank account information</DialogDescription>
          </DialogHeader>
          {selectedAccount && (
            <div className="space-y-4">
              <div>
                <Label>User</Label>
                <p className="font-medium">{selectedAccount.user.name}</p>
                <p className="text-sm text-gray-500">{selectedAccount.user.email}</p>
                <p className="text-sm text-gray-500">{selectedAccount.user.phone}</p>
              </div>
              <div>
                <Label>Account Holder</Label>
                <p className="font-medium">{selectedAccount.accountHolderName}</p>
              </div>
              <div>
                <Label>Bank Name</Label>
                <p>{selectedAccount.bankName}</p>
              </div>
              <div>
                <Label>Account Number</Label>
                <p className="font-mono">{selectedAccount.accountNumber}</p>
              </div>
              {selectedAccount.routingNumber && (
                <div>
                  <Label>Routing Number</Label>
                  <p className="font-mono">{selectedAccount.routingNumber}</p>
                </div>
              )}
              {selectedAccount.swiftCode && (
                <div>
                  <Label>SWIFT Code</Label>
                  <p className="font-mono">{selectedAccount.swiftCode}</p>
                </div>
              )}
              <div>
                <Label>Account Type</Label>
                <p>{selectedAccount.accountType}</p>
              </div>
              <div>
                <Label>Status</Label>
                {selectedAccount.isVerified ? (
                  <Badge className="bg-green-100 text-green-800">Verified</Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-800">Unverified</Badge>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetails(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
