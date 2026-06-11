"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Users, ShoppingCart, DollarSign, Truck, Settings,
  MessageSquare, BarChart, Shield, Briefcase, Bell, FileText,
  StoreIcon as BuildingStorefront, Building2, Car, Pill, Utensils, ShoppingBag,
  Handshake, ClipboardCheck, ScrollText, Globe, HelpCircle, Tag, Wrench,
  ChevronDown, ChevronLeft, ChevronRight, LogOut, FolderTree, Dot, Circle,
  Key,
  User,
  Code2,
  Trophy,
  SlidersHorizontal,
  Database,
  MapPinned,
  Home,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { requiredFeatureForPath, resolveAdminFeatures, type AdminFeature } from "@/lib/admin-access"

// --- Helper: Check if item or its children are active ---
const isItemActive = (item: any, pathname: string): boolean => {
  if (item.href === pathname) return true
  if (item.subItems) {
    return item.subItems.some((child: any) => isItemActive(child, pathname))
  }
  return false
}

/** Pending tasks for a menu node: uses API aggregate when present, else sums children. */
function computePendingBadge(item: any, counts: Record<string, number>): number {
  if (item.subItems?.length) {
    const childSum = item.subItems.reduce(
      (acc: number, child: any) => acc + computePendingBadge(child, counts),
      0
    )
    if (item.href && item.href !== "#") {
      const self = counts[item.href] ?? 0
      if (self > 0) return self
      return childSum
    }
    return childSum
  }
  if (!item.href || item.href === "#") return 0
  return counts[item.href] ?? 0
}

