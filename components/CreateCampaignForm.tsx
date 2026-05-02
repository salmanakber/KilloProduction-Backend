"use client"

import type React from "react"
import { useState } from "react"
import { useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { 
  CalendarIcon, 
  Loader2, 
  Megaphone, 
  Rocket, 
  Mail, 
  Smartphone, 
  MessageSquare,
  Type,
  AlignLeft,
  MousePointerClick,
  Link as LinkIcon,
  AlertCircle,
  Navigation,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface CreateCampaignFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateCampaignForm({ isOpen, onClose, onSuccess }: CreateCampaignFormProps) {
  const recommendedDailyCap = 150
  const [name, setName] = useState("")
  const [type, setType] = useState<"PROMO" | "LOYALTY" | "FLASH_SALE" | "PROMOTIONAL" | "CUSTOM">("PROMO")
  const [message, setMessage] = useState("")
  const [title, setTitle] = useState("")
  const [ctaText, setCtaText] = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [channels, setChannels] = useState<("PUSH" | "EMAIL" | "SMS")[]>([])
  const [timezone, setTimezone] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
  const [targetLocation, setTargetLocation] = useState("")
  const [targetLat, setTargetLat] = useState<number | null>(null)
  const [targetLng, setTargetLng] = useState<number | null>(null)
  const [targetRadiusKm, setTargetRadiusKm] = useState<string>("10")
  const [locationSuggestions, setLocationSuggestions] = useState<Array<{ description: string; place_id: string }>>([])
  const [locationLoading, setLocationLoading] = useState(false)
  const [frequency, setFrequency] = useState<"ONCE" | "HOURLY" | "DAILY" | "CUSTOM_DAYS">("ONCE")
  const [customEveryDays, setCustomEveryDays] = useState<string>("2")
  const [promoCode, setPromoCode] = useState("")
  /** React Navigation screen name (matches mobile stack); preferred over Action URL for in-app taps. */
  const [destinationRoute, setDestinationRoute] = useState("")
  /** Optional JSON object passed to navigate(screen, params), e.g. {"offerId":"..."} for FoodOfferDetails */
  const [routeParamsJson, setRouteParamsJson] = useState("")
  const [ruleNotes, setRuleNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!name || !type || !message || channels.length === 0 || !startDate) {
      setError("Please fill in all required fields and select at least one channel.")
      setLoading(false)
      return
    }

    if (targetLocation && (targetLat === null || targetLng === null)) {
      setError("Please pick a suggested address so we can use exact map coordinates.")
      setLoading(false)
      return
    }

    let deepLinkParams: Record<string, unknown> | undefined
    if (routeParamsJson.trim()) {
      try {
        const parsed = JSON.parse(routeParamsJson.trim()) as unknown
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Screen params must be a JSON object, e.g. {\"offerId\":\"abc\"}")
        }
        deepLinkParams = parsed as Record<string, unknown>
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Invalid JSON for screen params")
        setLoading(false)
        return
      }
    }

    try {
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name,
          type,
          channels,
          schedule: {
            startDate: startDate.toISOString(),
            endDate: endDate?.toISOString(),
            timezone: timezone || "UTC",
            frequency,
            customEveryDays: frequency === "CUSTOM_DAYS" ? Math.max(1, Number(customEveryDays || "1")) : undefined,
          },
          targetAudience: {
            userType: ["CUSTOMER"], 
            modules: [],
            segments: [],
            location: targetLocation ? [targetLocation.trim()] : [],
            totalUsers: previewCount ?? 0,
          },
          content: {
            title,
            message,
            ctaText,
            actionUrl,
            promoCode: promoCode || undefined,
            routeName: destinationRoute.trim() || undefined,
            deepLinkParams,
            targetingRules: ruleNotes || undefined,
            targetingCoordinates:
              targetLat !== null && targetLng !== null
                ? {
                    lat: targetLat,
                    lng: targetLng,
                    radiusKm: Math.max(1, Number(targetRadiusKm || "10")),
                    address: targetLocation.trim(),
                  }
                : undefined,
          },
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create campaign")
      }

      onSuccess()
      onClose()
      resetForm()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setName("")
    setType("PROMO")
    setMessage("")
    setTitle("")
    setCtaText("")
    setActionUrl("")
    setStartDate(new Date())
    setEndDate(undefined)
    setChannels([])
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")
    setTargetLocation("")
    setTargetLat(null)
    setTargetLng(null)
    setTargetRadiusKm("10")
    setLocationSuggestions([])
    setFrequency("ONCE")
    setCustomEveryDays("2")
    setPromoCode("")
    setDestinationRoute("")
    setRouteParamsJson("")
    setRuleNotes("")
    setPreviewCount(null)
    setError(null)
  }

  const canSearchLocation = useMemo(() => targetLocation.trim().length >= 3, [targetLocation])
  const estimatedDaysToComplete =
    previewCount && previewCount > 0 ? Math.ceil(previewCount / recommendedDailyCap) : null

  const searchLocationSuggestions = async (input: string) => {
    const q = input.trim()
    if (q.length < 3) {
      setLocationSuggestions([])
      return
    }
    setLocationLoading(true)
    try {
      const res = await fetch(`/api/location/autocomplete?input=${encodeURIComponent(q)}`, { credentials: "include" })
      const data = await res.json()
      setLocationSuggestions((data?.predictions || []).slice(0, 6))
    } catch {
      setLocationSuggestions([])
    } finally {
      setLocationLoading(false)
    }
  }

  const chooseLocation = async (placeId: string, description: string) => {
    try {
      const res = await fetch(`/api/location/place-details?place_id=${encodeURIComponent(placeId)}`, {
        credentials: "include",
      })
      const data = await res.json()
      const loc = data?.result?.geometry?.location
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        setTargetLocation(data?.result?.formatted_address || description)
        setTargetLat(Number(loc.lat))
        setTargetLng(Number(loc.lng))
        setLocationSuggestions([])
        setPreviewCount(null)
      }
    } catch {
      // no-op
    }
  }

  const handleChannelChange = (channel: "PUSH" | "EMAIL" | "SMS") => {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]))
  }

  const previewAudience = async () => {
    setError(null)
    if (targetLocation && (targetLat === null || targetLng === null)) {
      setError("Please choose an address from suggestions before previewing audience.")
      return
    }
    setPreviewLoading(true)
    try {
      const res = await fetch("/api/marketing/campaigns/preview-audience", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLat,
          targetLng,
          radiusKm: Math.max(1, Number(targetRadiusKm || "10")),
          segmentIds: [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || "Failed to preview audience")
      setPreviewCount(Number(data?.matchedUsers || 0))
    } catch (e: any) {
      setError(e?.message || "Failed to preview audience")
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[850px] bg-white border-emerald-100 shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Premium Header */}
        <DialogHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 border-b border-emerald-100">
          <DialogTitle className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500 flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-emerald-500 fill-emerald-100" />
            Create Marketing Campaign
          </DialogTitle>
          <DialogDescription className="text-emerald-700/80 font-medium mt-1">
            Design, schedule, and launch multi-channel campaigns to engage your audience.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto px-6 py-6 flex-1 custom-scrollbar">
          <form id="campaign-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* Section 1: Campaign Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                1. Campaign Details
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-slate-700 font-semibold flex items-center gap-2">
                    <Rocket className="h-4 w-4 text-emerald-500" /> Campaign Name
                  </Label>
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-slate-50/50" 
                    placeholder="e.g., Summer Flash Sale 2024"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type" className="text-slate-700 font-semibold">Campaign Type</Label>
                  <Select value={type} onValueChange={(value) => setType(value as typeof type)}>
                    <SelectTrigger className="border-slate-200 focus:ring-emerald-500 bg-white">
                      <SelectValue placeholder="Select campaign type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 max-h-[300px]">
                      {[
                        { value: "PROMO", label: "Promo" },
                        { value: "LOYALTY", label: "Loyalty" },
                        { value: "FLASH_SALE", label: "Flash Sale" },
                        { value: "PROMOTIONAL", label: "Special Offer" },
                        { value: "CUSTOM", label: "Custom" },
                      ].map((t) => (
                        <SelectItem key={t.value} value={t.value} className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Section 2: Content */}
            <div className="space-y-4 bg-slate-50/50 p-5 rounded-xl border border-slate-100">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                2. Message Content
              </h4>
              
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="title" className="text-slate-700 font-semibold flex items-center gap-2">
                    <Type className="h-4 w-4 text-slate-400" /> Subject / Title
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-white font-medium"
                    placeholder="Grab attention (e.g., Limited Time Offer!)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message" className="text-slate-700 font-semibold flex items-center gap-2">
                    <AlignLeft className="h-4 w-4 text-slate-400" /> Main Message
                  </Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-white min-h-[100px] resize-none"
                    placeholder="Write your compelling campaign message here..."
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="ctaText" className="text-slate-700 font-semibold flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-slate-400" /> Call to Action (CTA)
                    </Label>
                    <Input
                      id="ctaText"
                      value={ctaText}
                      onChange={(e) => setCtaText(e.target.value)}
                      className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                      placeholder="e.g., Shop Now, Claim Offer"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="actionUrl" className="text-slate-700 font-semibold flex items-center gap-2">
                      <LinkIcon className="h-4 w-4 text-slate-400" /> External link (optional)
                    </Label>
                    <Input
                      id="actionUrl"
                      value={actionUrl}
                      onChange={(e) => setActionUrl(e.target.value)}
                      className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                      placeholder="https://… (only if opening a website, not the in-app screen)"
                    />
                    <p className="text-xs text-slate-500">
                      For app destinations, use <strong>In-app screen</strong> below so promotion taps open the correct module (not a generic home link).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-2">
                    <Label htmlFor="destinationRoute" className="text-slate-700 font-semibold flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-slate-400" /> In-app screen
                    </Label>
                    <Select value={destinationRoute || "__none__"} onValueChange={(v) => setDestinationRoute(v === "__none__" ? "" : v)}>
                      <SelectTrigger id="destinationRoute" className="border-slate-200 focus:ring-emerald-500 bg-white">
                        <SelectValue placeholder="Choose where “Claim” opens in the app" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200 max-h-[280px]">
                        <SelectItem value="__none__">— Not set (use external link or path only) —</SelectItem>
                        <SelectItem value="Home">Home</SelectItem>
                        <SelectItem value="CustomerFood">Food (browse)</SelectItem>
                        <SelectItem value="FoodOffers">Food — offers list</SelectItem>
                        <SelectItem value="FoodOfferDetails">Food — single offer (set JSON params)</SelectItem>
                        <SelectItem value="CustomerGrocery">Grocery</SelectItem>
                        <SelectItem value="CustomerPharmacy">Pharmacy</SelectItem>
                        <SelectItem value="CustomerAutoParts">Auto parts</SelectItem>
                        <SelectItem value="CustomerRiding">Rides</SelectItem>
                        <SelectItem value="Cart">Cart</SelectItem>
                        <SelectItem value="Loyalty">Loyalty</SelectItem>
                        <SelectItem value="Wallet">Wallet</SelectItem>
                        <SelectItem value="PromotionInbox">Promotions inbox</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="routeParamsJson" className="text-slate-700 font-semibold">
                      Screen params (JSON, optional)
                    </Label>
                    <Textarea
                      id="routeParamsJson"
                      value={routeParamsJson}
                      onChange={(e) => setRouteParamsJson(e.target.value)}
                      className="border-slate-200 focus-visible:ring-emerald-500 bg-white min-h-[80px] resize-none font-mono text-xs"
                      placeholder='e.g. {"offerId":"clx123"} for FoodOfferDetails'
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Channels */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                3. Distribution Channels
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Push Notification Card */}
                <div 
                  onClick={() => handleChannelChange("PUSH")}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                    channels.includes("PUSH") 
                      ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm" 
                      : "border-slate-200 hover:border-blue-200 bg-white text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Smartphone className={cn("h-8 w-8 mb-2", channels.includes("PUSH") ? "text-blue-500" : "text-slate-400")} />
                  <span className="font-semibold text-sm">Push Notification</span>
                </div>

                {/* Email Card */}
                <div 
                  onClick={() => handleChannelChange("EMAIL")}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                    channels.includes("EMAIL") 
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 shadow-sm" 
                      : "border-slate-200 hover:border-emerald-200 bg-white text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Mail className={cn("h-8 w-8 mb-2", channels.includes("EMAIL") ? "text-emerald-500" : "text-slate-400")} />
                  <span className="font-semibold text-sm">Email Delivery</span>
                </div>

                {/* SMS Card */}
                <div 
                  onClick={() => handleChannelChange("SMS")}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                    channels.includes("SMS") 
                      ? "border-purple-500 bg-purple-50 text-purple-900 shadow-sm" 
                      : "border-slate-200 hover:border-purple-200 bg-white text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <MessageSquare className={cn("h-8 w-8 mb-2", channels.includes("SMS") ? "text-purple-500" : "text-slate-400")} />
                  <span className="font-semibold text-sm">SMS Text</span>
                </div>
              </div>
            </div>

            {/* Section 4: Scheduling */}
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                4. Schedule
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label htmlFor="startDate" className="text-slate-700 font-semibold">Start Date & Time</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-medium border-slate-200 hover:bg-slate-50 focus:ring-emerald-500",
                          !startDate && "text-slate-500"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-emerald-500" />
                        {startDate ? format(startDate, "PPP") : <span>Pick a start date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-slate-200">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate" className="text-slate-700 font-semibold">End Date <span className="text-slate-400 font-normal">(Optional)</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-medium border-slate-200 hover:bg-slate-50 focus:ring-emerald-500",
                          !endDate && "text-slate-500"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                        {endDate ? format(endDate, "PPP") : <span>Pick an end date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 border-slate-200">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="border-slate-200 focus:ring-emerald-500 bg-white">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {[
                        "UTC",
                        "Africa/Lagos",
                        "Asia/Karachi",
                        "Asia/Dubai",
                        "Europe/London",
                        "America/New_York",
                        "Asia/Kolkata",
                      ].map((tz) => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Target Location</Label>
                  <Input
                    value={targetLocation}
                    onChange={(e) => {
                      setTargetLocation(e.target.value)
                      setTargetLat(null)
                      setTargetLng(null)
                      setPreviewCount(null)
                      void searchLocationSuggestions(e.target.value)
                    }}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                    placeholder="Search exact address"
                  />
                  {locationLoading ? (
                    <p className="text-xs text-slate-500">Searching locations...</p>
                  ) : null}
                  {canSearchLocation && locationSuggestions.length > 0 ? (
                    <div className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-white">
                      {locationSuggestions.map((s) => (
                        <button
                          key={s.place_id}
                          type="button"
                          className="block w-full text-left px-3 py-2 text-sm hover:bg-emerald-50"
                          onClick={() => void chooseLocation(s.place_id, s.description)}
                        >
                          {s.description}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {targetLat !== null && targetLng !== null ? (
                    <p className="text-xs text-emerald-700">
                      Target locked: {targetLat.toFixed(5)}, {targetLng.toFixed(5)}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Target Radius (KM)</Label>
                  <Input
                    value={targetRadiusKm}
                    onChange={(e) => {
                      setTargetRadiusKm(e.target.value)
                      setPreviewCount(null)
                    }}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                    type="number"
                    min={1}
                    max={100}
                  />
                  <div className="flex items-center gap-3 pt-1">
                    <Button type="button" variant="outline" onClick={() => void previewAudience()} disabled={previewLoading}>
                      {previewLoading ? "Checking..." : "Preview Audience"}
                    </Button>
                    {previewCount !== null ? (
                      <p className="text-xs font-medium text-emerald-700">
                        Matched users: {previewCount.toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {previewCount !== null && previewCount > recommendedDailyCap ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                      <p className="text-xs font-medium text-amber-800">
                        Audience is above daily automation cap (100-200/day, default {recommendedDailyCap}/day).
                      </p>
                      {estimatedDaysToComplete ? (
                        <p className="mt-1 text-xs text-amber-700">
                          Estimated delivery window: about {estimatedDaysToComplete} day
                          {estimatedDaysToComplete > 1 ? "s" : ""}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Run Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                    <SelectTrigger className="border-slate-200 focus:ring-emerald-500 bg-white">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ONCE">Once</SelectItem>
                      <SelectItem value="HOURLY">Hourly</SelectItem>
                      <SelectItem value="DAILY">Daily</SelectItem>
                      <SelectItem value="CUSTOM_DAYS">Every custom days</SelectItem>
                    </SelectContent>
                  </Select>
                  {frequency === "CUSTOM_DAYS" ? (
                    <Input
                      value={customEveryDays}
                      onChange={(e) => setCustomEveryDays(e.target.value)}
                      type="number"
                      min={1}
                      className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                      placeholder="Run every N days"
                    />
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Promo Code (optional)</Label>
                  <Input
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                    placeholder="e.g. EID2026"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Custom Rules / AI Notes</Label>
                  <Input
                    value={ruleNotes}
                    onChange={(e) => setRuleNotes(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                    placeholder="interest-based, nearest offer, etc."
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-lg flex items-start gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            )}
          </form>
        </div>

        {/* Sticky Footer */}
        <DialogFooter className="bg-slate-50 px-6 py-4 border-t border-slate-100 sm:justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading} className="border-slate-200 hover:bg-slate-100">
            Cancel
          </Button>
          <Button 
            form="campaign-form" 
            type="submit" 
            disabled={loading}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-200 border-0"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Launching...
              </>
            ) : (
              "Create Campaign"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}