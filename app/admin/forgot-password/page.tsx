"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Mail, CheckCircle, AlertCircle } from "lucide-react"
import Link from "next/link"

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess(true)
      } else {
        setError(data.message || "Failed to send reset email. Please try again.")
      }
    } catch (error) {
      console.error("Forgot password error:", error)
      setError("Network error. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 sm:p-8 relative overflow-hidden">
      
      {/* Ambient Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-emerald-200/40 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[50%] h-[50%] rounded-full bg-green-200/40 blur-[100px]" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-0 shadow-2xl shadow-emerald-900/5 rounded-[2rem] bg-white/90 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {success ? (
          /* ================= SUCCESS STATE ================= */
          <>
            <CardHeader className="space-y-3 pb-6 pt-10 text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-green-500 to-emerald-600 shadow-lg shadow-green-200 rounded-2xl flex items-center justify-center mb-2 transform transition-all duration-300 hover:scale-105">
                <CheckCircle className="h-7 w-7 text-white" />
              </div>
              <CardTitle className="text-3xl font-extrabold tracking-tight text-slate-900">
                Check Your Email
              </CardTitle>
              <CardDescription className="text-slate-500 text-base font-medium">
                We've sent a password reset link to your email address
              </CardDescription>
            </CardHeader>
            <CardContent className="px-8 pb-10 space-y-6 animate-in fade-in zoom-in-95 duration-300">
              <Alert className="rounded-xl bg-emerald-50/70 border-emerald-200 text-emerald-800 shadow-sm">
                <Mail className="h-5 w-5 !text-emerald-600" />
                <AlertDescription className="font-medium ml-1 leading-relaxed">
                  If an account with email <strong className="text-emerald-900">{email}</strong> exists, you will receive a password reset link shortly.
                </AlertDescription>
              </Alert>

              <div className="space-y-3 text-sm font-medium text-slate-500 bg-slate-50/50 p-5 rounded-xl border border-slate-100">
                <p className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /> 
                  Check your spam folder if you don't see the email
                </p>
                <p className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /> 
                  The link will expire in 1 hour
                </p>
                <p className="flex items-center gap-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" /> 
                  You can request a new link if needed
                </p>
              </div>

              <div className="flex flex-col space-y-3 pt-2">
                <Button
                  onClick={() => {
                    setSuccess(false)
                    setEmail("")
                  }}
                  variant="outline"
                  className="w-full h-12 rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-all"
                >
                  Send Another Email
                </Button>

                <Link href="/admin/login" className="w-full">
                  <Button variant="ghost" className="w-full h-12 rounded-xl font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Login
                  </Button>
                </Link>
              </div>
            </CardContent>
          </>
        ) : (
          /* ================= REQUEST STATE ================= */
          <>
            <CardHeader className="space-y-3 pb-6 pt-10 text-center">
              <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-green-500 to-emerald-600 shadow-lg shadow-green-200 rounded-2xl flex items-center justify-center mb-2 transform transition-all duration-300 hover:scale-105 hover:-rotate-3">
                <Mail className="h-7 w-7 text-white" />
              </div>
              <CardTitle className="text-3xl font-extrabold tracking-tight text-slate-900">
                Forgot Password
              </CardTitle>
              <CardDescription className="text-slate-500 text-base font-medium px-4">
                Enter your email address and we'll send you a link to reset your password
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
                      type="email"
                      placeholder="admin@kilosuperapp.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (error) setError("")
                      }}
                      className="pl-12 h-12 rounded-xl bg-slate-50/50 border-slate-200 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:border-transparent transition-all"
                      required
                      disabled={loading}
                    />
                  </div>
                </div>

                <div className="pt-2 space-y-3">
                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-bold text-white border-0 rounded-xl bg-gradient-to-tr from-green-500 to-emerald-600 shadow-lg shadow-green-200 hover:shadow-green-300 hover:opacity-90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
                    disabled={!email || loading}
                  >
                    {loading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Sending Link...</span>
                      </div>
                    ) : (
                      "Send Reset Link"
                    )}
                  </Button>

                  <Link href="/admin/login" className="block w-full">
                    <Button variant="ghost" className="w-full h-12 rounded-xl font-semibold text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </form>

              <div className="mt-8 text-center text-sm font-medium text-slate-400">
                <p>© {new Date().getFullYear()} Kilo Super App. All rights reserved.</p>
              </div>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}