// --- Component: Recursive Menu Item ---
const MenuItem = ({ 
  item, 
  level = 0, 
  isCollapsed, 
  onExpand,
  counts = {},
}: { 
  item: any, 
  level?: number, 
  isCollapsed: boolean, 
  onExpand: () => void,
  counts?: Record<string, number>,
}) => {
  const pathname = usePathname() ?? ""
  const [isOpen, setIsOpen] = useState(false)
  const hasSubItems = item.subItems && item.subItems.length > 0
  const isActive = isItemActive(item, pathname)
  const isExactActive = item.href === pathname

  // Auto-expand if a child is active
  useEffect(() => {
    if (isActive && hasSubItems) {
      setIsOpen(true)
    }
  }, [pathname, isActive, hasSubItems])

  const toggleOpen = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (isCollapsed) {
      onExpand() // If collapsed, expand the whole sidebar first
      setIsOpen(true)
    } else {
      setIsOpen(!isOpen)
    }
  }

  // --- Beautiful Spaced UI Classes ---
  const baseClasses = "w-full flex items-center p-2 mb-1.5 rounded-[12px] transition-all duration-300 ease-out group relative select-none outline-none cursor-pointer"
  
  // Clean active background for the whole row
  const activeClasses = isExactActive 
    ? "bg-emerald-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] ring-1 ring-emerald-500/10" 
    : "hover:bg-slate-50/80"
  
  // Highlight parent row subtly if child is active
  const parentActiveClasses = (isActive && !isExactActive && level === 0)
    ? "bg-slate-50 shadow-sm ring-1 ring-slate-100" 
    : ""

  // Title attribute acts as a native tooltip when sidebar is collapsed
  const titleAttr = isCollapsed ? item.name : undefined

  const pendingBadge = computePendingBadge(item, counts)

  return (
    <li className="relative">
      <Link 
        href={hasSubItems ? "#" : item.href}
        onClick={hasSubItems ? toggleOpen : undefined}
        title={titleAttr}
        className={cn(
          baseClasses, 
          activeClasses, 
          parentActiveClasses,
          isCollapsed && level === 0 ? "justify-center px-0 py-2.5" : ""
        )}
      >
        <div className="flex items-center w-full">
          
          {/* HIGHLY VISUAL ICONS WITH CONTAINERS */}
          <div className={cn(
            "relative flex items-center justify-center shrink-0 rounded-[10px] transition-all duration-300",
            // Give main level items a pronounced box, sub-items just the icon
            level === 0 ? "h-9 w-9 bg-white shadow-sm border border-slate-100 group-hover:border-emerald-200 group-hover:shadow-md" : "h-6 w-6",
            // Active state makes the box pop with color
            (isExactActive && level === 0) ? "bg-gradient-to-b from-emerald-500 to-emerald-600 border-emerald-600 shadow-emerald-500/30" : "",
            (isActive && !isExactActive && level === 0) ? "border-emerald-200 bg-emerald-50/50" : "",
            // Spacing
            !isCollapsed || level > 0 ? "mr-3.5" : "mx-auto"
          )}>
            {level === 0 ? (
               <item.icon 
                  className={cn(
                    "h-5 w-5 transition-colors duration-300", 
                    isExactActive ? "text-white" : (isActive ? "text-emerald-600" : "text-slate-500 group-hover:text-emerald-600")
                  )} 
                  strokeWidth={2.2} 
               />
            ) : level === 1 ? (
               <item.icon 
                  className={cn(
                    "h-[17px] w-[17px] transition-colors", 
                    isExactActive ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-500"
                  )} 
                  strokeWidth={2.2} 
               />
            ) : (
               <Dot className={cn("h-6 w-6 -ml-1 transition-colors", isExactActive ? "text-emerald-600" : "text-slate-400")} strokeWidth={3} /> 
            )}
            
            {/* Collapsed Glowing Dot Indicator */}
            {pendingBadge > 0 && isCollapsed && level === 0 && (
              <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 border-2 border-white shadow-sm" aria-hidden />
            )}
          </div>
          
          {/* Text & Right-Aligned Badges Wrapper */}
          <div className={cn(
            "flex items-center justify-between flex-1 overflow-hidden transition-all duration-300",
            isCollapsed ? "opacity-0 w-0 hidden" : "opacity-100"
          )}>
            
            {/* Text on the Left */}
            <span className={cn(
              "truncate min-w-0 text-[14px]",
              level === 0 ? "font-bold tracking-tight" : "font-medium text-[13.5px]",
              isExactActive ? "text-emerald-700" : "text-slate-700 group-hover:text-slate-900"
            )}>
              {item.name}
            </span>

            {/* BADGES AND CHEVRON TO THE EXTREME RIGHT */}
            <div className="flex items-center gap-2 ml-auto pl-2 shrink-0">
              {pendingBadge > 0 && (
                <span
                  className={cn(
                    "min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-black flex items-center justify-center leading-none transition-all duration-300 shadow-sm",
                    "bg-gradient-to-tr from-rose-500 to-red-500 text-white shadow-rose-500/30" 
                  )}
                  title={`${pendingBadge} pending`}
                >
                  {pendingBadge > 99 ? "99+" : pendingBadge}
                </span>
              )}

              {hasSubItems && (
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform duration-300",
                    isExactActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600",
                    isOpen && "rotate-180 text-emerald-600"
                  )}
                  strokeWidth={2.5}
                />
              )}
            </div>

          </div>
        </div>
      </Link>

      {/* Sleek Nested Rendering */}
      {hasSubItems && !isCollapsed && (
        <div className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          isOpen ? "max-h-[800px] opacity-100 mt-1 mb-2" : "max-h-0 opacity-0"
        )}>
          <ul className={cn(
            "relative flex flex-col space-y-0.5",
            // The line aligns perfectly with the center of the level 0 icon box
            level === 0 ? "pl-[44px] before:absolute before:left-[25px] before:top-0 before:bottom-3 before:w-[2px] before:bg-slate-100 before:rounded-full" : "pl-6"
          )}>
            {item.subItems.map((subItem: any, idx: number) => (
              <MenuItem 
                key={idx} 
                item={subItem} 
                level={level + 1} 
                isCollapsed={isCollapsed} 
                onExpand={onExpand}
                counts={counts}
              />
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

// --- Props Type ---
interface AdminSidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  isMobileOpen: boolean;
}

// --- Main Sidebar Component ---
export default function AdminSidebar({ isCollapsed, onToggle, isMobileOpen }: AdminSidebarProps) {
  const router = useRouter()
  
  // Calculate effective collapsed state (never collapse on mobile)
  const effectiveCollapsed = isCollapsed && !isMobileOpen;

  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({})
  const [grants, setGrants] = useState<string[] | null>(null)
  const [modules, setModules] = useState<string[] | null>(null)
  const [accessRole, setAccessRole] = useState<string | null>(null)
  const [profileImage, setProfileImage] = useState<string>("")
  const [adminName, setAdminName] = useState<string>("Admin User")
  const [adminEmail, setAdminEmail] = useState<string>("admin@kilo.com")

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch("/api/admin/pending-badges", { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.counts && typeof data.counts === "object") {
          setPendingCounts(data.counts)
        }
      } catch {
        /* ignore */
      }
    }
    load()
    const t = setInterval(load, 120000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadProfile = async () => {
      try {
        const res = await fetch("/api/admin/profile", { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (typeof data?.avatar === "string") setProfileImage(data.avatar)
        if (typeof data?.name === "string" && data.name.trim()) setAdminName(data.name.trim())
        if (typeof data?.email === "string" && data.email.trim()) setAdminEmail(data.email.trim())
      } catch {
        /* ignore */
      }
    }
    void loadProfile()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadAccess = async () => {
      try {
        const res = await fetch("/api/admin/access/me", { credentials: "include" })
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && Array.isArray(data?.grants)) {
          setGrants(data.grants.map((x: any) => String(x)))
          setModules(Array.isArray(data?.modules) ? data.modules.map((x: any) => String(x).toUpperCase()) : [])
          setAccessRole(typeof data?.accessRole === "string" ? data.accessRole.toUpperCase() : null)
        }
      } catch {
        /* ignore */
      }
    }
    void loadAccess()
    return () => {
      cancelled = true
    }
  }, [])

  const navItems = [
    { name: "Dashboard", href: "/admin", icon: LayoutDashboard, feature: "dashboard.view" as AdminFeature },
    { name: "User Management", href: "/admin/users", icon: Users, feature: "users.manage" as AdminFeature },
    { name: "Suppliers", href: "/admin/wholesalers", icon: BuildingStorefront, feature: "users.manage" as AdminFeature },
    { name: "KYC Management", href: "/admin/kyc", icon: ClipboardCheck, permission: "VENDOR_APPROVAL" },
    { name: "Orders", href: "/admin/orders", icon: ShoppingCart, feature: "orders.view" as AdminFeature },

    { name: "Payments", href: "/admin/payments", icon: DollarSign, feature: "payments.manage" as AdminFeature,
      subItems: [
        { name: "All Payments", href: "/admin/payments", icon: DollarSign },
        { name: "Refunds", href: "/admin/payments/refunds", icon: DollarSign },
        { name: "Payout bank accounts", href: "/admin/payments/bank-accounts", icon: Building2 },
      ]
    },
    {
      name: "Vendor Management",
      href: "/admin/modules/vendor",
      icon: BuildingStorefront,
      feature: "vendors.manage" as AdminFeature,
      subItems: [
        { name: "Auto Parts", href: "/admin/modules/auto-parts", icon: Car, module: "AUTO_PARTS" },
        { name: "Pharmacy", href: "/admin/modules/pharmacy", icon: Pill, module: "PHARMACY" },
        { 
          name: "Food Service", 
          href: "/admin/modules/food/", 
          icon: Utensils,  
          subItems: [
            { name: "All Restaurants", href: "/admin/modules/food/", icon: Utensils, module: "FOOD" },
            { name: "Settings", href: "/admin/modules/food/settings", icon: Settings, module: "FOOD" },
          ]
        },
        { name: "Grocery", href: "/admin/modules/grocery", icon: ShoppingBag, module: "GROCERY" },
      
        {name: "Booking Properties", href: "/admin/modules/property", icon: Home, subItems: [
          { name: "All Booking", href: "/admin/modules/property", icon: Home, module: "PROPERTY" },
          { name: "Configuration", href: "/admin/modules/property/configuration", icon: Settings, module: "PROPERTY" },
        ]},
        { name: "Categories", href: "/admin/categories", icon: FolderTree },
      ],
    },
    {
      name: "Riders",
      href: "/admin/modules/rider",
      icon: Truck,
      feature: "riders.manage" as AdminFeature,
      subItems: [
        { name: "Live bookings map", href: "/admin/modules/rider/bookings-monitor", icon: MapPinned },
        { name: "Locked accounts", href: "/admin/modules/rider/locked-accounts", icon: Shield },
        { name: "Peak bonus analytics", href: "/admin/modules/rider/bonus-analytics", icon: Trophy },
        { name: "Bonus settings", href: "/admin/modules/rider/bonus-settings", icon: SlidersHorizontal },
        { name: "Ride Settings", href: "/admin/ride-types", icon: Settings },
      ],
    },
    {
      name: "Mechanics",
      href: "/admin/modules/mechanic",
      icon: Wrench,
      permission: "VENDOR_APPROVAL",
    },
    {
      name: "Promo Codes",
      href: "/admin/promo-codes",
      icon: Tag,
      feature: "promos.manage" as AdminFeature,
    },
    {
      name: "Commission Management",
      href: "/admin/commission",
      icon: DollarSign,
      feature: "commission.manage" as AdminFeature,
    },
    {
      name: "Medicine Management",
      href: "/admin/medicines",
      icon: Pill,
      subItems: [
        { name: "All Medicines", href: "/admin/medicines", icon: Pill },
        { name: "Catalog suggestions", href: "/admin/medicines/wholesaler-suggestions", icon: ClipboardCheck },
        { name: "Illness Categories", href: "/admin/illness-categories", icon: FolderTree },
        { name: "Medicine Origins", href: "/admin/medicine-origins", icon: Globe },
      ]
    },
    {
      name: "Marketing Management",
      href: "/admin/marketing",
      icon: FileText,
    },
    {
      name: "Hr Management",
      href: "/admin/hr",
      icon: User,
      feature: "hr.manage" as AdminFeature,
      subItems: [
        { name: "Staff Management", href: "/admin/hr", icon: User, feature: "hr.manage" as AdminFeature },
        { name: "All Employees", href: "/admin/employees", icon: User, feature: "employees.manage" as AdminFeature },
        
      ]
    },
    {
      name: "Money Transfer",
      href: "/admin/money-app-admin",
      icon: DollarSign,
      permission: "PAYMENT_MANAGEMENT",
      subItems: [
        { name: "Dashboard", href: "/admin/money-app-admin", icon: LayoutDashboard },
        { name: "Treasury", href: "/admin/money-app-admin/treasury", icon: DollarSign },
        { name: "Transactions", href: "/admin/money-app-admin/transactions", icon: ScrollText },
        { name: "Support Cases", href: "/admin/money-app-admin/cases", icon: ClipboardCheck },
        { name: "Payouts", href: "/admin/money-app-admin/payouts", icon: Handshake },
        { name: "Reports", href: "/admin/money-app-admin/reports", icon: BarChart },
        { name: "Security Log", href: "/admin/money-app-admin/audit", icon: Shield },
        { name: "Edit records", href: "/admin/money-app-admin/records", icon: Database },
        { name: "Configuration", href: "/admin/money-app-admin/config", icon: Settings },
        { name: "VTpass & bills", href: "/admin/money-app-admin/vtpass", icon: Database },
        { name: "Bank Verification", href: "/admin/money-app-admin/kyc", icon: Shield },
      ]
    },
    {
      name: "Special Offers",
      href: "/admin/special-offers",
      icon: Tag,
      permission: "MARKETING_CAMPAIGNS",
      subItems: [
        { name: "All Offers", href: "/admin/special-offers", icon: Tag },
        { name: "Pending Approval", href: "/admin/special-offers/pending", icon: ClipboardCheck },
      ]
    },
    {
      name: "Vendor Offers",
      href: "/admin/vendor-offers",
      icon: ClipboardCheck,
      permission: "VENDOR_APPROVAL",
      subItems: [
        { name: "Pending Mystery/Flash", href: "/admin/vendor-offers", icon: ClipboardCheck },
      ]
    },
    {
      name: "Notifications",
      href: "/admin/notifications",
      icon: Bell,
      feature: "notifications.manage" as AdminFeature,
      permission: "NOTIFICATIONS_MANAGEMENT",
    },
    { 
      name: "Support", 
      href: "/admin/complaints", 
      icon: MessageSquare, 
      permission: "COMPLAINT_HANDLING",
      feature: "complaints.manage" as AdminFeature,
      subItems: [
        { name: "Complaints", href: "/admin/complaints", icon: MessageSquare, permission: "COMPLAINT_HANDLING", feature: "complaints.manage" as AdminFeature },
        { name: "FAQs", href: "/admin/faqs", icon: HelpCircle, permission: "COMPLAINT_HANDLING", feature: "complaints.manage" as AdminFeature },
      ]
    },
    
    { name: "Reports", href: "/admin/reports", icon: BarChart, feature: "reports.view" as AdminFeature },
    {
      name: "Developer",
      href: "/admin/developer/pos",
      icon: Code2,
      subItems: [
        {
          name: "POS & Partner APIs",
          href: "/admin/developer/pos",
          icon: Key,
        },
      ],
    },
    {
        name: "Settings",
        href: "/admin/settings",
        icon: Settings,
        subItems: [
          { name: "General", href: "/admin/settings", icon: Settings },
          { name: "Security", href: "/admin/security", icon: Shield },
          { name: "Audit Logs", href: "/admin/auditlog", icon: FileText },
          { name: "Account Deletion Logs", href: "/admin/account-deletion-logs", icon: FileText },
          { name: "Email Templates", href: "/admin/templates", icon: FileText },
          { name: "Ai configuration", href: "/admin/ai-config", icon: Key },
        ],
    },
  ]

  const grantedFeatures = resolveAdminFeatures(grants || [], undefined)
  const moduleSet = new Set((modules || []).map((m) => String(m).toUpperCase()))
  const LEGACY_PERMISSION_TO_FEATURE: Record<string, AdminFeature> = {
    USER_MANAGEMENT: "users.manage",
    VENDOR_APPROVAL: "vendors.manage",
    PAYMENT_MANAGEMENT: "payments.manage",
    COMPLAINT_HANDLING: "complaints.manage",
    MARKETING_CAMPAIGNS: "promos.manage",
    NOTIFICATIONS_MANAGEMENT: "notifications.manage",
    ANALYTICS_VIEW: "reports.view",
    SYSTEM_SETTINGS: "settings.manage",
    COMMISSION_SETTINGS: "commission.manage",
  }
  const canAccess = (item: any) => {
    if (!grants) return true
    if (accessRole === "SUPER_ADMIN") return true
    if (item.permission && !grants.includes(item.permission)) return false
    if (item.permission && LEGACY_PERMISSION_TO_FEATURE[item.permission]) {
      const mappedFeature = LEGACY_PERMISSION_TO_FEATURE[item.permission]
      if (!grants.includes(item.permission) && !grantedFeatures.includes(mappedFeature)) return false
    }
    if (item.module && !moduleSet.has(String(item.module).toUpperCase())) return false
    const routeFeature = item.feature || (item.href ? requiredFeatureForPath(item.href) : null)
    if (routeFeature && !grantedFeatures.includes(routeFeature)) return false
    return true
  }

  const filterByAccess = (items: any[]): any[] =>
    items
      .map((item) => ({
        ...item,
        subItems: item.subItems ? filterByAccess(item.subItems) : undefined,
      }))
      .filter((item) => {
        const ownAllowed = canAccess(item)
        if (!item.subItems) return ownAllowed
        return ownAllowed || item.subItems.length > 0
      })
  const handleAdminSignOut = async () => {
    try {
      await fetch("/api/auth/signout", {
        method: "POST",
        credentials: "include",
      })
    } catch (error) {
      console.error("Admin signout error:", error)
    }
    finally {
      localStorage.removeItem("adminUser")
      router.replace("/admin/login")
    }
  }

  const visibleNavItems = filterByAccess(navItems)

  return (
    <aside 
      className={cn(
        "bg-[#FDFDFD] h-screen flex flex-col border-r border-slate-200/70 shadow-[0_0_50px_-12px_rgba(0,0,0,0.05)] fixed left-0 top-0 z-50 transition-all duration-300 ease-in-out",
        // Desktop widths
        isCollapsed ? "lg:w-[88px]" : "lg:w-[300px]",
        // Mobile visibility
        isMobileOpen ? "translate-x-0 w-[300px]" : "-translate-x-full lg:translate-x-0"
      )}
    >
      
      {/* Floating Toggle Button */}
      <button
        onClick={onToggle}
        className="hidden lg:flex absolute -right-4 top-8 h-8 w-8 items-center justify-center bg-white border border-slate-200 rounded-full text-slate-500 hover:text-emerald-600 hover:border-emerald-300 shadow-sm hover:shadow-md transition-all z-50 focus:outline-none"
      >
        {isCollapsed ? <ChevronRight className="h-[15px] w-[15px]" strokeWidth={2.5} /> : <ChevronLeft className="h-[15px] w-[15px]" strokeWidth={2.5} />}
      </button>

      {/* High-End Brand Header */}
      <div className={cn("h-[90px] flex items-center shrink-0 transition-all duration-300 relative", effectiveCollapsed ? "justify-center px-2" : "px-7")}>
        <div className="absolute bottom-0 left-7 right-7 h-[1px] bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
        <div className="flex items-center gap-4 w-full">
          <div className="w-[42px] h-[42px] shrink-0 bg-gradient-to-tr from-slate-900 to-slate-800 rounded-[14px] flex items-center justify-center shadow-lg shadow-slate-900/10 relative overflow-hidden ring-1 ring-slate-900/5">
            <span className="text-white font-black text-[22px] tracking-tighter relative z-10">K</span>
          </div>
          <div className={cn("flex flex-col whitespace-nowrap overflow-hidden transition-all duration-300", effectiveCollapsed ? "opacity-0 w-0" : "opacity-100 w-auto")}>
            <h2 className="text-[18px] font-black text-slate-900 tracking-tight leading-none mb-1.5">Kilo Admin</h2>
            <span className="text-[10px] uppercase font-extrabold text-emerald-500 tracking-[0.15em]">Super App Panel</span>
          </div>
        </div>
      </div>

      {/* Scrollable Navigation - Invisible sleek scrollbar */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-6 px-4 hover:overflow-y-auto [&::-webkit-scrollbar]:w-[5px] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:rounded-full">
        <ul className="flex flex-col pb-24">
          {visibleNavItems.map((item, idx) => (
            <MenuItem 
              key={idx} 
              item={item} 
              isCollapsed={effectiveCollapsed} 
              onExpand={onToggle}
              counts={pendingCounts}
            />
          ))}
        </ul>
      </div>

      {/* Floating User Profile Card */}
      <div className={cn("mx-4 mb-6 p-2 bg-white border border-slate-200/80 rounded-[16px] shadow-sm flex flex-col transition-all duration-300 shrink-0", effectiveCollapsed ? "items-center mx-3" : "")}>
        <div className={cn("flex items-center mb-2 transition-all", effectiveCollapsed ? "justify-center p-1" : "gap-3.5 px-2 py-1.5")}>
            {profileImage ? (
              <img
                src={profileImage}
                alt="Admin avatar"
                className="h-10 w-10 shrink-0 rounded-[12px] object-cover ring-1 ring-slate-200"
              />
            ) : (
              <div className="h-10 w-10 shrink-0 rounded-[12px] bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-[12px] ring-1 ring-slate-200">
                {adminName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("") || "AD"}
              </div>
            )}
            <div className={cn("flex flex-col whitespace-nowrap overflow-hidden transition-all duration-300", effectiveCollapsed ? "opacity-0 w-0 hidden" : "opacity-100")}>
                <span className="text-[14px] font-bold text-slate-900 leading-tight">{adminName}</span>
                <span className="text-[12px] font-semibold text-slate-400 mt-1">{adminEmail}</span>
            </div>
        </div>
        
        {effectiveCollapsed ? (
          <Button 
            variant="ghost" 
            className="w-full h-10 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center rounded-[10px] transition-colors"
            title="Logout"
            onClick={handleAdminSignOut}
          >
            <LogOut className="h-5 w-5" strokeWidth={2.5} />
          </Button>
        ) : (
          <Button 
            variant="ghost" 
            className="w-full justify-center font-bold text-slate-500 hover:text-red-600 hover:bg-red-50 h-10 rounded-[10px] transition-colors"
            onClick={handleAdminSignOut}
          >
            <LogOut className="h-4 w-4 mr-2.5 shrink-0" strokeWidth={2.5} />
            Logout Account
          </Button>
        )}
      </div>
    </aside>
  )
}