"use client"

import { useState, useEffect } from "react"
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Copy,
  Check,
  X,
  Calendar,
  DollarSign,
  Percent,
  Tag,
  Filter,
  Download,
  RefreshCw,
  Ticket,
  Trophy,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  CheckCircle,
  Clock
} from "lucide-react"
import { Currency } from "@prisma/client"
import { cn } from "@/lib/utils"

interface PromoCode {
  id: string; code: string; title: string; description?: string | null; type: "PERCENTAGE" | "FIXED";
  value: number; minOrderAmount?: number | null; maxDiscount?: number | null;
  usageLimit?: number | null; usedCount: number; modules?: any; isActive: boolean;
  startsAt: string; expiresAt: string; createdAt: string;
}

interface LoyaltyUsageSummary {
  totalRedemptions: number; totalPointsRedeemed: number; totalDiscountAmount: number;
  moduleBreakdown: Array<{ module: string; redemptions: number; pointsRedeemed: number; discountAmount: number; }>;
}

export default function PromoCodeManagement() {
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterActive, setFilterActive] = useState<boolean | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [editingCode, setEditingCode] = useState<PromoCode | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [currency, setCurrency] = useState<string>("")
  const [loyaltyUsage, setLoyaltyUsage] = useState<LoyaltyUsageSummary | null>(null)

  const [formData, setFormData] = useState({
    code: "", title: "", description: "", type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    value: 0, minOrderAmount: "", maxDiscount: "", usageLimit: "", modules: [] as string[],
    isActive: true, startsAt: "", expiresAt: "",
  })

  useEffect(() => { fetchPromoCodes() }, [filterActive])

  const fetchPromoCodes = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/admin/promo-codes")
      if (response.ok) {
        const data = await response.json()
        setPromoCodes(data.promoCodes || [])
      }
    } catch (error) { console.error(error) } finally { setLoading(false) }
  }

  const fetchLoyaltyUsage = async () => {
    try {
      const response = await fetch("/api/admin/promo-codes/loyalty-usage")
      if (response.ok) setLoyaltyUsage(await response.json())
    } catch (error) { console.error(error) }
  }

  const getCurrency = async () => {
    const response = await fetch("/api/currencies")
    if(response.ok) {
      const data = await response.json()
      setCurrency(data.defaultCurrency.symbol)
    }
  }

  useEffect(() => { getCurrency(); fetchLoyaltyUsage(); }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const url = editingCode ? `/api/admin/promo-codes/${editingCode.id}` : "/api/admin/promo-codes"
      const method = editingCode ? "PUT" : "POST"
      const payload = {
        ...formData,
        minOrderAmount: formData.minOrderAmount ? parseFloat(formData.minOrderAmount) : null,
        maxDiscount: formData.maxDiscount ? parseFloat(formData.maxDiscount) : null,
        usageLimit: formData.usageLimit ? parseInt(formData.usageLimit) : null,
      }
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      if (response.ok) { setShowModal(false); resetForm(); fetchPromoCodes(); }
    } catch (error) { console.error(error) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure?")) return
    try {
      const response = await fetch(`/api/admin/promo-codes/${id}`, { method: "DELETE" })
      if (response.ok) fetchPromoCodes()
    } catch (error) { console.error(error) }
  }

  const handleEdit = (code: PromoCode) => {
    setEditingCode(code)
    setFormData({
      code: code.code, title: code.title, description: code.description || "", type: code.type,
      value: code.value, minOrderAmount: code.minOrderAmount?.toString() || "",
      maxDiscount: code.maxDiscount?.toString() || "", usageLimit: code.usageLimit?.toString() || "",
      modules: Array.isArray(code.modules) ? code.modules : [], isActive: code.isActive,
      startsAt: new Date(code.startsAt).toISOString().slice(0, 16),
      expiresAt: new Date(code.expiresAt).toISOString().slice(0, 16),
    })
    setShowModal(true)
  }

  const resetForm = () => {
    setFormData({ code: "", title: "", description: "", type: "PERCENTAGE", value: 0, minOrderAmount: "", maxDiscount: "", usageLimit: "", modules: [], isActive: true, startsAt: "", expiresAt: "", })
    setEditingCode(null)
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) { console.error(err); }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/admin/promo-codes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !currentStatus }) })
      if (response.ok) fetchPromoCodes()
    } catch (error) { console.error(error) }
  }

  const filteredCodes = promoCodes.filter((code) => {
    const matchesSearch = code.code.toLowerCase().includes(searchQuery.toLowerCase()) || code.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFilter = filterActive === null || code.isActive === filterActive
    return matchesSearch && matchesFilter
  })

  const stats = {
    total: promoCodes.length,
    active: promoCodes.filter((c) => c.isActive).length,
    expired: promoCodes.filter((c) => new Date(c.expiresAt) < new Date()).length,
    totalUsage: promoCodes.reduce((sum, c) => sum + c.usedCount, 0),
  }

  const gradientBtnClass = "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-sm transition-all duration-200"

  if (loading && promoCodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 space-y-8 pt-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Campaigns & Promo Codes</h1>
            <p className="text-sm text-slate-500 mt-1">Manage platform-wide discounts and voucher codes</p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchPromoCodes} className="p-2 bg-white border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 shadow-sm transition-colors">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <button onClick={() => { resetForm(); setShowModal(true); }} className={cn(gradientBtnClass, "px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2")}>
              <Plus className="h-4 w-4" /> Create Campaign
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Codes", val: stats.total, icon: Tag, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Active Now", val: stats.active, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Expired", val: stats.expired, icon: Clock, color: "text-rose-600", bg: "bg-rose-50" },
            { label: "Redemptions", val: stats.totalUsage, icon: Ticket, color: "text-purple-600", bg: "bg-purple-50" },
          ].map((s, idx) => (
            <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{s.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{s.val}</p>
                </div>
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", s.bg)}>
                  <s.icon className={cn("h-5 w-5", s.color)} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Loyalty Reporting - Minimal Version */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-500" />
                <h3 className="text-sm font-bold text-slate-900">Loyalty Points Redemptions</h3>
             </div>
             <button onClick={fetchLoyaltyUsage} className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Refresh Report</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 bg-slate-50/30">
             <div className="p-6">
                <p className="text-xs text-slate-500 font-medium uppercase mb-1">Redemptions</p>
                <p className="text-xl font-bold text-slate-900">{loyaltyUsage?.totalRedemptions ?? 0}</p>
             </div>
             <div className="p-6">
                <p className="text-xs text-slate-500 font-medium uppercase mb-1">Points Used</p>
                <p className="text-xl font-bold text-slate-900">{(loyaltyUsage?.totalPointsRedeemed ?? 0).toLocaleString()}</p>
             </div>
             <div className="p-6">
                <p className="text-xs text-slate-500 font-medium uppercase mb-1">Impact Value</p>
                <p className="text-xl font-bold text-emerald-600">{currency}{Number(loyaltyUsage?.totalDiscountAmount ?? 0).toLocaleString()}</p>
             </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input 
              placeholder="Search by code or title..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
             {[
               { label: 'All', val: null },
               { label: 'Active', val: true },
               { label: 'Inactive', val: false }
             ].map((btn) => (
               <button
                 key={String(btn.label)}
                 onClick={() => setFilterActive(btn.val)}
                 className={cn(
                   "px-4 py-1.5 rounded-md text-xs font-semibold transition-all",
                   filterActive === btn.val ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                 )}
               >
                 {btn.label}
               </button>
             ))}
          </div>
        </div>

        {/* Table Area */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Campaign Details</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Discount</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Usage</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCodes.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-400">No campaigns found</td></tr>
                ) : (
                  filteredCodes.map((code) => {
                    const isExpired = new Date(code.expiresAt) < new Date()
                    return (
                      <tr key={code.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-slate-900 font-mono">{code.code}</span>
                            <button onClick={() => copyToClipboard(code.code, code.id)} className="text-slate-300 hover:text-emerald-600">
                              {copiedId === code.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <div className="text-xs font-medium text-slate-600">{code.title}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold border mb-1 block w-fit",
                            code.type === 'PERCENTAGE' ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-purple-50 text-purple-700 border-purple-100"
                          )}>
                            {code.type === "PERCENTAGE" ? <Percent className="h-2.5 w-2.5 inline mr-1" /> : <DollarSign className="h-2.5 w-2.5 inline mr-1" />}
                            {code.type}
                          </span>
                          <div className="text-sm font-bold text-slate-900">
                            {code.type === "PERCENTAGE" ? `${code.value}%` : `${currency}${code.value}`}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs font-semibold text-slate-900">{code.usedCount} <span className="text-slate-400">/ {code.usageLimit || "∞"}</span></div>
                          <div className="w-20 h-1 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                             <div className="h-full bg-slate-400" style={{ width: code.usageLimit ? `${Math.min(100, (code.usedCount / code.usageLimit) * 100)}%` : '0%' }} />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                           <button onClick={() => toggleActive(code.id, code.isActive)} className={cn(
                             "px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors",
                             code.isActive && !isExpired ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-500 border-slate-200"
                           )}>
                             {code.isActive && !isExpired ? "Active" : isExpired ? "Expired" : "Disabled"}
                           </button>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleEdit(code)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-all"><Edit className="h-4 w-4" /></button>
                            <button onClick={() => handleDelete(code.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all"><Trash2 className="h-4 w-4" /></button>
                            <button className="p-1.5 text-slate-300"><MoreHorizontal className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Campaign Modal - Refactored Minimal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
               <h2 className="text-lg font-bold text-slate-900">{editingCode ? "Edit Campaign" : "New Promo Code"}</h2>
               <button onClick={() => { setShowModal(false); resetForm(); }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Code *</label>
                  <input required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/20 outline-none uppercase font-mono" placeholder="SUMMER24" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Type *</label>
                  <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as any })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Fixed Amount ({currency})</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">Title *</label>
                <input required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Flash Sale Promotion" />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Value *</label>
                  <input type="number" required value={formData.value} onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Min Order</label>
                  <input type="number" value={formData.minOrderAmount} onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Max Disc.</label>
                  <input type="number" value={formData.maxDiscount} onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Starts</label>
                  <input type="datetime-local" value={formData.startsAt} onChange={(e) => setFormData({ ...formData, startsAt: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Expires</label>
                  <input type="datetime-local" value={formData.expiresAt} onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                 <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData({...formData, isActive: e.target.checked})} className="rounded text-emerald-600" />
                 <label className="text-xs font-semibold text-slate-700">Set as Active</label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                <button type="submit" className={cn(gradientBtnClass, "px-6 py-2 rounded-lg text-sm font-bold")}>Save Campaign</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}