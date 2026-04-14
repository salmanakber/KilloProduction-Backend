"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react"
import Link from "next/link"

export default function AdminLoginPage() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    // Clear error when user starts typing
    if (error) setError("")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      })

      const data = await response.json()
      if (response.ok) {
        // Store admin token
        localStorage.setItem("adminToken", data.token)
        localStorage.setItem("adminUser", JSON.stringify(data.user))
        console.log(data)

        // Redirect to admin dashboard
        router.push("/admin")
      } else {
        setError(data.message || "Login failed. Please try again.")
      }
    } catch (error) {
      console.error("Login error:", error)
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  const isFormValid = formData.email && formData.password

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 sm:p-8 relative overflow-hidden">
      
      {/* Ambient Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-emerald-200/40 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[50%] h-[50%] rounded-full bg-green-200/40 blur-[100px]" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-0 shadow-2xl shadow-emerald-900/5 rounded-[2rem] bg-white/90 backdrop-blur-xl overflow-hidden">
        <CardHeader className="space-y-3 pb-6 pt-10 text-center">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-green-500 to-emerald-600 shadow-lg shadow-green-200 rounded-2xl flex items-center justify-center mb-2 transform transition-all duration-300 hover:scale-105 hover:-rotate-3">
            <Lock className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-3xl font-extrabold tracking-tight text-slate-900">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-slate-500 text-base font-medium">
            Sign in to access the Kilo Super App admin panel
          </CardDescription>
        </CardHeader>
        
        <CardContent className="px-8 pb-10">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive" className="rounded-xl bg-red-50 border-red-200 text-red-600 animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="font-medium">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-semibold ml-1">Email Address</Label>
              <div className="relative group">
                <Mail className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors duration-200" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@kilosuperapp.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="pl-12 h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-semibold ml-1">Password</Label>
              <div className="relative group">
                <Lock className="absolute left-4 top-3.5 h-5 w-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors duration-200" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="pl-12 pr-12 h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent transition-all"
                  required
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-10 w-10 p-0 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-emerald-600 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center space-x-2">
                <input 
                  id="remember" 
                  type="checkbox" 
                  className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer" 
                />
                <Label htmlFor="remember" className="text-sm font-medium text-slate-600 cursor-pointer">
                  Remember me
                </Label>
              </div>
              <Link href="/admin/forgot-password" className="text-sm font-semibold text-emerald-600 hover:text-emerald-500 transition-colors">
                Forgot password?
              </Link>
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 mt-2 text-base font-bold text-white border-0 rounded-xl bg-gradient-to-tr from-green-500 to-emerald-600 shadow-lg shadow-green-200 hover:shadow-green-300 hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
              disabled={!isFormValid || loading}
            >
              {loading ? (
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-8 text-center text-sm font-medium text-slate-400">
            <p>© {new Date().getFullYear()} Kilo Super App. All rights reserved.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}