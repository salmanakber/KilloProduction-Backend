import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { jwtVerify } from "jose"

// Define routes protected by roles
const roleProtectedRoutes: Record<string, string[]> = {
  SUPER_ADMIN: ["/admin", "/admin/dashboard", "/admin/users"],
  ADMIN: ["/admin", "/admin/dashboard", "/admin/users"],
  investor: ["/investor", "/investor/dashboard"],
  user: ["/user", "/profile"]
}

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
    const userRole = payload.role

    // ✅ Check if this route is protected
    const allRoles = Object.keys(roleProtectedRoutes)
    const matchingRole = allRoles.find((role) =>
      roleProtectedRoutes[role].some((route) => pathname.startsWith(route))
    )

    // ✅ If no role matches → allow
    if (!matchingRole) return NextResponse.next()

    // ✅ If user role matches the route → allow
    if (userRole === matchingRole) return NextResponse.next()

    // ❌ Role mismatch
    return NextResponse.redirect(new URL("/admin/unauthorized", req.url))
  } catch (err) {
    console.error("Invalid token in middleware:", err)
    return NextResponse.redirect(new URL("/admin/login", req.url))
  }
}
