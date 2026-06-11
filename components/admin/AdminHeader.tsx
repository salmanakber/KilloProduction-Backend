"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, Search, Settings, User, LogOut, Shield, ChevronDown, Menu, X } from "lucide-react"

interface Notification {
  id: string
  title: string
  message: string
  type: "INFO" | "WARNING" | "ERROR" | "SUCCESS"
  isRead: boolean
  createdAt: string
  actionUrl?: string
  data?: any
}

interface AdminHeaderProps {
  onMenuToggle?: () => void
  isMobileMenuOpen?: boolean
}

// Navigation items from AdminSidebar
const getAllNavItems = () => {
  const navItems = [
    { name: "Dashboard", href: "/admin", icon: "LayoutDashboard" },
    { name: "User Management", href: "/admin/users", icon: "Users" },
    { name: "KYC Management", href: "/admin/kyc", icon: "ClipboardCheck" },
    { name: "Order Management", href: "/admin/orders", icon: "ShoppingCart" },
    { name: "Payment & Finance", href: "/admin/payments", icon: "DollarSign" },
    { name: "Rider Management", href: "/admin/modules/rider", icon: "Truck" },
    { name: "Ride Type Management", href: "/admin/ride-types", icon: "Car" },
    { name: "Vendor Management", href: "/admin/modules/pharmacy", icon: "BuildingStorefront" },
    { name: "Auto Parts", href: "/admin/modules/auto-parts", icon: "Car" },
    { name: "Pharmacy", href: "/admin/modules/pharmacy", icon: "Pill" },
    { name: "Food", href: "/admin/modules/food", icon: "Utensils" },
    { name: "Grocery", href: "/admin/modules/grocery", icon: "ShoppingBag" },
    { name: "Medicine Management", href: "/admin/medicines", icon: "Pill" },
    { name: "Medicine Origins", href: "/admin/medicine-origins", icon: "Globe" },
    { name: "Illness Categories", href: "/admin/illness-categories", icon: "Globe" },
    { name: "Wholesaler Management", href: "/admin/wholesalers", icon: "Handshake" },
    { name: "Special Offers", href: "/admin/special-offers", icon: "ScrollText" },
    { name: "HR Management", href: "/admin/hr", icon: "Briefcase" },
    { name: "Marketing Intelligence", href: "/admin/marketing", icon: "BarChart" },
    { name: "Notifications", href: "/admin/notifications", icon: "Bell" },
    { name: "Support Tickets", href: "/admin/complaints", icon: "MessageSquare" },
    { name: "FAQ Management", href: "/admin/faqs", icon: "HelpCircle" },
    { name: "Template Management", href: "/admin/templates", icon: "FileText" },
    { name: "Reports & Analytics", href: "/admin/reports", icon: "FileText" },
    { name: "Commission Management", href: "/admin/commission", icon: "DollarSign" },
    { name: "Audit Logs", href: "/admin/auditlog", icon: "ScrollText" },
    { name: "Promo Codes", href: "/admin/promo-codes", icon: "Tag" },
    { name: "General Settings", href: "/admin/settings", icon: "Settings" },
    { name: "Firebase Configuration", href: "/admin/firebase-config", icon: "Bell" },
  ]
  return navItems
}

