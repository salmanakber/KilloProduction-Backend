import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendOTP, generateOTP } from "@/lib/twilio"
import { sendEmailFromTemplate } from "@/lib/email"
import { generateToken } from "@/lib/auth"
import bcrypt from "bcryptjs"
import { authUserModuleInclude, formatAuthUserPayload, getUserModules } from "@/lib/auth-user-modules"
import { shouldBypassLoginOtp } from "@/lib/otp-login-bypass"
import {
  loginRequestMeta,
  passwordAttemptMeta,
  resolveLoginAuditActorId,
} from "@/lib/login-audit-meta"
import {
  phoneLookupVariants,
  sanitizeLoginCredentials,
} from "@/lib/sanitize-login-credentials"

async function writeLoginAudit(args: {
  action: string
  entityId: string
  performedBy?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  details: Record<string, unknown>
}) {
  const performedBy =
    args.performedBy ||
    (await resolveLoginAuditActorId(prisma, null))
  if (!performedBy) return

  await prisma.auditLog
    .create({
      data: {
        action: args.action,
        entityType: "AUTH",
        entityId: args.entityId,
        performedBy,
        ipAddress: args.ipAddress || undefined,
        userAgent: args.userAgent || undefined,
        details: args.details,
      },
    })
    .catch(() => {})
}

