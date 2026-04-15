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
import { Switch } from "@/components/ui/switch"
import { 
  Loader2, 
  PlusCircle, 
  Zap, 
  Trash2, 
  Mail, 
  Smartphone, 
  MessageSquare, 
  Users, 
  Ticket, 
  Activity,
  UserPlus,
  ShoppingCart,
  AlertCircle,
  PlayCircle
} from "lucide-react"
import type { AutomationRule } from "@/types/marketing" 

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
      <DialogContent className="sm:max-w-[750px] bg-white border-emerald-100 shadow-2xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Premium Header */}
        <DialogHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 p-6 border-b border-emerald-100">
          <DialogTitle className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-teal-500 flex items-center gap-2">
            <Zap className="h-6 w-6 text-emerald-500 fill-emerald-100" />
            Create Automation Rule
          </DialogTitle>
          <DialogDescription className="text-emerald-700/80 font-medium">
            Define intelligent triggers and chained actions to automate your marketing workflow.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Form Body */}
        <div className="overflow-y-auto px-6 py-6 flex-1 custom-scrollbar">
          <form id="automation-form" onSubmit={handleSubmit} className="space-y-8">
            
            {/* General Info Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">General Information</h4>
                <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-full border border-slate-100">
                  <Label htmlFor="isActive" className="text-sm font-medium text-slate-600 cursor-pointer">
                    {isActive ? "Status: Active" : "Status: Paused"}
                  </Label>
                  <Switch
                    id="isActive"
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name" className="text-slate-700 font-semibold">Rule Name</Label>
                  <Input 
                    id="name" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-slate-50/50" 
                    placeholder="e.g., Welcome Series for New Users"
                    required 
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description" className="text-slate-700 font-semibold">Description <span className="text-slate-400 font-normal">(Optional)</span></Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="border-slate-200 focus-visible:ring-emerald-500 bg-slate-50/50 resize-none"
                    placeholder="Briefly describe what this automation does..."
                    rows={2}
                  />
                </div>
              </div>
            </div>

            {/* Trigger Section */}
            <div className="space-y-4 bg-emerald-50/30 p-5 rounded-xl border border-emerald-100/50">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-slate-800">Trigger Event</h4>
                  <p className="text-xs text-slate-500 font-medium">When should this automation start?</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="triggerType" className="text-slate-700 font-semibold">Select Trigger</Label>
                <Select
                  value={triggerType}
                  onValueChange={(value) => setTriggerType(value as AutomationRule["trigger"]["type"])}
                >
                  <SelectTrigger className="border-slate-200 focus:ring-emerald-500 bg-white h-12">
                    <SelectValue placeholder="Select trigger type" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-slate-200 shadow-xl rounded-xl">
                    <SelectItem value="USER_SIGNUP" className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                      <div className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-emerald-500"/> User Signup</div>
                    </SelectItem>
                    <SelectItem value="ORDER_PLACED" className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                      <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-blue-500"/> Order Placed</div>
                    </SelectItem>
                    <SelectItem value="CART_ABANDONED" className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                      <div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-amber-500"/> Cart Abandoned</div>
                    </SelectItem>
                    <SelectItem value="INACTIVITY" className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                      <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-slate-500"/> User Inactivity</div>
                    </SelectItem>
                    <SelectItem value="CUSTOM_EVENT" className="cursor-pointer focus:bg-emerald-50 focus:text-emerald-900">
                      <div className="flex items-center gap-2"><Zap className="h-4 w-4 text-purple-500"/> Custom Event</div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Actions Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div>
                  <h4 className="text-lg font-bold text-slate-800">Automated Actions</h4>
                  <p className="text-xs text-slate-500 font-medium">What happens after the trigger fires?</p>
                </div>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm" 
                  onClick={handleAddAction}
                  className="border-dashed border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-500 bg-white"
                >
                  <PlusCircle className="h-4 w-4 mr-2" /> Add Action
                </Button>
              </div>

              <div className="space-y-4">
                {actions.map((action, index) => (
                  <div key={index} className="bg-white border border-slate-200 rounded-xl p-5 relative group hover:border-emerald-300 transition-colors shadow-sm">
                    {/* Action Header */}
                    <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                          {index + 1}
                        </span>
                        <h5 className="font-semibold text-slate-700">Action Block</h5>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors"
                        onClick={() => handleRemoveAction(index)}
                        disabled={actions.length === 1}
                        title="Remove Action"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-slate-600 font-medium text-xs uppercase tracking-wider">Action Type</Label>
                        <Select value={action.type} onValueChange={(value) => handleActionChange(index, "type", value)}>
                          <SelectTrigger className="border-slate-200 focus:ring-emerald-500">
                            <SelectValue placeholder="Select action type" />
                          </SelectTrigger>
                          <SelectContent className="bg-white shadow-xl rounded-xl border-slate-200">
                            <SelectItem value="SEND_EMAIL" className="cursor-pointer focus:bg-emerald-50">
                              <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-emerald-500"/> Send Email</div>
                            </SelectItem>
                            <SelectItem value="SEND_PUSH" className="cursor-pointer focus:bg-emerald-50">
                              <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-blue-500"/> Send Push Notification</div>
                            </SelectItem>
                            <SelectItem value="SEND_SMS" className="cursor-pointer focus:bg-emerald-50">
                              <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4 text-purple-500"/> Send SMS</div>
                            </SelectItem>
                            <SelectItem value="ADD_TO_SEGMENT" className="cursor-pointer focus:bg-emerald-50">
                              <div className="flex items-center gap-2"><Users className="h-4 w-4 text-amber-500"/> Add to Segment</div>
                            </SelectItem>
                            <SelectItem value="ASSIGN_COUPON" className="cursor-pointer focus:bg-emerald-50">
                              <div className="flex items-center gap-2"><Ticket className="h-4 w-4 text-rose-500"/> Assign Coupon</div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Dynamic Config Fields based on Type */}
                      <div className="bg-slate-50 rounded-lg p-4 space-y-4 border border-slate-100">
                        {action.type === "SEND_EMAIL" && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-slate-700 font-semibold">Email Subject</Label>
                              <Input
                                value={action.config.subject || ""}
                                onChange={(e) => handleActionChange(index, "subject", e.target.value)}
                                className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                                placeholder="Enter an engaging subject line..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-slate-700 font-semibold">Email Message</Label>
                              <Textarea
                                value={action.config.message || ""}
                                onChange={(e) => handleActionChange(index, "message", e.target.value)}
                                className="border-slate-200 focus-visible:ring-emerald-500 bg-white resize-none"
                                placeholder="Write the email content here..."
                                rows={4}
                              />
                            </div>
                          </>
                        )}

                        {action.type === "SEND_PUSH" && (
                          <>
                            <div className="space-y-2">
                              <Label className="text-slate-700 font-semibold">Push Title</Label>
                              <Input
                                value={action.config.title || ""}
                                onChange={(e) => handleActionChange(index, "title", e.target.value)}
                                className="border-slate-200 focus-visible:ring-emerald-500 bg-white"
                                placeholder="Notification title..."
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-slate-700 font-semibold">Push Body</Label>
                              <Textarea
                                value={action.config.body || ""}
                                onChange={(e) => handleActionChange(index, "body", e.target.value)}
                                className="border-slate-200 focus-visible:ring-emerald-500 bg-white resize-none"
                                placeholder="Notification message..."
                                rows={2}
                              />
                            </div>
                          </>
                        )}

                        {action.type === "SEND_SMS" && (
                          <div className="space-y-2">
                            <Label className="text-slate-700 font-semibold">SMS Message</Label>
                            <Textarea
                              value={action.config.message || ""}
                              onChange={(e) => handleActionChange(index, "message", e.target.value)}
                              className="border-slate-200 focus-visible:ring-emerald-500 bg-white resize-none"
                              placeholder="Type SMS message here..."
                              rows={3}
                            />
                            <p className="text-xs text-slate-400">Keep it under 160 characters for a single SMS.</p>
                          </div>
                        )}
                        
                        {/* Placeholder for Add to Segment / Coupon config if needed */}
                        {(action.type === "ADD_TO_SEGMENT" || action.type === "ASSIGN_COUPON") && (
                          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 p-3 rounded-md border border-amber-100 text-sm font-medium">
                            <AlertCircle className="h-4 w-4" />
                            Configuration for {action.type.replace(/_/g, ' ')} will be saved automatically based on context.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
            form="automation-form" 
            type="submit" 
            disabled={loading}
            className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-md shadow-emerald-200 border-0"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving Rule...
              </>
            ) : (
              "Save Automation Rule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}