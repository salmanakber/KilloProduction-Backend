"use client"

import { useEffect, useState } from "react"
import { 
  Shield, 
  Loader2, 
  Fingerprint, 
  Clock, 
  Search, 
  History, 
  Filter, 
  ChevronLeft, 
  ChevronRight 
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"

type LogRow = {
  id: string
  action: string
  entityType: string
  entityId: string
  details: Record<string, unknown> | null
  createdAt: string
  performer: { name: string | null; email: string | null; role: string }
}

export default function MoneyTransferAuditPage() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [loading, setLoading] = useState(true)
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const limit = 15 // Items per page

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Assuming your API supports page and limit query params
        const res = await fetch(`/api/admin/money-app-admin/audit-logs?page=${currentPage}&limit=${limit}`)
        const json = await res.json()
        if (json.success) {
          setLogs(json.logs)
          setTotalCount(json.totalCount || 0) // Ensure your API returns the total count
        }
      } catch (error) {
        console.error("Failed to fetch logs", error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentPage]) // Re-run effect when currentPage changes

  const totalPages = Math.ceil(totalCount / limit)

  const getActionColor = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('REFUND') || act.includes('CANCEL') || act.includes('FAIL')) 
      return "bg-rose-50 text-rose-700 border-rose-100"
    if (act.includes('CREDIT') || act.includes('COMPLETE') || act.includes('APPROVE')) 
      return "bg-teal-50 text-teal-700 border-teal-100"
    if (act.includes('UPDATE') || act.includes('PATCH')) 
      return "bg-blue-50 text-blue-700 border-blue-100"
    return "bg-slate-50 text-slate-600 border-slate-100"
  }

  const getInitials = (name?: string | null, email?: string | null) => {
    const base = name || email || "??";
    return base.split(/[@\s]/)[0].substring(0, 2).toUpperCase();
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      
      {/* HEADER AREA */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex gap-4 items-center">
          <div className="h-14 w-14 bg-teal-50 rounded-2xl flex items-center justify-center border border-teal-100">
            <Shield className="h-8 w-8 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Security Audit Log</h1>
            <p className="text-sm text-slate-500 font-medium max-w-md">
              Immutable trail of sensitive money-app actions. Authorized administrative access only.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-lg shadow-slate-200">
          <Fingerprint className="h-4 w-4 text-teal-400" />
          <span className="text-xs font-bold uppercase tracking-wider">Live Monitoring Active</span>
        </div>
      </div>

      {/* SEARCH / FILTER MOCKUP */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Filter by Admin or Action..." 
            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/20 transition-all"
          />
        </div>
        <Button variant="outline" className="rounded-xl border-slate-200 text-slate-600">
          <Filter className="h-4 w-4 mr-2" /> 
          Advanced Search
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-4">
              <Loader2 className="animate-spin text-teal-600 h-10 w-10" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Syncing Audit Trail...</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/80">
                <TableRow className="hover:bg-transparent border-b border-slate-200">
                  <TableHead className="w-[200px] py-4 pl-6 text-[10px] font-black uppercase tracking-widest text-slate-500">
                    <div className="flex items-center gap-2"><Clock className="h-3 w-3" /> Timestamp</div>
                  </TableHead>
                  <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Action Performed</TableHead>
                  <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Affected Entity</TableHead>
                  <TableHead className="py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 pr-6 text-right">Performed By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-64 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-300">
                        <History className="h-12 w-12 mb-2 opacity-20" />
                        <p className="font-bold">No log entries found for this period</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id} className="group hover:bg-slate-50/50 transition-colors border-b border-slate-100 last:border-0">
                      <TableCell className="pl-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-900">
                            {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {new Date(log.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </TableCell>
                      
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={`font-mono text-[10px] px-2 py-0.5 rounded-md border shadow-sm ${getActionColor(log.action)}`}
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-1 w-1 rounded-full bg-slate-300" />
                          <div className="flex flex-col">
                            <span className="text-[10px] font-black text-teal-700 uppercase tracking-tighter">{log.entityType}</span>
                            <span className="font-mono text-[11px] text-slate-500 tracking-tighter">
                              {log.entityId.slice(0, 16)}
                              {log.entityId.length > 16 && "..."}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      
                      <TableCell className="pr-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="flex flex-col items-end">
                            <p className="text-xs font-bold text-slate-900 leading-tight">
                              {log.performer.name || log.performer.email?.split('@')[0]}
                            </p>
                            <Badge variant="outline" className="text-[9px] h-4 font-black p-0 text-slate-400 tracking-widest uppercase">
                              {log.performer.role}
                            </Badge>
                          </div>
                          <div className="h-9 w-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 group-hover:bg-teal-600 group-hover:text-white group-hover:border-teal-600 transition-all">
                            {getInitials(log.performer.name, log.performer.email)}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>
        
        {/* PAGINATION CONTROLS */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Shield className="h-3 w-3" /> 
            Page {currentPage} of {totalPages || 1} 
            <span className="mx-2 text-slate-200">|</span>
            {totalCount} Total Records
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1 || loading}
              className="h-8 w-8 p-0 rounded-lg border-slate-200 bg-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            {/* Simple page indicators for small ranges, or just show current */}
            <div className="flex items-center gap-1">
               {[...Array(Math.min(5, totalPages))].map((_, i) => {
                 // Logic to show a window of pages around current
                 let pageNum = i + 1;
                 if (totalPages > 5 && currentPage > 3) pageNum = currentPage - 3 + i;
                 if (pageNum > totalPages) return null;

                 return (
                   <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`h-8 w-8 p-0 rounded-lg text-[11px] font-bold ${
                      currentPage === pageNum 
                      ? "bg-slate-900 text-white hover:bg-slate-800" 
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                   >
                     {pageNum}
                   </Button>
                 )
               })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0 || loading}
              className="h-8 w-8 p-0 rounded-lg border-slate-200 bg-white"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
      
      <div className="flex justify-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] opacity-50">
        End of Audit Trail
      </div>
    </div>
  )
}