function passwordMatches(hash: string, sanitized: string, raw: string) {
  if (sanitized && bcrypt.compareSync(sanitized, hash)) {
    return { matched: true as const, matchedVia: "sanitized" as const }
  }
  if (raw && raw !== sanitized && bcrypt.compareSync(raw, hash)) {
    return { matched: true as const, matchedVia: "raw" as const }
  }
  return { matched: false as const, matchedVia: null }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const meta = loginRequestMeta(request, body)
    const cleaned = sanitizeLoginCredentials(body)
    const { email, phone, password, passwordRaw, sanitization } = cleaned
    const otp = body.otp !== undefined ? body.otp : true

    if (!email && !phone) {
      await writeLoginAudit({
        action: "LOGIN_FAILED",
        entityId: "UNKNOWN",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: {
          reason: "MISSING_IDENTIFIER",
          cause: "No email or phone after sanitization",
          clientError: "Please enter your credentials",
          sanitization,
          ...meta,
          password: undefined,
        },
      })
      return NextResponse.json({ error: "Please enter your email or phone" }, { status: 400 })
    }

    if (!password) {
      await writeLoginAudit({
        action: "LOGIN_FAILED",
        entityId: email || phone || "UNKNOWN",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: {
          reason: "EMPTY_PASSWORD",
          cause: sanitization.passwordTrimmed
            ? "Password was empty after trimming whitespace / invisible characters"
            : "Password was empty",
          clientError: "Please enter your password",
          sanitization,
          ...passwordAttemptMeta(passwordRaw),
          ...meta,
          password: undefined,
        },
      })
      return NextResponse.json({ error: "Please enter your password" }, { status: 400 })
    }

    const phoneVariants = phone ? phoneLookupVariants(phone) : []

    // Find user by phone variants or email (insensitive)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(phoneVariants.length
            ? phoneVariants.map((p) => ({ phone: p }))
            : []),
          ...(email
            ? [
                {
                  email: {
                    equals: email,
                    mode: "insensitive" as const,
                  },
                },
              ]
            : []),
        ],
      },
      include: authUserModuleInclude,
    })

    if (!user) {
      await writeLoginAudit({
        action: "LOGIN_FAILED",
        entityId: email || phone || "UNKNOWN",
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: {
          reason: "USER_NOT_FOUND",
          cause: "No user matched the entered email/phone (after whitespace/invisible-char cleanup)",
          clientError: "Invalid phone number or email",
          sanitization,
          phoneVariantsTried: phoneVariants,
          ...meta,
          emailEntered: email || meta.emailEntered,
          phoneEntered: phone || meta.phoneEntered,
          password: undefined,
        },
      })
      return NextResponse.json(
        { error: "Invalid phone number or email" },
        { status: 404 },
      )
    }

    // Hard guard: rider accounts must have RiderProfile before any login session is issued.
    if (user.role === "RIDER" && !user.riderProfile) {
      return NextResponse.json(
        {
          error: "Rider profile is missing. Please contact support to complete rider setup.",
          code: "RIDER_PROFILE_MISSING",
          redirectToVerification: true,
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            name: user.name,
            role: user.role,
            isVerified: user.isVerified,
            isActive: user.isActive,
            status: user.status,
          },
        },
        { status: 403 },
      )
    }

    const sys = await prisma.systemSettings.findFirst()
    const maxAttempts = Math.max(1, Number(sys?.maxLoginAttempts ?? 5))
    const lockMinutes = Math.max(1, Number(sys?.lockoutDuration ?? 30))

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await writeLoginAudit({
        action: "LOGIN_FAILED",
        entityId: user.id,
        performedBy: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: {
          reason: "ACCOUNT_LOCKED",
          cause: "Account is temporarily locked after too many failed password attempts",
          clientError: "Account temporarily locked after too many failed attempts. Try again later.",
          lockedUntil: user.lockedUntil.toISOString(),
          accountEmail: user.email,
          accountPhone: user.phone,
          accountRole: user.role,
          sanitization,
          ...meta,
          password: undefined,
        },
      })
      return NextResponse.json(
        {
          error: "Account temporarily locked after too many failed attempts. Try again later.",
          lockedUntil: user.lockedUntil.toISOString(),
        },
        { status: 423 },
      )
    }

    if (!user.isActive) {
      const tempToken = await generateToken(
        {
          userId: user.id,
          role: user.role,
          modules: getUserModules(user),
          isTemporary: true,
        },
        "1h",
      )

      return NextResponse.json(
        {
          error:
            "Your account is deactivated. Please contact customer support to reactivate your account.",
          tempToken,
          requiresVerification: false,
          redirectToVerification: true,
          user: {
            id: user.id,
            phone: user.phone,
            email: user.email,
            name: user.name,
            role: user.role,
            isVerified: user.isVerified,
            isActive: user.isActive,
            status: user.status,
          },
        },
        { status: 403 },
      )
    }

    if (!user.password) {
      await writeLoginAudit({
        action: "LOGIN_FAILED",
        entityId: user.id,
        performedBy: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: {
          reason: "SOCIAL_ONLY_ACCOUNT",
          cause: "Account has no password hash (social sign-in only)",
          clientError:
            "This account uses social sign-in. Please use Google or Facebook, or reset your password if available.",
          accountEmail: user.email,
          accountPhone: user.phone,
          sanitization,
          ...meta,
          password: undefined,
        },
      })
      return NextResponse.json(
        {
          error:
            "This account uses social sign-in. Please use Google or Facebook, or reset your password if available.",
        },
        { status: 400 },
      )
    }

    const pwdCheck = passwordMatches(user.password, password, passwordRaw)
    if (!pwdCheck.matched) {
      const fails = (user.loginFailedAttempts ?? 0) + 1
      const lockedUntil =
        fails >= maxAttempts ? new Date(Date.now() + lockMinutes * 60 * 1000) : null
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginFailedAttempts: fails,
          lockedUntil,
        },
      })
      await writeLoginAudit({
        action: "LOGIN_FAILED",
        entityId: user.id,
        performedBy: user.id,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        details: {
          reason: "INVALID_PASSWORD",
          cause:
            "Password did not match after whitespace/invisible-character sanitization (and raw fallback)",
          clientError: "Invalid password",
          failedAttempts: fails,
          attemptsRemaining: Math.max(0, maxAttempts - fails),
          locked: Boolean(lockedUntil),
          lockedUntil: lockedUntil?.toISOString() || null,
          accountEmail: user.email,
          accountPhone: user.phone,
          accountRole: user.role,
          playstoreBypassCandidate: shouldBypassLoginOtp({
            loginPhone: phone,
            loginEmail: email,
            userPhone: user.phone,
            userEmail: user.email,
          }),
          sanitization,
          passwordRawLength: cleaned.passwordRawLength,
          passwordSanitizedLength: password.length,
          ...meta,
          ...passwordAttemptMeta(passwordRaw),
          password: undefined,
        },
      })
      return NextResponse.json(
        {
          error: "Invalid password",
          attemptsRemaining: Math.max(0, maxAttempts - fails),
          locked: Boolean(lockedUntil),
        },
        { status: 401 },
      )
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginFailedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    })

    const playstoreBypass = shouldBypassLoginOtp({
      loginPhone: phone,
      loginEmail: email,
      userPhone: user.phone,
      userEmail: user.email,
    })
    const skipOTP =
      playstoreBypass ||
      process.env.SKIP_OTP_VERIFICATION === "true" ||
      otp === false

    await writeLoginAudit({
      action: "LOGIN_SUCCESS",
      entityId: user.id,
      performedBy: user.id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      details: {
        via: email ? "EMAIL" : "PHONE",
        otpRequired: !skipOTP,
        otpBypassReason: playstoreBypass
          ? "PLAYSTORE_REVIEW_ALLOWLIST"
          : process.env.SKIP_OTP_VERIFICATION === "true"
            ? "SKIP_OTP_VERIFICATION_ENV"
            : otp === false
              ? "CLIENT_OTP_FALSE"
              : null,
        accountEmail: user.email,
        accountPhone: user.phone,
        accountRole: user.role,
        ipAddress: meta.ipAddress,
        sanitization,
        passwordMatchedVia: pwdCheck.matchedVia,
      },
    })

    if (skipOTP) {
      const token = await generateToken({
        userId: user.id,
        role: user.role,
        modules: getUserModules(user),
      })

      return NextResponse.json({
        token,
        user: formatAuthUserPayload(user),
        requiresVerification: false,
      })
    }

    const otpCode = generateOTP()

    await sendOTP(user.phone!, otpCode)

    if (user.email) {
      await sendEmailFromTemplate(user.email, "OTP_VERIFICATION", {
        otpCode: otpCode,
        appName: process.env.APP_NAME || "Killo",
        appUrl: process.env.APP_URL || "https://killo.com",
        customerName: user.name || user.email,
      })
    }

    await prisma.otp.create({
      data: {
        userId: user.id,
        phone: user.phone!,
        code: otpCode,
        expiresAt: new Date(
          Date.now() + Number(process.env.OTP_EXPIRY_MINUTES || 5) * 60 * 1000,
        ),
        verified: false,
      },
    })

    return NextResponse.json({
      message: "OTP sent to your phone",
      userId: user.id,
      requiresVerification: true,
    })
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Login failed" }, { status: 500 })
  }
}
