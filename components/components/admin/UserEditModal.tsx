"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DialogFooter } from "@/components/ui/dialog"
import { useToast } from "../../../../hooks/use-toast"
import type { User } from "../../../app/type/index"

interface UserEditModalProps {
  user: User
  onSuccess: () => void
  onClose: () => void
}

export function UserEditModal({ user, onSuccess, onClose }: UserEditModalProps) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone)
  const [role, setRole] = useState(user.role)
  const [status, setStatus] = useState(user.status)
  const [isVerified, setIsVerified] = useState(user.isVerified)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    setName(user.name)
    setEmail(user.email)
    setPhone(user.phone)
    setRole(user.role)
    setStatus(user.status)
    setIsVerified(user.isVerified)
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          phone,
          role,
          status,
          isVerified,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to update user")
      }

      toast({
        title: "User Updated",
        description: `User ${name} has been successfully updated.`,
      })
      onSuccess()
      onClose()
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "There was an error updating the user.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pt-4">
      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-slate-700 font-semibold ml-1">Full Name</Label>
        <Input 
          id="name" 
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          required 
          className="h-11 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all shadow-sm"
        />
      </div>
      
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-slate-700 font-semibold ml-1">Email Address</Label>
        <Input 
          id="email" 
          type="email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
          className="h-11 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all shadow-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone" className="text-slate-700 font-semibold ml-1">Phone Number</Label>
        <Input 
          id="phone" 
          value={phone} 
          onChange={(e) => setPhone(e.target.value)} 
          className="h-11 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 transition-all shadow-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="role" className="text-slate-700 font-semibold ml-1">Role</Label>
          <Select value={role} onValueChange={(value: User["role"]) => setRole(value)}>
            <SelectTrigger id="role" className="h-11 rounded-xl bg-slate-50/50 border-slate-200 focus:ring-emerald-500 focus:bg-white shadow-sm">
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent className="bg-white rounded-xl shadow-lg border-slate-100">
              <SelectItem value="CUSTOMER">Customer</SelectItem>
              <SelectItem value="VENDOR">Vendor</SelectItem>
              <SelectItem value="RIDER">Rider</SelectItem>
              <SelectItem value="WHOLESALER">Wholesaler</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status" className="text-slate-700 font-semibold ml-1">Status</Label>
          <Select value={status} onValueChange={(value: User["status"]) => setStatus(value)}>
            <SelectTrigger id="status" className="h-11 rounded-xl bg-slate-50/50 border-slate-200 focus:ring-emerald-500 focus:bg-white shadow-sm">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent className="bg-white rounded-xl shadow-lg border-slate-100">
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center space-x-3 bg-slate-50/50 p-4 rounded-xl border border-slate-100 mt-2">
        <input
          type="checkbox"
          id="isVerified"
          checked={isVerified}
          onChange={(e) => setIsVerified(e.target.checked)}
          className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer"
        />
        <Label htmlFor="isVerified" className="text-sm font-semibold text-slate-700 cursor-pointer">
          User is officially verified
        </Label>
      </div>

      <DialogFooter className="pt-6 border-t border-slate-100 mt-6">
        <Button type="button" variant="ghost" onClick={onClose} className="h-11 rounded-xl font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100">
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="h-11 px-8 rounded-xl font-bold text-white border-0 bg-gradient-to-tr from-green-500 to-emerald-600 shadow-md shadow-green-200 hover:shadow-green-300 hover:-translate-y-0.5 transition-all">
          {loading ? (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Saving...</span>
            </div>
          ) : (
            "Save Changes"
          )}
        </Button>
      </DialogFooter>
    </form>
  )
}