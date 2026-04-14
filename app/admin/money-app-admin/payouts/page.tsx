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
import { Search, RefreshCw, Download, Loader2, AlertCircle } from "lucide-react"
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
  const { toast } = useToast()

  useEffect(() => {
    fetchPayouts()
  }, [statusFilter])

  const fetchPayouts = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (search) params.append("search", search)

      const response = await fetch(`/api/admin/money-app-admin/payouts?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setPayouts(data.payouts)
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-800",
      PROCESSING: "bg-blue-100 text-blue-800",
      SUCCESS: "bg-green-100 text-green-800",
      FAILED: "bg-red-100 text-red-800",
      REVERSED: "bg-gray-100 text-gray-800",
    }
    return variants[status] || "bg-gray-100 text-gray-800"
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Money Transfer Payouts</h1>
        <p className="text-gray-600 mt-1">Monitor and manage Paystack payouts</p>
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
                placeholder="Search by reference, account number..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchPayouts()}
                className="max-w-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
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
            <Button onClick={fetchPayouts}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Payouts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
          <CardDescription>
            {payouts.length} payout{payouts.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : payouts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No payouts found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Transfer Ref</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Bank Details</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paystack Ref</TableHead>
                    <TableHead>Retries</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payouts.map((payout) => (
                    <TableRow key={payout.id}>
                      <TableCell className="font-mono text-xs">
                        {payout.transfer.reference}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{payout.transfer.receiver.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          ₦{(payout.amount / 100).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500">{payout.currency}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{payout.bankName}</div>
                          <div className="text-xs text-gray-500">
                            {payout.accountNumber} - {payout.accountName}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(payout.status)}>
                          {payout.status}
                        </Badge>
                        {payout.failureReason && (
                          <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {payout.failureReason}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {payout.paystackReference || "-"}
                      </TableCell>
                      <TableCell>{payout.retryCount}</TableCell>
                      <TableCell className="text-sm">
                        {formatDate(payout.createdAt)}
                      </TableCell>
                      <TableCell>
                        {payout.status === "FAILED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetryPayout(payout.id)}
                            disabled={retrying === payout.id}
                          >
                            {retrying === payout.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
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
        </CardContent>
      </Card>
    </div>
  )
}
