"use client"

import type React from "react"
import { useState } from "react"
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
  AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { Campaign } from "@/types/campaign" 

interface CreateCampaignFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateCampaignForm({ isOpen, onClose, onSuccess }: CreateCampaignFormProps) {
  const [name, setName] = useState("")
  const [type, setType] = useState<Campaign["type"]>("PROMO")
  const [message, setMessage] = useState("")
  const [title, setTitle] = useState("")
  const [ctaText, setCtaText] = useState("")
  const [actionUrl, setActionUrl] = useState("")
  const [startDate, setStartDate] = useState<Date | undefined>(new Date())
  const [endDate, setEndDate] = useState<Date | undefined>(undefined)
  const [channels, setChannels] = useState<("PUSH" | "EMAIL" | "SMS")[]>([])
  const [loading, setLoading] = useState(false)
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
          content: { title, message, ctaText, actionUrl },
          channels,
          schedule: {
            startDate: startDate.toISOString(),
            endDate: endDate?.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            frequency: "ONCE", 
          },
          targetAudience: {
            userType: ["CUSTOMER"], 
            modules: [],
            segments: [],
            totalUsers: 0, 
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
    setError(null)
  }

  const handleChannelChange = (channel: "PUSH" | "EMAIL" | "SMS") => {
    setChannels((prev) => (prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]))
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
                  <Select value={type} onValueChange={(value) => setType(value as Campaign["type"])}>
                    <SelectTrigger className="border-slate-200 focus:ring-emerald-500 bg-white">
                      <SelectValue placeholder="Select campaign type" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 max-h-[300px]">
                      {[
                        "PROMOTIONAL", "TRANSACTIONAL", "BEHAVIORAL", "LIFECYCLE", 
                        "RETENTION", "ACQUISITION", "REACTIVATION", "SEASONAL", 
                        "FLASH_SALE", "ANNOUNCEMENT", "EDUCATIONAL", "SURVEY", 
                        "FEEDBACK", "WELCOME_SERIES", "ABANDONED_CART", "WIN_BACK", 
                        "REFERRAL", "LOYALTY", "BIRTHDAY", "PROMO", "ANNIVERSARY", "CUSTOM"
                      ].map((t) => (
                        <SelectItem key={t} value={t} className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                          {t.replace(/_/g, ' ')}
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
                      <LinkIcon className="h-4 w-4 text-slate-400" /> Action URL
                    </Label>
                    <Input
                      id="actionUrl"
                      value={actionUrl}
                      onChange={(e) => setActionUrl(e.target.value)}
                      className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                      type="url"
                      placeholder="https://your-app.com/offer"
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