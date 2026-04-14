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
import { Search, Eye, Download, Filter, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Transaction {
  id: string
  reference: string
  sender: { id: string; name: string; email: string; phone: string }
  receiver: { id: string; name: string; email: string; phone: string }
  amount: number
  currency: string
  ngnAmount: number
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
  const { toast } = useToast()

  useEffect(() => {
    fetchTransactions()
  }, [statusFilter])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.append("status", statusFilter)
      if (search) params.append("search", search)

      const response = await fetch(`/api/admin/money-app-admin/transactions?${params.toString()}`)
      const data = await response.json()
      
      if (data.success) {
        setTransactions(data.transfers)
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

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      PENDING: "bg-yellow-100 text-yellow-800",
      PROCESSING: "bg-blue-100 text-blue-800",
      SENT: "bg-purple-100 text-purple-800",
      COMPLETED: "bg-green-100 text-green-800",
      FAILED: "bg-red-100 text-red-800",
      CANCELLED: "bg-gray-100 text-gray-800",
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
        <h1 className="text-3xl font-bold text-gray-900">Money Transfer Transactions</h1>
        <p className="text-gray-600 mt-1">View and manage all money transfers</p>
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
                placeholder="Search by reference, name, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchTransactions()}
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
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={fetchTransactions}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button variant="outline" onClick={() => {
              setSearch("")
              setStatusFilter("all")
              fetchTransactions()
            }}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>
            {transactions?.length} transaction{transactions?.length !== 1 ? "s" : ""} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-green-600" />
            </div>
          ) : transactions?.length === 0 ? (
            <div className="text-center py-12 text-gray-500">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Receiver</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Payout Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions?.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-mono text-xs">
                        {transaction.reference}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{transaction?.sender?.name}</div>
                          <div className="text-xs text-gray-500">{transaction.sender.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                                <div className="font-medium">{transaction.receiver.name}</div>
                          <div className="text-xs text-gray-500">{transaction.receiver.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">
                            {transaction.currency} {transaction.amount.toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">
                            ₦{transaction.ngnAmount?.toFixed(2) || "0.00"}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusBadge(transaction.status)}>
                          {transaction.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {transaction.payout ? (
                          <Badge className={getStatusBadge(transaction.payout.status)}>
                            {transaction.payout.status}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatDate(transaction.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
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
        </CardContent>
      </Card>
    </div>
  )
}