export default function AdminHeader({ onMenuToggle, isMobileMenuOpen }: AdminHeaderProps) {
  const { data: session } = useSession()
  const router = useRouter()
  const [profileImage, setProfileImage] = useState<string>("")
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false)
  const navItems = getAllNavItems()

  useEffect(() => {
    fetchNotifications()
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/admin/profile")
        if (!res.ok) return
        const data = await res.json()
        if (typeof data.avatar === "string") setProfileImage(data.avatar)
      } catch {
        /* ignore */
      }
    }
    void loadProfile()
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/admin/notifications")
      if (response.ok) {
        const data = await response.json()
        console.log("data", data)
        setNotifications(data.notifications)
        
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    }
  }

  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/admin/notifications/${notificationId}/read`, {
        method: "POST",
      })
      setNotifications((prev) =>
        prev.map((notif) => (notif.id === notificationId ? { ...notif, isRead: true } : notif)),
      )
    } catch (error) {
      console.error("Failed to mark notification as read:", error)
    }
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "ERROR":
        return "🔴"
      case "WARNING":
        return "🟡"
      case "SUCCESS":
        return "🟢"
      default:
        return "🔵"
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      // Find matching nav item or redirect to search
      const matchedItem = navItems.find(
        (item) => item.name.toLowerCase() === searchQuery.toLowerCase(),
      )
      if (matchedItem) {
        router.push(matchedItem.href)
      } else {
        router.push(`/admin/search?q=${encodeURIComponent(searchQuery)}`)
      }
      setShowSearchSuggestions(false)
    }
  }

  const filteredSuggestions = navItems.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleSuggestionClick = (href: string) => {
    router.push(href)
    setShowSearchSuggestions(false)
    setSearchQuery("")
  }

  const handleAdminSignOut = async () => {
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      console.error("Admin signout error:", error)
    } finally {
      localStorage.removeItem("adminUser")
      router.replace("/admin/login")
      router.refresh()
    }
  }

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left side - Mobile menu toggle and search */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <form onSubmit={handleSearch} className="hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search users, orders, complaints..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowSearchSuggestions(true)
                }}
                onFocus={() => setShowSearchSuggestions(true)}
                onBlur={() => {
                  // Delay to allow click on suggestion
                  setTimeout(() => setShowSearchSuggestions(false), 200)
                }}
                className="pl-10 pr-4 py-2 w-80 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {showSearchSuggestions && searchQuery && filteredSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  {filteredSuggestions.slice(0, 10).map((item) => (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => handleSuggestionClick(item.href)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
                    >
                      <Search className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-900">{item.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Right side - Notifications and user menu */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-lg hover:bg-gray-100"
            >
              <Bell className="h-5 w-5 text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">No notifications</div>
                  ) : (
                    notifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.id}
                        className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                          !notification.isRead ? "bg-blue-50" : ""
                        }`}
                        onClick={() => {
                          markAsRead(notification.id)
                          if (notification.actionUrl) {
                            router.push(notification.actionUrl)
                          }
                        }}
                      >
                        <div className="flex items-start space-x-3">
                          <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{notification.title}</p>
                            <p className="text-sm text-gray-600 truncate">{notification.message}</p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(notification.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {!notification.isRead && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {notifications.length > 10 && (
                  <div className="p-4 border-t border-gray-200">
                    <button className="w-full text-center text-green-600 hover:text-green-700 text-sm font-medium">
                      View all notifications
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* User menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100"
            >
              {profileImage ? (
                <img src={profileImage} alt="Admin avatar" className="h-8 w-8 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4 text-green-600" />
                </div>
              )}
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-gray-900">{session?.user?.name || "Admin"}</p>
                <p className="text-xs text-gray-500">{session?.user?.email}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                <div className="p-2">
                  <Link href="/admin/profile" className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                    <User className="h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                  <Link href="/admin/settings" className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                  <Link href="/admin/security" className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg">
                    <Shield className="h-4 w-4" />
                    <span>Security</span>
                  </Link>
                  <hr className="my-2" />
                  <button
                    onClick={handleAdminSignOut}
                    className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile search */}
      <form onSubmit={handleSearch} className="md:hidden mt-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setShowSearchSuggestions(true)
            }}
            onFocus={() => setShowSearchSuggestions(true)}
            onBlur={() => {
              setTimeout(() => setShowSearchSuggestions(false), 200)
            }}
            className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          {showSearchSuggestions && searchQuery && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
              {filteredSuggestions.slice(0, 10).map((item) => (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => handleSuggestionClick(item.href)}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Search className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900">{item.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </form>
    </header>
  )
}
