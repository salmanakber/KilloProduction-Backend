"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { SessionProvider } from "next-auth/react"
import { usePathname } from "next/navigation"
import AdminSidebar from "@/components/admin/AdminSidebar"
import AdminHeader from "@/components/admin/AdminHeader"
import { Toaster } from "@/components/ui/toaster"
import { cn } from "@/lib/utils"
import "../globals.css"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const pathname = usePathname()

  // Load collapsed state from cookies on mount
  useEffect(() => {
    setIsMounted(true)
    const cookieValue = document.cookie
      .split("; ")
      .find((row) => row.startsWith("sidebarCollapsed="))
      ?.split("=")[1]
      
    if (cookieValue === "true") {
      setIsCollapsed(true)
    }
  }, [])

  const toggleSidebar = () => {
    const newValue = !isCollapsed
    setIsCollapsed(newValue)
    document.cookie = `sidebarCollapsed=${newValue}; path=/; max-age=31536000`
  }

  // Check if current route is login page
  const isLoginPage = pathname?.startsWith("/admin/login") || pathname?.startsWith("/admin/forgot-password")

  // Completely separate layout for Auth pages
  if (isLoginPage) {
    return (
      <SessionProvider>
        {children}
        <Toaster />
      </SessionProvider>
    )
  }

  return (
    <SessionProvider>
      <div className="min-h-screen bg-slate-50 flex font-sans overflow-hidden">
        
        {/* Controlled Sidebar Component */}
        <AdminSidebar 
          isCollapsed={isCollapsed} 
          onToggle={toggleSidebar}
          isMobileOpen={isMobileMenuOpen}
        />

        {/* Mobile overlay with blur */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40 lg:hidden transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        {/* Main Content Wrapper - dynamically adjusts margin based on sidebar state */}
        <div 
          className={cn(
            "flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out w-full",
            // Apply margins only on desktop, and prevent layout jumps before hydration
            isMounted ? (isCollapsed ? "lg:ml-[80px]" : "lg:ml-[280px]") : "lg:ml-[280px]"
          )}
        >
          <AdminHeader 
            onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
            isMobileMenuOpen={isMobileMenuOpen} 
          />
          
          {/* Main scrollable area */}
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50/50 p-4 sm:p-6 lg:p-8 custom-scrollbar">
            {children}
          </main>
        </div>
      </div>
      <Toaster />
    </SessionProvider>
  )
}