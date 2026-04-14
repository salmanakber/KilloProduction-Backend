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
import { Loader2 } from "lucide-react"
import type { Segment } from "@/types/segment" // Declare the Segment variable

interface CreateSegmentFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateSegmentForm({ isOpen, onClose, onSuccess }: CreateSegmentFormProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [type, setType] = useState<Segment["type"]>("DEMOGRAPHIC")
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Simplified criteria state for demonstration
  const [userTypeCriteria, setUserTypeCriteria] = useState<string[]>([])
  const [minAge, setMinAge] = useState<string>("")
  const [maxAge, setMaxAge] = useState<string>("")
  const [location, setLocation] = useState<string>("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!name || !type) {
      setError("Please fill in all required fields.")
      setLoading(false)
      return
    }

    const criteria: Segment["criteria"] = {}
    if (userTypeCriteria.length > 0) criteria.userType = userTypeCriteria
    if (minAge && maxAge) criteria.ageRange = { min: Number.parseInt(minAge), max: Number.parseInt(maxAge) }
    if (location) criteria.location = [location] // Simplified to single location

    try {
      const response = await fetch("/api/marketing/segments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          type,
          criteria,
          isActive,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create segment")
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
    setDescription("")
    setType("DEMOGRAPHIC")
    setIsActive(true)
    setUserTypeCriteria([])
    setMinAge("")
    setMaxAge("")
    setLocation("")
    setError(null)
  }

  const handleUserTypeChange = (type: string) => {
    setUserTypeCriteria((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[800px] bg-white">
        <DialogHeader>
          <DialogTitle>Create New Segment</DialogTitle>
          <DialogDescription>Define criteria to create a new customer segment.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Name
            </Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="col-span-3" required />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="description" className="text-right">
              Description
            </Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
              placeholder="Brief description of the segment"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Type
            </Label>
            <Select value={type} onValueChange={(value) => setType(value as Segment["type"])}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select segment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DEMOGRAPHIC">Demographic</SelectItem>
                <SelectItem value="BEHAVIORAL">Behavioral</SelectItem>
                <SelectItem value="TRANSACTIONAL">Transactional</SelectItem>
                <SelectItem value="ENGAGEMENT">Engagement</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Simplified Criteria Section */}
          <div className="col-span-4 border-t pt-4 mt-4">
            <h4 className="text-lg font-semibold mb-2">Segment Criteria (Simplified)</h4>
            <div className="grid grid-cols-4 items-center gap-4 mb-2">
              <Label className="text-right">User Type</Label>
              <div className="col-span-3 flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="user-customer"
                    checked={userTypeCriteria.includes("CUSTOMER")}
                    onCheckedChange={() => handleUserTypeChange("CUSTOMER")}
                  />
                  <Label htmlFor="user-customer">Customer</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="user-vendor"
                    checked={userTypeCriteria.includes("VENDOR")}
                    onCheckedChange={() => handleUserTypeChange("VENDOR")}
                  />
                  <Label htmlFor="user-vendor">Vendor</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="user-rider"
                    checked={userTypeCriteria.includes("RIDER")}
                    onCheckedChange={() => handleUserTypeChange("RIDER")}
                  />
                  <Label htmlFor="user-rider">Rider</Label>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4 mb-2">
              <Label htmlFor="minAge" className="text-right">
                Age Range
              </Label>
              <Input
                id="minAge"
                type="number"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                placeholder="Min"
                className="col-span-1"
              />
              <Input
                id="maxAge"
                type="number"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                placeholder="Max"
                className="col-span-1"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                Location (City)
              </Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., New York"
                className="col-span-3"
              />
            </div>
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="isActive" className="text-right">
              Active
            </Label>
            <Checkbox
              id="isActive"
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
              className="col-span-3"
            />
          </div>

          {error && <p className="col-span-4 text-center text-red-500">{error}</p>}
          <DialogFooter className="col-span-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Segment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
