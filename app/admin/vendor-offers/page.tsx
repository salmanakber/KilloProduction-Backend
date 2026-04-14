"use client"

import { useEffect, useState } from "react"
import { 
  Sparkles, Zap, Store, Tag, Calendar, CheckCircle2, 
  XCircle, ShoppingBag, Utensils, AlertCircle, Image as ImageIcon,
  ChevronRight
} from "lucide-react"

type Offer = {
  id: string
  module: "FOOD" | "GROCERY"
  vendorName: string
  vendorLogo: string | null
  title: string
  description: string | null
  promoKind: string | null
  mysteryTeaser: string | null
  discountType: string
  discountValue: number
  itemName: string | null
  itemPrice: number | null
  images: any
  approvalStatus: string | null
  rejectionNote: string | null
  startsAt: string
  expiresAt: string
  createdAt: string
}

export default function VendorOffersPage() {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState("PENDING")
  const [moduleFilter, setModuleFilter] = useState("all")
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectionNote, setRejectionNote] = useState("")
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  const fetchOffers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/vendor-offers?status=${statusFilter}&module=${moduleFilter}&limit=50`)
      const data = await res.json()
      setOffers(data.offers || [])
    } catch { setOffers([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchOffers() }, [statusFilter, moduleFilter])

  const handleAction = async (offerId: string, module: string, action: "APPROVE" | "REJECT", note?: string) => {
    setActionLoading(offerId)
    try {
      await fetch("/api/admin/vendor-offers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, module, action, rejectionNote: note }),
      })
      setRejectingId(null)
      setRejectionNote("")
      fetchOffers()
    } catch {}
    finally { setActionLoading(null) }
  }

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto min-h-screen bg-[#FDFDFD]">
      
      {/* High-End Header */}
      <div className="mb-8">
        <h1 className="text-[28px] font-black text-slate-900 tracking-tight flex items-center gap-3">
          Vendor Offers
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Sparkles className="h-4 w-4" />
          </span>
        </h1>
        <p className="text-slate-500 font-medium mt-1">Review and approve MYSTERY / FLASH offers submitted by vendors.</p>
      </div>

      {/* Premium Segmented Controls (Filters) */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 justify-between items-start md:items-center bg-white p-2 rounded-[20px] border border-slate-200/60 shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)]">
        
        {/* Status Filter */}
        <div className="flex gap-1 bg-slate-50 p-1 rounded-[14px] w-full md:w-auto">
          {["PENDING", "APPROVED", "REJECTED"].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex-1 md:flex-none px-5 py-2.5 rounded-[10px] font-bold text-[13px] transition-all duration-300 ${
                statusFilter === s 
                  ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50" 
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
              }`}>
              {s}
            </button>
          ))}
        </div>

        {/* Module Filter */}
        <div className="flex gap-1.5 px-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {["all", "FOOD", "GROCERY"].map(m => (
            <button key={m} onClick={() => setModuleFilter(m)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-[12px] font-bold text-[12px] transition-all duration-300 whitespace-nowrap ${
                moduleFilter === m 
                  ? "bg-slate-900 text-white shadow-md shadow-slate-900/10" 
                  : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              }`}>
              {m === "all" && <Store className="h-3.5 w-3.5" />}
              {m === "FOOD" && <Utensils className="h-3.5 w-3.5" />}
              {m === "GROCERY" && <ShoppingBag className="h-3.5 w-3.5" />}
              {m === "all" ? "All Modules" : m}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-24 space-y-4">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-20"></span>
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600"></div>
          </div>
          <p className="text-slate-400 font-semibold animate-pulse">Loading offers...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && offers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center bg-white border border-slate-200/60 rounded-[24px] border-dashed">
          <div className="h-16 w-16 bg-slate-50 rounded-full flex items-center justify-center mb-4 ring-8 ring-slate-50/50">
            <Sparkles className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No {statusFilter.toLowerCase()} offers</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-sm">When vendors submit new promotional offers, they will appear here for your review.</p>
        </div>
      )}

      {/* Offers Grid/List */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {offers.map(offer => {
          const imgs = Array.isArray(offer.images) ? offer.images : []
          return (
            <div key={offer.id} className="group bg-white rounded-[24px] border border-slate-200/60 p-1.5 shadow-[0_2px_12px_-6px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.08)] hover:border-slate-300/60 transition-all duration-300 flex flex-col">
              
              <div className="p-5 md:p-6 flex-1">
                <div className="flex items-start gap-4 md:gap-5">
                  
                  {/* Vendor Logo */}
                  <div className="shrink-0 relative">
                    {offer.vendorLogo ? (
                      <img src={offer.vendorLogo} alt="" className="w-14 h-14 md:w-16 md:h-16 rounded-[16px] object-cover ring-1 ring-slate-200/80 shadow-sm" />
                    ) : (
                      <div className="w-14 h-14 md:w-16 md:h-16 rounded-[16px] bg-slate-100 flex items-center justify-center ring-1 ring-slate-200/80">
                        <Store className="h-6 w-6 text-slate-400" />
                      </div>
                    )}
                    {/* Tiny Module Indicator on Logo */}
                    <div className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border-2 border-white flex items-center justify-center shadow-sm"
                         style={{ backgroundColor: offer.module === "FOOD" ? "#f97316" : "#10b981" }}>
                      {offer.module === "FOOD" ? <Utensils className="h-3 w-3 text-white" /> : <ShoppingBag className="h-3 w-3 text-white" />}
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 pt-1">
                    {/* Header Row: Title & Badges */}
                    <div className="flex items-start justify-between gap-3 mb-1.5">
                      <h3 className="font-black text-lg md:text-[20px] text-slate-900 leading-tight truncate">
                        {offer.title}
                      </h3>
                      
                      {/* Promo Kind Badge - Beautiful visual design */}
                      <span className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        offer.promoKind === "MYSTERY" 
                          ? "bg-gradient-to-r from-violet-100 to-fuchsia-100 text-violet-700 ring-1 ring-violet-200 shadow-sm shadow-violet-100" 
                          : "bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 ring-1 ring-amber-200 shadow-sm shadow-amber-100"
                      }`}>
                        {offer.promoKind === "MYSTERY" ? <Sparkles className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
                        {offer.promoKind}
                      </span>
                    </div>

                    <p className="text-[13px] font-bold text-slate-500 mb-3">{offer.vendorName}</p>
                    
                    {offer.description && <p className="text-[14px] text-slate-600 font-medium leading-relaxed mb-4">{offer.description}</p>}
                    
                    {/* Mystery Teaser */}
                    {offer.mysteryTeaser && (
                      <div className="mb-4 bg-violet-50/80 border border-violet-100 rounded-[12px] p-3 flex gap-3 items-start">
                        <Sparkles className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-black uppercase text-violet-500 tracking-wider mb-0.5">Mystery Teaser</p>
                          <p className="text-[13px] text-violet-900 font-semibold">"{offer.mysteryTeaser}"</p>
                        </div>
                      </div>
                    )}

                    {/* Highly Visual Metadata Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-2 flex items-center gap-2">
                        <Tag className="h-4 w-4 text-emerald-500" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Discount</p>
                          <p className="text-[12px] font-bold text-slate-800 truncate">
                            {offer.discountType === "PERCENTAGE" ? `${offer.discountValue}% OFF` : `$${offer.discountValue}`}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-2 flex items-center gap-2">
                        <ShoppingBag className="h-4 w-4 text-blue-500" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Item</p>
                          <p className="text-[12px] font-bold text-slate-800 truncate" title={offer.itemName || "All Items"}>
                            {offer.itemName || "Storewide"}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-amber-500" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Starts</p>
                          <p className="text-[12px] font-bold text-slate-800 truncate">
                            {new Date(offer.startsAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-[10px] p-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-rose-500" />
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase text-slate-400">Expires</p>
                          <p className="text-[12px] font-bold text-slate-800 truncate">
                            {new Date(offer.expiresAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Offer Images Preview */}
                    {imgs.length > 0 && (
                      <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                        {imgs.slice(0, 4).map((url: string, i: number) => (
                          <div key={i} className="relative w-16 h-16 md:w-20 md:h-20 rounded-[12px] overflow-hidden group/img cursor-pointer ring-1 ring-slate-200">
                            <img src={url} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover/img:scale-110" />
                            <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />
                          </div>
                        ))}
                        {imgs.length > 4 && (
                          <div className="w-16 h-16 md:w-20 md:h-20 rounded-[12px] bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-500">
                            <ImageIcon className="h-5 w-5 mb-0.5 opacity-50" />
                            <span className="text-[11px] font-bold">+{imgs.length - 4}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Rejection Note Display */}
                    {offer.rejectionNote && (
                      <div className="mt-4 bg-rose-50 border border-rose-100 rounded-[12px] p-3 flex gap-3 items-start">
                        <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] font-bold uppercase text-rose-600 mb-0.5">Rejection Reason</p>
                          <p className="text-[13px] text-rose-900 font-medium">{offer.rejectionNote}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Bar for Pending State */}
              {statusFilter === "PENDING" && (
                <div className="p-2 md:p-3 bg-slate-50 rounded-b-[22px] border-t border-slate-200/60 mt-auto">
                  {rejectingId === offer.id ? (
                    <div className="flex flex-col sm:flex-row gap-2 bg-white p-2 rounded-[16px] shadow-sm border border-slate-200">
                      <input
                        type="text"
                        placeholder="Why are you rejecting this?"
                        value={rejectionNote}
                        onChange={e => setRejectionNote(e.target.value)}
                        className="flex-1 bg-transparent border-none focus:ring-0 px-3 py-2 text-[14px] font-medium placeholder:text-slate-400 outline-none"
                        autoFocus
                      />
                      <div className="flex gap-2 sm:shrink-0">
                        <button onClick={() => { setRejectingId(null); setRejectionNote("") }} 
                          className="px-4 py-2 text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-[10px] font-bold text-[13px] transition-colors">
                          Cancel
                        </button>
                        <button
                          disabled={actionLoading === offer.id}
                          onClick={() => handleAction(offer.id, offer.module, "REJECT", rejectionNote)}
                          className="px-5 py-2 bg-rose-600 text-white rounded-[10px] font-bold text-[13px] hover:bg-rose-700 disabled:opacity-50 transition-colors shadow-sm shadow-rose-600/20 flex items-center gap-2"
                        >
                          Confirm Reject
                          {actionLoading === offer.id && <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        disabled={actionLoading === offer.id}
                        onClick={() => handleAction(offer.id, offer.module, "APPROVE")}
                        className="flex-1 px-5 py-3.5 bg-slate-900 text-white rounded-[16px] font-bold text-[14px] hover:bg-slate-800 disabled:opacity-50 transition-all active:scale-[0.98] shadow-md shadow-slate-900/10 flex items-center justify-center gap-2 group/btn"
                      >
                        {actionLoading === offer.id ? (
                          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 group-hover/btn:scale-110 transition-transform" />
                            Approve Offer
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={() => setRejectingId(offer.id)}
                        className="flex-none px-6 py-3.5 bg-white border border-slate-200 text-rose-600 rounded-[16px] font-bold text-[14px] hover:bg-rose-50 hover:border-rose-200 transition-all active:scale-[0.98] shadow-sm flex items-center gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}