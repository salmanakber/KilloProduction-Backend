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
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { format } from "date-fns"
import { CalendarIcon, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Campaign } from "@/types/campaign" // Import Campaign type

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
      setError("Please fill in all required fields.")
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/marketing/campaigns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          type,
          content: { title, message, ctaText, actionUrl },
          channels,
          schedule: {
            startDate: startDate.toISOString(),
            endDate: endDate?.toISOString(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            frequency: "ONCE", // Simplified for now
          },
          targetAudience: {
            userType: ["CUSTOMER"], // Simplified: target all customers
            modules: [],
            segments: [],
            totalUsers: 0, // Will be calculated on backend or dynamically
          },
          createdBy: "admin_user_id", // Placeholder
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
      <DialogContent className="sm:max-w-[1000px] bg-white">
        <DialogHeader>
          <DialogTitle>Create New Campaign</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new marketing campaign.
          </DialogDescription>
        </DialogHeader>
  
        <form onSubmit={handleSubmit} className="grid gap-6 py-4 display-flex">
          {/* Name */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="name" className="sm:col-span-3 text-right">
              Name
            </Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-9" required />
          </div>

          {/* Type */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="type" className="sm:col-span-3 text-right">
              Type
            </Label>
            <div className="sm:col-span-9">
              <Select value={type} onValueChange={(value) => setType(value as Campaign["type"])}>
                <SelectTrigger>
                  <SelectValue placeholder="Select campaign type" />
                </SelectTrigger>
                <SelectContent className="bg-white">
 <SelectItem value="PROMOTIONAL">PROMOTIONAL</SelectItem>
 <SelectItem value="TRANSACTIONAL">TRANSACTIONAL</SelectItem>
 <SelectItem value="BEHAVIORAL">BEHAVIORAL</SelectItem>
 <SelectItem value="LIFECYCLE">LIFECYCLE</SelectItem>
 <SelectItem value="RETENTION">RETENTION</SelectItem>
 <SelectItem value="ACQUISITION">ACQUISITION</SelectItem>
 <SelectItem value="REACTIVATION">REACTIVATION</SelectItem>
 <SelectItem value="SEASONAL">SEASONAL</SelectItem>
 <SelectItem value="FLASH_SALE">FLASH_SALE</SelectItem>
 <SelectItem value="ANNOUNCEMENT">ANNOUNCEMENT</SelectItem>
 <SelectItem value="EDUCATIONAL">EDUCATIONAL</SelectItem>
 <SelectItem value="SURVEY">SURVEY</SelectItem>
 <SelectItem value="FEEDBACK">FEEDBACK</SelectItem>
 <SelectItem value="WELCOME_SERIES">WELCOME_SERIES</SelectItem>
 <SelectItem value="ABANDONED_CART">ABANDONED_CART</SelectItem>
 <SelectItem value="WIN_BACK">WIN_BACK</SelectItem>
 <SelectItem value="REFERRAL">REFERRAL</SelectItem>
 <SelectItem value="LOYALTY">LOYALTY</SelectItem>
 <SelectItem value="BIRTHDAY">BIRTHDAY</SelectItem>
 <SelectItem value="PROMO">PROMO</SelectItem>
 <SelectItem value="ANNIVERSARY">ANNIVERSARY</SelectItem>
 <SelectItem value="CUSTOM">CUSTOM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
  
          {/* Title */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="title" className="sm:col-span-3 text-right">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="sm:col-span-9"
              placeholder="e.g., Limited Time Offer!"
            />
          </div>
  
          {/* Message */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-start gap-4">
            <Label htmlFor="message" className="sm:col-span-3 text-right pt-2">
              Message
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="sm:col-span-9"
              placeholder="Your campaign message here..."
              required
            />
          </div>
  
          {/* CTA Text */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="ctaText" className="sm:col-span-3 text-right">
              CTA Text
            </Label>
            <Input
              id="ctaText"
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              className="sm:col-span-9"
              placeholder="e.g., Shop Now"
            />
          </div>
          
  
          {/* Action URL */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="actionUrl" className="sm:col-span-3 text-right">
              Action URL
            </Label>
            <Input
              id="actionUrl"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
              className="sm:col-span-9"
              type="url"
              placeholder="https://your-app.com/offer"
            />
          </div>

  
          {/* Channels */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-start gap-4">
            <Label className="sm:col-span-3 text-right pt-2">Channels</Label>
            <div className="sm:col-span-9 flex flex-wrap gap-4">
              {["PUSH", "EMAIL", "SMS"].map((channel) => (
                <div key={channel} className="flex items-center space-x-2">
                  <Checkbox
                    id={`channel-${channel.toLowerCase()}`}
                    checked={channels.includes(channel as any)}
                    onCheckedChange={() => handleChannelChange(channel as any)}
                  />
                  <Label htmlFor={`channel-${channel.toLowerCase()}`}>
                    {channel === "PUSH" && "Push Notification"}
                    {channel === "EMAIL" && "Email"}
                    {channel === "SMS" && "SMS"}
                  </Label>
                </div>
              ))}
            </div>
          </div>
  
          {/* Start Date */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="startDate" className="sm:col-span-3 text-right">
              Start Date
            </Label>
            <div className="sm:col-span-9">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("justify-start text-left font-normal w-full", !startDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
  
          {/* End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4">
            <Label htmlFor="endDate" className="sm:col-span-3 text-right">
              End Date (Optional)
            </Label>
            <div className="sm:col-span-9">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("justify-start text-left font-normal w-full", !endDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
  
          {/* Error */}
          {error && (
            <p className="text-center text-red-500 col-span-full">
              {error}
            </p>
          )}
  
          {/* Actions */}
          <DialogFooter className="col-span-full">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Campaign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
  
}
