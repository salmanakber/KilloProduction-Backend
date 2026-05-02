"use client"

import { useEffect, useState } from "react"
import { 
  Filter, Search, RefreshCcw, Loader2, ShoppingCart, 
  Package, User, Store, Bike, XCircle, CheckCircle, 
  RefreshCw, ChevronLeft, ChevronRight, Activity 
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

type AdminOrder = {
  entityType: "MARKETPLACE" | "SUPPLIER"
  id: string
  orderNumber: string
  module: string
  status: string
  paymentStatus: string
  subtotal: number
  deliveryFee: number
  serviceFee: number
  tax: number
  discount: number
  total: number
  createdAt: string
  customerName: string
  vendorName: string
  riderName: string
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [type, setType] = useState("ALL")
  const [module, setModule] = useState("ALL")
  const [status, setStatus] = useState("ALL")
  const [paymentStatus, setPaymentStatus] = useState("ALL")
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 20

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        search,
        type,
        module,
        status,
        paymentStatus,
      })
      const res = await fetch(`/api/admin/orders?${params.toString()}`, { cache: "no-store" })
      const data = await res.json()
      setOrders(data.orders || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [search, type, module, status, paymentStatus])

  useEffect(() => {
    setPage(1)
  }, [search, type, module, status, paymentStatus])

  const runAction = async (row: AdminOrder, action: "CANCEL" | "DELIVER" | "REFUND") => {
    const ok = window.confirm(`Are you sure to ${action.toLowerCase()} this order?`)
    if (!ok) return
    const res = await fetch("/api/admin/orders/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, entityType: row.entityType, action }),
    })
    if (res.ok) fetchOrders()
    else alert("Action failed")
  }

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const pagedOrders = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // --- UI Helpers ---
  const getStatusBadge = (s: string) => {
    switch (s) {
      case "PENDING": return "bg-amber-50 text-amber-700 border-amber-200"
      case "CONFIRMED": return "bg-blue-50 text-blue-700 border-blue-200"
      case "DELIVERED": return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "CANCELLED": return "bg-rose-50 text-rose-700 border-rose-200"
      case "REFUNDED": return "bg-slate-100 text-slate-700 border-slate-200"
      default: return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  const getPaymentBadge = (ps: string) => {
    switch (ps) {
      case "PAID": return "bg-emerald-50 text-emerald-700 border-emerald-200"
      case "PENDING": return "bg-amber-50 text-amber-700 border-amber-200"
      case "FAILED": return "bg-rose-50 text-rose-700 border-rose-200"
      case "REFUNDED": return "bg-slate-100 text-slate-700 border-slate-200"
      default: return "bg-slate-50 text-slate-700 border-slate-200"
    }
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      
      {/* PREMIUM HEADER */}
      <div className="bg-gradient-to-br from-[#0f766e] to-[#1A2433] p-8 rounded-3xl shadow-lg relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between border border-[#0f766e]/20">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5 blur-3xl"></div>
        <div className="absolute left-10 bottom-0 h-32 w-32 rounded-full bg-teal-400/10 blur-3xl"></div>
        
        <div className="relative z-10 flex items-center gap-5">
          <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner">
            <ShoppingCart className="h-8 w-8 text-teal-300" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Order Management</h1>
            <p className="text-teal-100/80 mt-1.5 font-medium max-w-md">Marketplace & supplier orders with operational actions.</p>
          </div>
        </div>

        <div className="relative z-10 mt-6 md:mt-0 flex gap-3">
          <button 
            onClick={fetchOrders}
            className="flex items-center justify-center px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm rounded-xl font-bold transition-all h-11"
          >
            <RefreshCcw className="h-4 w-4 mr-2" /> 
            Refresh Data
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5 text-teal-600" />
          <h3 className="text-lg font-bold text-slate-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="lg:col-span-2 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              className="w-full h-11 border border-slate-200 bg-slate-50 focus:bg-white rounded-xl pl-10 pr-4 text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none transition-all" 
              placeholder="Search ID, Order No, or Name..." 
            />
          </div>
          <select value={type} onChange={(e) => setType(e.target.value)} className="h-11 border border-slate-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white">
            <option value="ALL">All Types</option>
            <option value="MARKETPLACE">Marketplace</option>
            <option value="SUPPLIER">Supplier</option>
          </select>
          <select value={module} onChange={(e) => setModule(e.target.value)} className="h-11 border border-slate-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white">
            <option value="ALL">All Modules</option>
            <option value="FOOD">Food</option>
            <option value="GROCERY">Grocery</option>
            <option value="PHARMACY">Pharmacy</option>
            <option value="AUTO_PARTS">Auto Parts</option>
            <option value="RIDING">Riding</option>
            <option value="WHOLESALER">Wholesaler</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 border border-slate-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white">
            <option value="ALL">All Order Status</option>
            <option value="PENDING">Pending</option>
            <option value="CONFIRMED">Confirmed</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="h-11 border border-slate-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer bg-white">
            <option value="ALL">All Payments</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
            <option value="FAILED">Failed</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Order Ledger</h3>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              {orders.length} order{orders.length !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider text-xs">Order Details</th>
                <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider text-xs">Entities</th>
                <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider text-xs">Status Overview</th>
                <th className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-wider text-xs">Financials</th>
                <th className="px-6 py-4 text-left font-bold text-slate-500 uppercase tracking-wider text-xs">Created At</th>
                <th className="px-6 py-4 text-right font-bold text-slate-500 uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-teal-600 mb-4" />
                      <p className="text-sm font-bold text-slate-700">Syncing orders...</p>
                    </div>
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center opacity-80">
                      <div className="h-12 w-12 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center mb-4">
                        <Search className="h-6 w-6 text-slate-400" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900">No orders found</h3>
                      <p className="text-sm text-slate-500 mt-1 font-medium">Try adjusting your filters or search query.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedOrders.map((row) => (
                  <tr key={`${row.entityType}-${row.id}`} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900 text-base">{row.orderNumber}</p>
                      <p className="text-xs text-slate-500 font-medium mt-0.5 mb-2">#{row.id.substring(0,8)}...</p>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${row.entityType === 'MARKETPLACE' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                        {row.entityType === 'MARKETPLACE' ? <ShoppingCart className="h-3 w-3 mr-1" /> : <Package className="h-3 w-3 mr-1" />}
                        {row.entityType}
                      </span>
                    </td>
                    <td className="px-6 py-4 space-y-1.5">
                      <div className="flex items-center text-sm">
                        <User className="h-3.5 w-3.5 text-slate-400 mr-2 shrink-0" />
                        <span className="font-bold text-slate-800">{row.customerName || "N/A"}</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <Store className="h-3.5 w-3.5 text-slate-400 mr-2 shrink-0" />
                        <span className="font-medium text-slate-600">{row.vendorName || "N/A"}</span>
                      </div>
                      <div className="flex items-center text-sm">
                        <Bike className="h-3.5 w-3.5 text-slate-400 mr-2 shrink-0" />
                        <span className="font-medium text-slate-600">{row.riderName || "Unassigned"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 space-y-2">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Order:</span>
                        <Badge variant="outline" className={`font-bold border px-2 py-0.5 ${getStatusBadge(row.status)}`}>{row.status}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Pay:</span>
                        <Badge variant="outline" className={`font-bold border px-2 py-0.5 ${getPaymentBadge(row.paymentStatus)}`}>{row.paymentStatus}</Badge>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-xs font-semibold text-slate-500 uppercase">Mod:</span>
                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">{row.module}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900 text-lg">${row.total.toFixed(2)}</p>
                      <div className="text-xs font-medium text-slate-500 mt-1 flex flex-col items-end gap-0.5">
                        <span>Sub: <span className="text-slate-700">${row.subtotal.toFixed(2)}</span></span>
                        {row.discount > 0 && <span className="text-emerald-600">Disc: -${row.discount.toFixed(2)}</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">
                      {new Date(row.createdAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-col gap-2 items-end">
                        {row.status !== "CANCELLED" && row.status !== "DELIVERED" && (
                          <button 
                            onClick={() => runAction(row, "DELIVER")} 
                            className="w-[85px] flex justify-center items-center px-3 py-1.5 text-xs font-bold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 transition-colors"
                          >
                            <CheckCircle className="h-3.5 w-3.5 mr-1" /> Deliver
                          </button>
                        )}
                        {row.status !== "CANCELLED" && row.status !== "DELIVERED" && (
                          <button 
                            onClick={() => runAction(row, "CANCEL")} 
                            className="w-[85px] flex justify-center items-center px-3 py-1.5 text-xs font-bold rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors"
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel
                          </button>
                        )}
                        {row.paymentStatus === "PAID" && (
                          <button 
                            onClick={() => runAction(row, "REFUND")} 
                            className="w-[85px] flex justify-center items-center px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300 transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        {!loading && orders.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-500">
              Showing <span className="font-bold text-slate-900">{(page - 1) * PAGE_SIZE + 1}</span> to <span className="font-bold text-slate-900">{Math.min(page * PAGE_SIZE, orders.length)}</span> of <span className="font-bold text-slate-900">{orders.length}</span> entries
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center px-3 py-1.5 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Prev
              </button>
              <span className="flex items-center px-4 py-1.5 text-sm font-bold rounded-xl border border-teal-200 bg-teal-50 text-teal-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center px-3 py-1.5 text-sm font-medium rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition-colors"
              >
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}