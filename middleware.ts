import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"
import { requiredFeatureForPath, resolveAdminFeatures } from "@/lib/admin-access"

// Public routes (no auth required)
const publicRoutes = [
  "/", "/login", "/register", "/admin/login", "/admin/unauthorized", "/admin/forgot-password", "/api",
  "/api/admin/auth/login", "/api/admin/auth/forgot-password"
]

// Secret for JWT (must match the one used to sign the token)
const JWT_SECRET = process.env.JWT_SECRET!
const encoder = new TextEncoder()

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ✅ Allow internal Next.js assets and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname.match(/\.(.*)$/)
  ) {
    return NextResponse.next()
  }

  // ✅ Allow public routes
  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    return NextResponse.next()
  }

  // ✅ Get token from cookie
  const token = req.cookies.get("admin-token")?.value
  if (!token) {
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }

  try {
    // ✅ Verify token using `jose` (Edge-compatible)
    const { payload } = await jwtVerify(token, encoder.encode(JWT_SECRET))
    const userRole = String(payload.role || "")
    if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/admin/unauthorized", req.url))
    }
    const requiredFeature = requiredFeatureForPath(pathname)
    if (!requiredFeature) return NextResponse.next()
    const grants = Array.isArray((payload as any)?.adminAccess?.grants)
      ? ((payload as any).adminAccess.grants as string[])
      : []
    const grantedFeatures = resolveAdminFeatures(grants, userRole)
    if (userRole === "SUPER_ADMIN" || grantedFeatures.includes(requiredFeature)) {
      return NextResponse.next()
    }
    return NextResponse.redirect(new URL("/admin/unauthorized", req.url))
  } catch (err) {
    console.error("Invalid token in middleware:", err)
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }
}
