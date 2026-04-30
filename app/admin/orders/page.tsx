"use client"

import { useEffect, useState } from "react"
import { Filter, Search, RefreshCcw } from "lucide-react"

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Order Management</h1>
          <p className="text-sm text-slate-500">Marketplace + supplier orders with operational actions</p>
        </div>
        <button onClick={fetchOrders} className="h-10 px-4 rounded-lg border border-slate-300 text-sm font-semibold flex items-center gap-2">
          <RefreshCcw size={15} /> Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full h-11 border border-slate-300 rounded-lg pl-9 pr-3 text-sm" placeholder="Order id / number / name" />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className="h-11 border border-slate-300 rounded-lg px-3 text-sm">
          <option value="ALL">All Types</option>
          <option value="MARKETPLACE">Marketplace</option>
          <option value="SUPPLIER">Supplier</option>
        </select>
        <select value={module} onChange={(e) => setModule(e.target.value)} className="h-11 border border-slate-300 rounded-lg px-3 text-sm">
          <option value="ALL">All Modules</option>
          <option value="FOOD">Food</option>
          <option value="GROCERY">Grocery</option>
          <option value="PHARMACY">Pharmacy</option>
          <option value="AUTO_PARTS">Auto Parts</option>
          <option value="RIDING">Riding</option>
          <option value="WHOLESALER">Wholesaler</option>
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 border border-slate-300 rounded-lg px-3 text-sm">
          <option value="ALL">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="DELIVERED">Delivered</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="REFUNDED">Refunded</option>
        </select>
        <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)} className="h-11 border border-slate-300 rounded-lg px-3 text-sm">
          <option value="ALL">All Payments</option>
          <option value="PENDING">Pending</option>
          <option value="PAID">Paid</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </select>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Order</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Entities</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Financials</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Created</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Loading orders...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No orders found</td></tr>
            ) : (
              pagedOrders.map((row) => (
                <tr key={`${row.entityType}-${row.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{row.orderNumber}</p>
                    <p className="text-xs text-slate-500">{row.id}</p>
                    <p className="text-xs text-indigo-600 font-semibold">{row.entityType}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-700">C: {row.customerName}</p>
                    <p className="text-slate-700">V: {row.vendorName}</p>
                    <p className="text-slate-700">R: {row.riderName}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-800">{row.status}</p>
                    <p className="text-xs text-slate-500">{row.paymentStatus}</p>
                    <p className="text-xs text-slate-500">{row.module}</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-semibold text-slate-900">{row.total.toFixed(2)}</p>
                    <p className="text-xs text-slate-500">Sub: {row.subtotal.toFixed(2)} | Disc: {row.discount.toFixed(2)}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => runAction(row, "CANCEL")} className="px-2.5 py-1 text-xs rounded border border-rose-300 text-rose-700">Cancel</button>
                      <button onClick={() => runAction(row, "DELIVER")} className="px-2.5 py-1 text-xs rounded border border-emerald-300 text-emerald-700">Deliver</button>
                      <button onClick={() => runAction(row, "REFUND")} className="px-2.5 py-1 text-xs rounded border border-amber-300 text-amber-700">Refund</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Showing {(orders.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1)} - {Math.min(page * PAGE_SIZE, orders.length)} of {orders.length}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-xs rounded border border-slate-300 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="px-3 py-1.5 text-xs rounded border border-slate-200 bg-slate-50">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs rounded border border-slate-300 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}
