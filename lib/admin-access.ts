export type AdminFeature =
  | "dashboard.view"
  | "users.manage"
  | "orders.view"
  | "payments.manage"
  | "complaints.manage"
  | "riders.manage"
  | "vendors.manage"
  | "promos.manage"
  | "commission.manage"
  | "reports.view"
  | "employees.manage"
  | "hr.manage"
  | "settings.manage"
  | "notifications.manage"
export const FEATURE_ROUTE_RULES: Array<{ prefix: string; feature: AdminFeature }> = [
  { prefix: "/admin/reports", feature: "reports.view" },
  { prefix: "/admin/employees", feature: "employees.manage" },
  { prefix: "/admin/hr", feature: "hr.manage" },
  { prefix: "/admin/commission", feature: "commission.manage" },
  { prefix: "/admin/promo-codes", feature: "promos.manage" },
  { prefix: "/admin/payments", feature: "payments.manage" },
  { prefix: "/admin/orders", feature: "orders.view" },
  { prefix: "/admin/modules/rider", feature: "riders.manage" },
  { prefix: "/admin/modules", feature: "vendors.manage" },
  { prefix: "/admin/users", feature: "users.manage" },
  { prefix: "/admin/complaints", feature: "complaints.manage" },
  { prefix: "/admin/faqs", feature: "complaints.manage" },
  { prefix: "/admin/notifications", feature: "notifications.manage" },
  { prefix: "/admin/settings", feature: "settings.manage" },
  { prefix: "/admin/security", feature: "settings.manage" },
  { prefix: "/admin", feature: "dashboard.view" },
]

export const ACCESS_ROLE_DEFAULTS: Record<string, AdminFeature[]> = {
  SUPER_ADMIN: [
    "dashboard.view",
    "users.manage",
    "orders.view",
    "payments.manage",
    "riders.manage",
    "vendors.manage",
    "promos.manage",
    "commission.manage",
    "reports.view",
    "employees.manage",
    "hr.manage",
    "settings.manage",
    "notifications.manage",
  ],
  ADMIN: [
    "dashboard.view",
    "users.manage",
    "orders.view",
    "payments.manage",
    "complaints.manage",
    "riders.manage",
    "vendors.manage",
    "promos.manage",
    "commission.manage",
    "reports.view",
    "employees.manage",
    "hr.manage",
    "notifications.manage",
  ],
  OPERATIONS: ["dashboard.view", "orders.view", "riders.manage", "vendors.manage", "reports.view"],
  SUPPORT: ["dashboard.view", "users.manage", "orders.view", "reports.view", "complaints.manage"],
  FINANCE: ["dashboard.view", "payments.manage", "commission.manage", "reports.view"],
  MARKETING: ["dashboard.view", "promos.manage", "reports.view"],
  HR: ["dashboard.view", "employees.manage", "hr.manage", "reports.view"],
  NOTIFICATIONS: ["dashboard.view", "notifications.manage", "reports.view"],
}

const LEGACY_GRANT_TO_FEATURE: Record<string, AdminFeature> = {
  USER_MANAGEMENT: "users.manage",
  VENDOR_APPROVAL: "vendors.manage",
  PAYMENT_MANAGEMENT: "payments.manage",
  COMPLAINT_HANDLING: "complaints.manage",
  MARKETING_CAMPAIGNS: "promos.manage",
  ANALYTICS_VIEW: "reports.view",
  SYSTEM_SETTINGS: "settings.manage",
  COMMISSION_SETTINGS: "commission.manage",
  NOTIFICATIONS_MANAGEMENT: "notifications.manage",
}

type AccessEnvelope = {
  accessRole?: string
  grants?: string[]
  modules?: string[]
}

export function parseAdminAccess(input: unknown, role: string) {
  const raw = (input || {}) as AccessEnvelope | string[] | null
  if (Array.isArray(raw)) {
    return {
      accessRole: role,
      grants: raw as string[],
      modules: [] as string[],
    }
  }
  const accessRole = String(raw?.accessRole || role || "ADMIN").toUpperCase()
  const roleDefaults = ACCESS_ROLE_DEFAULTS[accessRole] || ACCESS_ROLE_DEFAULTS.ADMIN
  const grants = Array.isArray(raw?.grants) && raw?.grants.length > 0 ? raw.grants : roleDefaults
  const modules = Array.isArray(raw?.modules) ? raw.modules.map((m) => String(m).toUpperCase()) : []
  return { accessRole, grants, modules }
}

export function resolveAdminFeatures(grants: string[], role?: string): AdminFeature[] {
  const normalized = new Set<AdminFeature>()
  for (const rawGrant of grants || []) {
    const g = String(rawGrant)
    if ((Object.values(ACCESS_ROLE_DEFAULTS).flat() as string[]).includes(g)) {
      normalized.add(g as AdminFeature)
      continue
    }
    const mapped = LEGACY_GRANT_TO_FEATURE[g]
    if (mapped) normalized.add(mapped)
  }
  if (normalized.size === 0 && role) {
    const defaults = ACCESS_ROLE_DEFAULTS[String(role).toUpperCase()] || ACCESS_ROLE_DEFAULTS.ADMIN
    for (const feature of defaults) normalized.add(feature)
  }
  return Array.from(normalized)
}

export function firstGrantedAdminPath(grants: string[], modules: string[]): string {
  const ordered = (grants || []).map((g) => String(g))
  const moduleSet = new Set((modules || []).map((m) => String(m).toUpperCase()))
  const grantToPath: Record<string, string> = {
    COMPLAINT_HANDLING: "/admin/complaints",
    USER_MANAGEMENT: "/admin/users",
    PAYMENT_MANAGEMENT: "/admin/payments",
    VENDOR_APPROVAL: "/admin/modules/vendor",
    MARKETING_CAMPAIGNS: "/admin/promo-codes",
    ANALYTICS_VIEW: "/admin/reports",
    SYSTEM_SETTINGS: "/admin/settings",
    COMMISSION_SETTINGS: "/admin/commission",
    NOTIFICATIONS_MANAGEMENT: "/admin/notifications",
    "dashboard.view": "/admin",
    "users.manage": "/admin/users",
    "orders.view": "/admin/orders",
    "payments.manage": "/admin/payments",
    "complaints.manage": "/admin/complaints",
    "riders.manage": "/admin/modules/rider",
    "vendors.manage": "/admin/modules/vendor",
    "promos.manage": "/admin/promo-codes",
    "commission.manage": "/admin/commission",
    "reports.view": "/admin/reports",
    "employees.manage": "/admin/employees",
    "hr.manage": "/admin/hr",
    "settings.manage": "/admin/settings",
    "notifications.manage": "/admin/notifications",
  }
  for (const grant of ordered) {
    const mapped = grantToPath[grant]
    if (mapped) return mapped
  }
  if (moduleSet.has("PHARMACY")) return "/admin/modules/pharmacy"
  if (moduleSet.has("AUTO_PARTS")) return "/admin/modules/auto-parts"
  if (moduleSet.has("FOOD")) return "/admin/modules/food/all"
  if (moduleSet.has("GROCERY")) return "/admin/modules/grocery"
  if (moduleSet.has("RIDING")) return "/admin/modules/rider/all"
  return "/admin/unauthorized"
}

export function requiredFeatureForPath(pathname: string): AdminFeature | null {
  const rule = FEATURE_ROUTE_RULES.find((r) => pathname.startsWith(r.prefix))
  return rule?.feature || null
}

