"use client"

import { useEffect, useState } from "react"
import { 
  Loader2, 
  Plus, 
  ExternalLink, 
  Search, 
  Filter, 
  Ticket, 
  AlertCircle, 
  CheckCircle2, 
  Clock,
  X,
  ArrowRight,
  MessageSquare
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"

type CaseRow = {
  id: string
  ticketNumber: string
  type: string
  status: string
  priority: string
  subject: string
  transfer?: { reference: string; status: string } | null
  _count: { notes: number }
  createdAt: string
}

export default function MoneyTransferCasesPage() {
  const { toast } = useToast()
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    subject: "",
    description: "",
    type: "REFUND_REQUEST",
    transferId: "",
    priority: "MEDIUM",
  })

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== "all") params.set("status", statusFilter)
      const res = await fetch(`/api/admin/money-app-admin/cases?${params}`)
      const json = await res.json()
      if (json.success) setCases(json.cases)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [statusFilter])

  const createCase = async () => {
    try {
      const res = await fetch("/api/admin/money-app-admin/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: "Case created", description: `Ticket #${json.case.ticketNumber} generated.` })
      setShowCreate(false)
      setForm({ subject: "", description: "", type: "REFUND_REQUEST", transferId: "", priority: "MEDIUM" })
      load()
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" })
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      OPEN: "bg-blue-50 text-blue-700 border-blue-200",
      IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
      RESOLVED: "bg-teal-50 text-teal-700 border-teal-200",
      CLOSED: "bg-slate-100 text-slate-500 border-slate-200",
    }
    return variants[status] || "bg-slate-50 text-slate-600"
  }

  const getTypeBadge = (type: string) => {
    const variants: Record<string, string> = {
      FRAUD_REVIEW: "bg-rose-50 text-rose-700 border-rose-200",
      DISPUTE: "bg-orange-50 text-orange-700 border-orange-200",
      REFUND_REQUEST: "bg-teal-50 text-teal-700 border-teal-200",
      PAYOUT_ISSUE: "bg-indigo-50 text-indigo-700 border-indigo-200",
    }
    return variants[type] || "bg-slate-50 text-slate-600"
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER & SUMMARY STATS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Support Cases</h1>
          <p className="text-slate-500 font-medium">Manage disputes, refunds, and technical payout escalations.</p>
        </div>
        <div className="flex gap-3">
           <div className="hidden lg:flex items-center gap-4 px-4 py-2 bg-white rounded-xl border border-slate-200 shadow-sm mr-4">
              <div className="flex items-center gap-1.5 border-r pr-4">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-xs font-bold text-slate-600">{cases.filter(c => c.status === 'OPEN').length} Open</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-bold text-slate-600">{cases.filter(c => c.status === 'RESOLVED').length} Resolved</span>
              </div>
           </div>
           <Button 
            onClick={() => setShowCreate(!showCreate)} 
            className={`${showCreate ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'bg-teal-600 hover:bg-teal-700'} transition-all gap-2 px-6 rounded-xl font-bold`}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? "Cancel" : "New Case"}
          </Button>
        </div>
      </div>

      {/* CREATE CASE FORM */}
      {showCreate && (
        <Card className="border-teal-200 bg-teal-50/20 shadow-lg shadow-teal-900/5 animate-in slide-in-from-top-4 duration-300">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg font-bold text-teal-900 flex items-center gap-2">
              <Ticket className="h-5 w-5" /> Open Support Ticket
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-teal-700 uppercase ml-1">Subject</label>
                <Input 
                  placeholder="Summary of the issue..." 
                  value={form.subject} 
                  onChange={(e) => setForm({ ...form, subject: e.target.value })} 
                  className="bg-white border-teal-100"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-teal-700 uppercase ml-1">Transfer Reference (Optional)</label>
                <Input 
                  placeholder="e.g. TX-12345678" 
                  value={form.transferId} 
                  onChange={(e) => setForm({ ...form, transferId: e.target.value })} 
                  className="bg-white border-teal-100"
                />
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-teal-700 uppercase ml-1">Description</label>
              <textarea
                className="w-full border border-teal-100 bg-white rounded-xl p-3 text-sm min-h-[100px] focus:ring-2 focus:ring-teal-500/20 focus:outline-none transition-all"
                placeholder="Provide detailed context for the investigation..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-2">
              <div className="flex gap-4 w-full md:w-auto">
                <div className="flex-1 md:w-48">
                  <label className="text-[10px] font-bold text-teal-700 uppercase ml-1">Issue Type</label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger className="bg-white border-teal-100 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="REFUND_REQUEST">Refund request</SelectItem>
                      <SelectItem value="DISPUTE">Dispute</SelectItem>
                      <SelectItem value="PAYOUT_ISSUE">Payout issue</SelectItem>
                      <SelectItem value="FRAUD_REVIEW">Fraud review</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 md:w-40">
                  <label className="text-[10px] font-bold text-teal-700 uppercase ml-1">Priority</label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="bg-white border-teal-100 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="URGENT">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={createCase} className="w-full md:w-auto bg-teal-600 hover:bg-teal-700 font-bold px-8 shadow-md">
                Create Case
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FILTER BAR */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Search by ticket # or subject..." 
            className="pl-10 bg-white border-slate-200 shadow-sm rounded-xl focus-visible:ring-teal-600"
          />
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          {["all", "OPEN", "IN_PROGRESS", "RESOLVED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === s 
                ? 'bg-slate-900 text-white' 
                : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              {s.replace("_", " ").toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* CASES TABLE */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <p className="text-sm font-medium text-slate-500">Syncing support queue...</p>
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-24">
            <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <CheckCircle2 className="h-8 w-8 text-slate-200" />
            </div>
            <h3 className="font-bold text-slate-900">All clear!</h3>
            <p className="text-sm text-slate-500">No support cases found for this filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow>
                  <TableHead className="w-[120px] text-[10px] font-bold uppercase tracking-wider pl-6">Ticket #</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Subject & Priority</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Category</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Transfer Ref</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right pr-6">Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cases.map((c) => (
                  <TableRow key={c.id} className="group hover:bg-slate-50/50 transition-colors">
                    <TableCell className="pl-6 py-4">
                      <span className="font-mono text-xs font-black text-slate-400">#{c.ticketNumber}</span>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-bold text-slate-900 text-sm">{c.subject}</p>
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            c.priority === 'URGENT' ? 'bg-rose-500 animate-pulse' : 
                            c.priority === 'HIGH' ? 'bg-orange-500' : 'bg-slate-300'
                          }`} />
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                            {c.priority} Priority
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0 h-5 border rounded-md ${getTypeBadge(c.type)}`}>
                        {c.type.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] font-bold px-2 py-0 h-5 border rounded-md ${getStatusBadge(c.status)}`}>
                        {c.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.transfer ? (
                        <div className="flex items-center gap-1.5 text-xs font-mono font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded w-fit">
                          {c.transfer.reference}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex items-center justify-end gap-4">
                        <div className="flex items-center gap-1 text-slate-400" title="Internal Notes">
                          <MessageSquare className="h-3.5 w-3.5" />
                          <span className="text-xs font-bold">{c._count?.notes || 0}</span>
                        </div>
                        <a 
                          href={`/admin/money-app-admin/cases/${c.id}`} 
                          className="h-8 w-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-teal-600 hover:border-teal-200 hover:bg-teal-50 transition-all shadow-sm"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
      
      {/* FOOTER HINT */}
      <div className="flex items-center justify-center gap-2 text-slate-400">
        <AlertCircle className="h-3.5 w-3.5" />
        <p className="text-[11px] font-medium">All case actions are recorded in the system audit trail for compliance.</p>
      </div>
    </div>
  )
}