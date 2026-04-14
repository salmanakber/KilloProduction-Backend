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
import { Loader2, PlusCircle, MinusCircle } from "lucide-react"
import type { AutomationRule } from "@/types/marketing" // Declare the AutomationRule variable

interface CreateAutomationRuleFormProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function CreateAutomationRuleForm({ isOpen, onClose, onSuccess }: CreateAutomationRuleFormProps) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [triggerType, setTriggerType] = useState<AutomationRule["trigger"]["type"]>("USER_SIGNUP")
  const [triggerConditions, setTriggerConditions] = useState<Record<string, any>>({})
  const [actions, setActions] = useState<AutomationRule["actions"]>([
    { type: "SEND_EMAIL", config: { subject: "", message: "" } },
  ])
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAddAction = () => {
    setActions((prev) => [...prev, { type: "SEND_EMAIL", config: { subject: "", message: "" } }])
  }

  const handleRemoveAction = (index: number) => {
    setActions((prev) => prev.filter((_, i) => i !== index))
  }

  const handleActionChange = (index: number, field: string, value: any) => {
    const newActions = [...actions]
    if (field === "type") {
      newActions[index].type = value as AutomationRule["actions"][0]["type"]
      // Reset config when type changes
      if (value === "SEND_EMAIL") newActions[index].config = { subject: "", message: "" }
      else if (value === "SEND_PUSH") newActions[index].config = { title: "", body: "" }
      else if (value === "SEND_SMS") newActions[index].config = { message: "" }
      else newActions[index].config = {}
    } else {
      newActions[index].config = { ...newActions[index].config, [field]: value }
    }
    setActions(newActions)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!name || !triggerType || actions.length === 0) {
      setError("Please fill in all required fields and add at least one action.")
      setLoading(false)
      return
    }

    try {
      const response = await fetch("/api/marketing/automation/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description,
          trigger: { type: triggerType, conditions: triggerConditions },
          actions,
          isActive,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to create automation rule")
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
    setTriggerType("USER_SIGNUP")
    setTriggerConditions({})
    setActions([{ type: "SEND_EMAIL", config: { subject: "", message: "" } }])
    setIsActive(true)
    setError(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-[700px] bg-white">
        <DialogHeader>
          <DialogTitle>Create New Automation Rule</DialogTitle>
          <DialogDescription>Define a trigger and actions for an automated marketing rule.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="name" className="text-right">
              Rule Name
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
              placeholder="e.g., Send welcome email to new users"
            />
          </div>

          {/* Trigger Section */}
          <div className="col-span-4 border-t pt-4 mt-4">
            <h4 className="text-lg font-semibold mb-2">Trigger</h4>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="triggerType" className="text-right">
                Type
              </Label>
              <Select
                value={triggerType}
                onValueChange={(value) => setTriggerType(value as AutomationRule["trigger"]["type"])}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select trigger type" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="USER_SIGNUP">User Signup</SelectItem>
                  <SelectItem value="ORDER_PLACED">Order Placed</SelectItem>
                  <SelectItem value="CART_ABANDONED">Cart Abandoned</SelectItem>
                  <SelectItem value="INACTIVITY">User Inactivity</SelectItem>
                  <SelectItem value="CUSTOM_EVENT">Custom Event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Add more trigger conditions based on triggerType if needed */}
          </div>

          {/* Actions Section */}
          <div className="col-span-4 border-t pt-4 mt-4">
            <h4 className="text-lg font-semibold mb-2 flex items-center justify-between">
              Actions
              <Button type="button" variant="outline" size="sm" onClick={handleAddAction}>
                <PlusCircle className="h-4 w-4 mr-1" /> Add Action
              </Button>
            </h4>
            {actions.map((action, index) => (
              <div key={index} className="mb-4 p-4 border rounded-md">
                {" "}
                {/* Updated Card component to div */}
                <div className="p-0">
                  <div className="flex justify-end mb-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAction(index)}
                      disabled={actions.length === 1}
                    >
                      <MinusCircle className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4 mb-2">
                    <Label htmlFor={`actionType-${index}`} className="text-right">
                      Action Type
                    </Label>
                    <Select value={action.type} onValueChange={(value) => handleActionChange(index, "type", value)}>
                      <SelectTrigger className="col-span-3">
                        <SelectValue placeholder="Select action type" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        <SelectItem value="SEND_EMAIL">Send Email</SelectItem>
                        <SelectItem value="SEND_PUSH">Send Push Notification</SelectItem>
                        <SelectItem value="SEND_SMS">Send SMS</SelectItem>
                        <SelectItem value="ADD_TO_SEGMENT">Add to Segment</SelectItem>
                        <SelectItem value="ASSIGN_COUPON">Assign Coupon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {action.type === "SEND_EMAIL" && (
                    <>
                      <div className="grid grid-cols-4 items-center gap-4 mb-2">
                        <Label htmlFor={`emailSubject-${index}`} className="text-right">
                          Subject
                        </Label>
                        <Input
                          id={`emailSubject-${index}`}
                          value={action.config.subject || ""}
                          onChange={(e) => handleActionChange(index, "subject", e.target.value)}
                          className="col-span-3"
                          placeholder="Email Subject"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor={`emailMessage-${index}`} className="text-right">
                          Message
                        </Label>
                        <Textarea
                          id={`emailMessage-${index}`}
                          value={action.config.message || ""}
                          onChange={(e) => handleActionChange(index, "message", e.target.value)}
                          className="col-span-3"
                          placeholder="Email Body"
                        />
                      </div>
                    </>
                  )}
                  {action.type === "SEND_PUSH" && (
                    <>
                      <div className="grid grid-cols-4 items-center gap-4 mb-2">
                        <Label htmlFor={`pushTitle-${index}`} className="text-right">
                          Title
                        </Label>
                        <Input
                          id={`pushTitle-${index}`}
                          value={action.config.title || ""}
                          onChange={(e) => handleActionChange(index, "title", e.target.value)}
                          className="col-span-3"
                          placeholder="Push Notification Title"
                        />
                      </div>
                      <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor={`pushBody-${index}`} className="text-right">
                          Body
                        </Label>
                        <Textarea
                          id={`pushBody-${index}`}
                          value={action.config.body || ""}
                          onChange={(e) => handleActionChange(index, "body", e.target.value)}
                          className="col-span-3"
                          placeholder="Push Notification Body"
                        />
                      </div>
                    </>
                  )}
                  {action.type === "SEND_SMS" && (
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor={`smsMessage-${index}`} className="text-right">
                        Message
                      </Label>
                      <Textarea
                        id={`smsMessage-${index}`}
                        value={action.config.message || ""}
                        onChange={(e) => handleActionChange(index, "message", e.target.value)}
                        className="col-span-3"
                        placeholder="SMS Message"
                      />
                    </div>
                  )}
                  {/* Add more config fields for other action types */}
                </div>
              </div>
            ))}
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
              Create Rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
