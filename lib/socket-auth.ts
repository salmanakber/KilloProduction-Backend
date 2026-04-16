import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { resolveJwtExpiresIn } from "./auth";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const getSecretKey = () => new TextEncoder().encode(JWT_SECRET);

// ─── Password Hashing ─────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// ─── JWT Creation ─────────────────────────────────────────────────────────────

export async function generateToken(payload: any, expiresIn?: string): Promise<string> {
  const exp = await resolveJwtExpiresIn(expiresIn)
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecretKey());
}

// ─── JWT Verification ─────────────────────────────────────────────────────────

export async function verifyToken(token: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch (err) {
    console.error("Invalid JWT:", err);
    return null;
  }
}

// ─── Authenticate From Request (Web + Mobile) ─────────────────────────────────

export async function authenticateRequest(request: any): Promise<any> {
  let token = null;

  if (request) {
    // Extract token from Authorization header (Bearer token)
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7); // Remove "Bearer " prefix
    }
  }

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      userProfile: true,
      userSettings: true,
      wallet: true,
    },
  });

  return user;
}

// ─── Authenticate From Cookie (Web) ──────────────────────────────────────────

export async function authenticateFromCookie(request: any): Promise<any> {
  let token = null;

  if (request) {
    // Extract token from cookie
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const cookies = cookieHeader.split(";").reduce((acc: any, cookie: string) => {
        const [key, value] = cookie.trim().split("=");
        acc[key] = value;
        return acc;
      }, {});
      
      token = cookies["admin-token"];
    }
  }

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      userProfile: true,
      userSettings: true,
      wallet: true,
    },
  });

  return user;
}

// ─── Role-Based Guard ─────────────────────────────────────────────────────────

export function requireAuth(roles: string[]) {
  return async (request: any) => {
    const user = await authenticateFromCookie(request);

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (roles && !roles.includes(user.role)) {
      return new Response("Forbidden", { status: 403 });
    }

    return user;
  };
}
