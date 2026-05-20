"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { 
  ArrowLeft, 
  Loader2, 
  MessageSquare, 
  Clock, 
  User, 
  ExternalLink, 
  History,
  ShieldCheck,
  Send,
  AlertCircle
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

export default function MoneyCaseDetailPage() {
  const { id } = useParams() as { id: string }
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [item, setItem] = useState<any>(null)
  const [note, setNote] = useState("")
  const [status, setStatus] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/cases/${id}`)
      const json = await res.json()
      if (json.success) {
        setItem(json.case)
        setStatus(json.case.status)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) load()
  }, [id])

  const saveStatus = async () => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (json.success) {
        toast({ title: "Status Updated", description: `Case is now ${status}` })
        load()
      } else throw new Error(json.error)
    } catch (e: any) {
      toast({ title: "Update Failed", description: e.message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const addNote = async () => {
    if (!note.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/admin/money-app-admin/cases/${id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: note }),
      })
      const json = await res.json()
      if (json.success) {
        setNote("")
        load()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const getStatusColor = (s: string) => {
    const map: Record<string, string> = {
      OPEN: "bg-blue-50 text-blue-700 border-blue-200",
      IN_PROGRESS: "bg-amber-50 text-amber-700 border-amber-200",
      RESOLVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
      CLOSED: "bg-slate-100 text-slate-500 border-slate-200",
    }
    return map[s] || "bg-slate-50 text-slate-600"
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
        <p className="text-slate-500 font-medium">Loading case file...</p>
      </div>
    )
  }

  if (!item) return <div className="p-12 text-center text-slate-500">Case not found</div>

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20 animate-in fade-in duration-500">
      
      {/* HEADER NAV */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => router.back()} className="hover:bg-slate-100 text-slate-600">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Cases
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Case ID:</span>
          <span className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
            #{item.ticketNumber}
          </span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: MAIN CONTENT */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* DESCRIPTION CARD */}
          <Card className="border-none shadow-sm overflow-hidden">
            <div className={`h-1.5 w-full ${getStatusColor(item.status).split(' ')[0]}`} />
            <CardContent className="p-8">
              <div className="flex justify-between items-start gap-4 mb-6">
                <div className="space-y-1">
                  <Badge variant="outline" className={`font-bold mb-2 ${getStatusColor(item.status)}`}>
                    {item.status}
                  </Badge>
                  <h1 className="text-2xl font-black text-slate-900 leading-tight">
                    {item.subject}
                  </h1>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-black text-slate-400 uppercase">Created</p>
                  <p className="text-xs font-bold text-slate-600">{new Date(item.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
              
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 italic text-slate-700 leading-relaxed">
                "{item.description}"
              </div>
            </CardContent>
          </Card>

          {/* INTERNAL NOTES / ACTIVITY */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 ml-1">
              <MessageSquare className="h-4 w-4 text-teal-600" /> Internal Investigation Log
            </h3>
            
            <div className="space-y-4">
              {(item.notes ?? []).length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <p className="text-xs font-medium text-slate-400 italic">No notes have been added to this case yet.</p>
                </div>
              ) : (
                item.notes.map((n: any) => (
                  <Card key={n.id} className="border-slate-100 shadow-none bg-white">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-teal-50 flex items-center justify-center">
                            <User className="h-3 w-3 text-teal-600" />
                          </div>
                          <span className="text-xs font-bold text-slate-700">{n.author?.email || 'System'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px] font-medium">{new Date(n.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 pl-8 leading-relaxed">
                        {n.message}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* ADD NOTE INPUT */}
            <Card className="border-teal-100 bg-teal-50/20 shadow-none">
              <CardContent className="p-4">
                <div className="flex gap-3">
                  <Input 
                    value={note} 
                    onChange={(e) => setNote(e.target.value)} 
                    placeholder="Add an internal observation..." 
                    className="bg-white border-teal-100 focus-visible:ring-teal-600"
                    onKeyDown={(e) => e.key === 'Enter' && addNote()}
                  />
                  <Button 
                    onClick={addNote} 
                    disabled={isSubmitting || !note.trim()} 
                    className="bg-teal-600 hover:bg-teal-700 shrink-0 shadow-md shadow-teal-100"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-[10px] text-teal-600/60 mt-2 ml-1 font-medium">
                  Note: This message is only visible to administrators.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIONS & METADATA */}
        <div className="space-y-6">
          
          {/* STATUS CONTROL */}
          <Card className="border-slate-200 shadow-sm overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
              <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" /> Case Management
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Update Status</label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                    <SelectItem value="RESOLVED">Resolved</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={saveStatus} 
                disabled={isSubmitting || status === item.status} 
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold transition-all"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Commit Status Change"}
              </Button>
            </CardContent>
          </Card>

          {/* LINKED TRANSFER SNAPSHOT */}
          {item.transfer && (
            <Card className="border-slate-200 shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4">
                <CardTitle className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-400" /> Linked Transfer
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-xs font-bold text-slate-900">{item.transfer.reference}</span>
                    <Badge className="text-[9px] uppercase font-black">{item.transfer.status}</Badge>
                  </div>
                  <Separator className="bg-slate-100" />
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Amount</p>
                      <p className="text-lg font-black text-slate-900">
                        {item.transfer.amount} <span className="text-xs font-normal text-slate-500">{item.transfer.currency}</span>
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-teal-700 hover:bg-teal-50 hover:text-teal-800 h-8 font-bold text-xs"
                      onClick={() => router.push(`/admin/money-app-admin/transactions/${item.transfer.id}`)}
                    >
                      View Full <ExternalLink className="h-3 w-3 ml-1.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* HELP HINT */}
          <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 font-medium leading-relaxed">
              When a case is marked as <span className="font-bold underline">RESOLVED</span>, ensure you have attached a note summarizing the outcome for the audit trail.
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}