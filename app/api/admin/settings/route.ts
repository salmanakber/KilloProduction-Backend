import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"
import { getPrimaryAndFallbackGateways } from "@/lib/payment-gateway"
import { invalidateAutomationAiSettingsCache } from "@/lib/automation-ai-settings"
import { getMoneyReceiptWhatsappConfigPublic, saveMoneyReceiptWhatsappConfig } from "@/lib/money-receipt-whatsapp-config"
import { DEFAULT_RIDING_EMERGENCY_CONTACTS } from "@/lib/ride-trip-share"

function cloneJsonForAudit<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

/** Avoid storing Meta WhatsApp permanent tokens in audit logs. */
function redactSystemSettingsForAudit(settings: unknown): unknown {
  if (!settings || typeof settings !== "object") return settings
  const s = cloneJsonForAudit(settings) as Record<string, unknown>
  const wa = s.moneyReceiptWhatsapp
  if (wa && typeof wa === "object" && !Array.isArray(wa)) {
    const m = wa as Record<string, unknown>
    if (typeof m.accessToken === "string" && m.accessToken.trim() !== "") {
      m.accessToken = "[REDACTED]"
    }
  }
  return s
}

export async function GET(request: NextRequest) {
  try {
    // const user = await authenticateRequest()
    // if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
    //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    // }

    const defaultCurrency = await prisma.currency.findFirst({
      where: { isDefault: true },
      select: { symbol: true, code: true },
    })
    const defaultCurrencyCode = defaultCurrency?.symbol || "₦"

    // Get system settings from database or return defaults
    const systemSettings = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    
    // Get loyalty point settings
    const loyaltyPointSettings = await prisma.loyaltyPointSettings.findMany()
    
    // Map module names
    const moduleMap: Record<string, string> = {
      pharmacy: "PHARMACY",
      autoParts: "AUTO_PARTS",
      food: "FOOD",
      grocery: "GROCERY",
      riding: "RIDING",
    }
    
    const loyaltyPointsMap: Record<string, any> = {}
    loyaltyPointSettings.forEach((setting) => {
      const moduleKey = Object.keys(moduleMap).find(
        (key) => moduleMap[key] === setting.module
      ) || setting.module.toLowerCase()
      loyaltyPointsMap[moduleKey] = {
        enabled: setting.enabled,
        formula: setting.formula,
        minimumOrderAmount: setting.minimumOrderAmount,
        maximumPointsPerOrder: setting.maximumPointsPerOrder,
        pointsExpiryDays: setting.pointsExpiryDays,
      }
    })

    const pmRaw = systemSettings?.paymentMethods
    const paymentMethodsJson =
      pmRaw && typeof pmRaw === "object" && !Array.isArray(pmRaw)
        ? (pmRaw as Record<string, unknown>)
        : null

    let checkoutGateway: {
      primary: string
      fallback: string | null
      storedPrimary: string | null
    } | null = null
    try {
      const currency = systemSettings?.defaultCurrency || systemSettings?.currency || "NGN"
      const { primary, fallback } = await getPrimaryAndFallbackGateways(currency)
      const storedRaw = paymentMethodsJson?.primaryGateway ?? paymentMethodsJson?.primary
      checkoutGateway = {
        primary,
        fallback,
        storedPrimary: typeof storedRaw === "string" ? storedRaw : null,
      }
    } catch {
      checkoutGateway = null
    }

    const settings = {
      general: {
        appName: systemSettings?.appName || "Kilo Super App",
        appVersion: systemSettings?.appVersion || "1.0.0",
        timezone: systemSettings?.timezone || "Africa/Lagos",
        language: systemSettings?.language || "en",
        currency: systemSettings?.currency || "NGN",
        dateFormat: systemSettings?.dateFormat || "DD/MM/YYYY",
        maintenanceMode: systemSettings?.maintenanceMode ?? false,
        maintenanceMessage:
          systemSettings?.maintenanceMessage || "System is under maintenance. Please try again later.",
      },
      tts: {
        baseUrl:
          (systemSettings?.compnyinfo as any)?.tts?.baseUrl ||
          process.env.TTS_BASE_URL ||
          "http://209.97.132.83:8080",
        voice:
          (systemSettings?.compnyinfo as any)?.tts?.voice ||
          process.env.TTS_VOICE ||
          "en-GB-RyanNeural",
      },
      compnyinfo: {
        company: {
          name: (systemSettings?.compnyinfo as any)?.company?.name || "Kilo Super App",
          address: (systemSettings?.compnyinfo as any)?.company?.address || [],
          contact: (systemSettings?.compnyinfo as any)?.company?.contact || [],
          description: (systemSettings?.compnyinfo as any)?.company?.description || "",
        },
        supportCenter: {
          email: (systemSettings?.compnyinfo as any)?.supportCenter?.email || "",
          phone: (systemSettings?.compnyinfo as any)?.supportCenter?.phone || "",
          liveChat: (systemSettings?.compnyinfo as any)?.supportCenter?.liveChat ?? false,
          whatsapp: (systemSettings?.compnyinfo as any)?.supportCenter?.whatsapp || "",
          workingHours: (systemSettings?.compnyinfo as any)?.supportCenter?.workingHours || [],
        },
        location: {
          countryCode:
            (systemSettings?.compnyinfo as any)?.location?.countryCode ||
            process.env.LOCATION_COUNTRY_CODE ||
            "ng",
          restrictAutocomplete:
            (systemSettings?.compnyinfo as any)?.location?.restrictAutocomplete ?? true,
          googleMapsApiKey:
            (systemSettings?.compnyinfo as any)?.location?.googleMapsApiKey || "",
          mapsApiKeySource: (() => {
            const stored = (systemSettings?.compnyinfo as any)?.location?.googleMapsApiKey?.trim()
            if (stored) return "database"
            if (process.env.GOOGLE_MAPS_API_KEY?.trim()) return "env"
            return "none"
          })(),
        },
        ridingEmergencyContacts: Array.isArray(
          (systemSettings?.compnyinfo as any)?.ridingEmergencyContacts,
        )
          ? (systemSettings?.compnyinfo as any).ridingEmergencyContacts
          : DEFAULT_RIDING_EMERGENCY_CONTACTS,
      },
      security: {
        passwordPolicy: {
          minLength: systemSettings?.passwordMinLength || 8,
          requireUppercase: systemSettings?.passwordRequireUppercase ?? true,
          requireLowercase: systemSettings?.passwordRequireLowercase ?? true,
          requireNumbers: systemSettings?.passwordRequireNumbers ?? true,
          requireSpecialChars: systemSettings?.passwordRequireSpecialChars ?? true,
          maxAge: systemSettings?.passwordMaxAge || 90,
        },
        sessionTimeout: systemSettings?.sessionTimeout || 480,
        maxLoginAttempts: systemSettings?.maxLoginAttempts || 5,
        lockoutDuration: systemSettings?.lockoutDuration || 30,
        twoFactorRequired: systemSettings?.twoFactorRequired ?? false,
        ipWhitelist: systemSettings?.ipWhitelist || [],
      },
      notifications: {
        emailEnabled: systemSettings?.emailEnabled ?? true,
        smsEnabled: systemSettings?.smsEnabled ?? true,
        pushEnabled: systemSettings?.pushEnabled ?? true,
        emailProvider: systemSettings?.emailProvider || "sendgrid",
        smsProvider: systemSettings?.smsProvider || "twilio",
        defaultSender: systemSettings?.defaultSender || "Kilo Super App",
        bravoEmail: systemSettings?.bravoEmail || "",
        smtpHost: systemSettings?.smtpHost || "",
        smtpPort: systemSettings?.smtpPort || 587,
        smtpUser: systemSettings?.smtpUser || "",
        smtpPass: systemSettings?.smtpPass || "",
        smtpSecure: systemSettings?.smtpSecure ?? true,
        smtpFrom: systemSettings?.smtpFrom || "",
        smtpRejectUnauthorized: systemSettings?.smtpRejectUnauthorized ?? false,
        brevoApiKey: systemSettings?.brevoApiKey || "",
        sendgridApiKey: systemSettings?.sendgridApiKey || "",
        mailgunApiKey: systemSettings?.mailgunApiKey || "",
        mailgunDomain: systemSettings?.mailgunDomain || "",
        sesAccessKeyId: systemSettings?.sesAccessKeyId || "",
        sesSecretAccessKey: systemSettings?.sesSecretAccessKey || "",
        sesRegion: systemSettings?.sesRegion || "us-east-1",
        twilioAccountSid: systemSettings?.twilioAccountSid || "",
        twilioAuthToken: systemSettings?.twilioAuthToken || "",
        twilioPhoneNumber: systemSettings?.twilioPhoneNumber || "",
        nexmoApiKey: systemSettings?.nexmoApiKey || "",
        nexmoApiSecret: systemSettings?.nexmoApiSecret || "",
        nexmoFromNumber: systemSettings?.nexmoFromNumber || "",
        africasTalkingApiKey: systemSettings?.africasTalkingApiKey || "",
        africasTalkingUsername: systemSettings?.africasTalkingUsername || "",
        templates: {
          welcome: systemSettings?.welcomeTemplate || "Welcome to Kilo Super App!",
          orderConfirmation: systemSettings?.orderConfirmationTemplate || "Your order has been confirmed.",
          passwordReset: systemSettings?.passwordResetTemplate || "Reset your password using this link.",
        },
        marketingAutomationAiEnabled: systemSettings?.marketingAutomationAiEnabled ?? true,
        marketingAutomationAiMaxCandidates: Math.min(
          20,
          Math.max(1, systemSettings?.marketingAutomationAiMaxCandidates ?? 12)
        ),
        riderBonusAiEnabled: systemSettings?.riderBonusAiEnabled ?? false,
      },
      payments: {
        defaultCurrency: systemSettings?.defaultCurrency || "NGN",
        pricePerKm: systemSettings?.pricePerKm || 100.0,
        commissionRates: {
          pharmacy: systemSettings?.pharmacyCommission || 5.0,
          autoParts: systemSettings?.autoPartsCommission || 3.0,
          food: systemSettings?.foodCommission || 15.0,
          grocery: systemSettings?.groceryCommission || 8.0,
          riding: systemSettings?.ridingCommission || 20.0,
        },
        paymentMethods: systemSettings?.paymentMethods || ["CARD", "BANK_TRANSFER", "WALLET"],
        /** Resolved Stripe/Paystack order for mobile checkout; persisted preference in paymentMethods JSON. */
        checkoutGateway,
        minimumWithdrawal: systemSettings?.minimumWithdrawal || 1000,
        withdrawalFee: systemSettings?.withdrawalFee || 50,
        processingTime: systemSettings?.processingTime || "1-3 business days",
      },
      modules: {
        pharmacy: {
          enabled: systemSettings?.pharmacyEnabled ?? true,
          autoApproval: systemSettings?.pharmacyAutoApproval ?? false,
          requirePrescription: systemSettings?.pharmacyRequirePrescription ?? true,
          deliveryRadius: systemSettings?.pharmacyDeliveryRadius || 10,
        },
        autoParts: {
          enabled: systemSettings?.autoPartsEnabled ?? true,
          autoApproval: systemSettings?.autoPartsAutoApproval ?? false,
          warrantyRequired: systemSettings?.autoPartsWarrantyRequired ?? true,
          returnPeriod: systemSettings?.autoPartsReturnPeriod || 30,
        },
        food: {
          enabled: systemSettings?.foodEnabled ?? true,
          autoApproval: systemSettings?.foodAutoApproval ?? false,
          maxDeliveryTime: systemSettings?.foodMaxDeliveryTime || 60,
          qualityChecks: systemSettings?.foodQualityChecks ?? true,
        },
        grocery: {
          enabled: systemSettings?.groceryEnabled ?? true,
          autoApproval: systemSettings?.groceryAutoApproval ?? false,
          freshnessPeriod: systemSettings?.groceryFreshnessPeriod || 7,
          bulkOrders: systemSettings?.groceryBulkOrders ?? true,
        },
        riding: {
          enabled: systemSettings?.ridingEnabled ?? true,
          autoApproval: systemSettings?.ridingAutoApproval ?? false,
          backgroundCheck: systemSettings?.ridingBackgroundCheck ?? true,
          insuranceRequired: systemSettings?.ridingInsuranceRequired ?? true,
        },
      },
      loyaltyPoints: loyaltyPointsMap,
      customerOAuth: (systemSettings?.customerOAuth as Record<string, unknown>) || {
        google: { webClientId: "", iosClientId: "", androidClientId: "" },
        facebook: { appId: "", appSecret: "" },
      },
      moneyReceiptWhatsapp: await (async () => {
        const c = await getMoneyReceiptWhatsappConfigPublic()
        return {
          enabled: c.enabled,
          phoneNumberId: c.phoneNumberId,
          apiVersion: c.apiVersion,
          wabaId: c.wabaId || "",
          messageTemplate: c.messageTemplate,
          templateName: c.templateName || "",
          templateLanguage: c.templateLanguage,
          hasAccessToken: c.hasAccessToken,
          accessToken: "",
        }
      })(),
    }

    

    return NextResponse.json({ settings, defaultCurrencyCode })
  } catch (error) {
    console.error("Error fetching system settings:", error)
    return NextResponse.json({ error: "Failed to fetch system settings" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    if (!user || !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await request.json()

    const existingRow = await prisma.systemSettings.findUnique({ where: { id: 1 } })
    const existingCompnyinfo = (existingRow?.compnyinfo as Record<string, unknown>) || {}

    // Update or create system settings
    const updatedSettings = await prisma.systemSettings.upsert({
      where: { id: 1 }, // Assuming single settings record
      update: {
        // General settings
        appName: settings.general.appName,
        appVersion: settings.general.appVersion,
        timezone: settings.general.timezone,
        language: settings.general.language,
        currency: settings.general.currency,
        dateFormat: settings.general.dateFormat,
        maintenanceMode: settings.general.maintenanceMode,
        maintenanceMessage: settings.general.maintenanceMessage,

        // Company information settings
        compnyinfo: {
          ...existingCompnyinfo,
          company: {
            name: settings.compnyinfo.company.name,
            address: settings.compnyinfo.company.address,
            contact: settings.compnyinfo.company.contact,
            description: settings.compnyinfo.company.description,
          },
          supportCenter: {
            email: settings.compnyinfo.supportCenter.email,
            phone: settings.compnyinfo.supportCenter.phone,
            liveChat: settings.compnyinfo.supportCenter.liveChat,
            whatsapp: settings.compnyinfo.supportCenter.whatsapp,
            workingHours: settings.compnyinfo.supportCenter.workingHours,
          },
          tts: {
            baseUrl: settings.tts?.baseUrl || process.env.TTS_BASE_URL || "http://209.97.132.83:8080",
            voice: settings.tts?.voice || process.env.TTS_VOICE || "en-GB-RyanNeural",
          },
          location: {
            countryCode: (settings.compnyinfo?.location?.countryCode || "ng")
              .toString()
              .trim()
              .toLowerCase()
              .slice(0, 2),
            restrictAutocomplete: settings.compnyinfo?.location?.restrictAutocomplete ?? true,
            googleMapsApiKey: (settings.compnyinfo?.location?.googleMapsApiKey || "").trim(),
          },
          ridingEmergencyContacts: Array.isArray(settings.compnyinfo?.ridingEmergencyContacts)
            ? settings.compnyinfo.ridingEmergencyContacts
            : (existingCompnyinfo as any)?.ridingEmergencyContacts ||
              DEFAULT_RIDING_EMERGENCY_CONTACTS,
        },

        // Security settings
        passwordMinLength: settings.security.passwordPolicy.minLength,
        passwordRequireUppercase: settings.security.passwordPolicy.requireUppercase,
        passwordRequireLowercase: settings.security.passwordPolicy.requireLowercase,
        passwordRequireNumbers: settings.security.passwordPolicy.requireNumbers,
        passwordRequireSpecialChars: settings.security.passwordPolicy.requireSpecialChars,
        passwordMaxAge: settings.security.passwordPolicy.maxAge,
        sessionTimeout: settings.security.sessionTimeout,
        maxLoginAttempts: settings.security.maxLoginAttempts,
        lockoutDuration: settings.security.lockoutDuration,
        twoFactorRequired: settings.security.twoFactorRequired,
        ipWhitelist: settings.security.ipWhitelist,

        // Notification settings
        emailEnabled: settings.notifications.emailEnabled,
        smsEnabled: settings.notifications.smsEnabled,
        pushEnabled: settings.notifications.pushEnabled,
        emailProvider: settings.notifications.emailProvider,
        smsProvider: settings.notifications.smsProvider,
        defaultSender: settings.notifications.defaultSender,
        bravoEmail: settings.notifications.bravoEmail || null,
        smtpHost: settings.notifications.smtpHost || null,
        smtpPort: settings.notifications.smtpPort || null,
        smtpUser: settings.notifications.smtpUser || null,
        smtpPass: settings.notifications.smtpPass || null,
        smtpSecure: settings.notifications.smtpSecure ?? true,
        smtpFrom: settings.notifications.smtpFrom || null,
        smtpRejectUnauthorized: settings.notifications.smtpRejectUnauthorized ?? false,
        brevoApiKey: settings.notifications.brevoApiKey || null,
        sendgridApiKey: settings.notifications.sendgridApiKey || null,
        mailgunApiKey: settings.notifications.mailgunApiKey || null,
        mailgunDomain: settings.notifications.mailgunDomain || null,
        sesAccessKeyId: settings.notifications.sesAccessKeyId || null,
        sesSecretAccessKey: settings.notifications.sesSecretAccessKey || null,
        sesRegion: settings.notifications.sesRegion || null,
        twilioAccountSid: settings.notifications.twilioAccountSid || null,
        twilioAuthToken: settings.notifications.twilioAuthToken || null,
        twilioPhoneNumber: settings.notifications.twilioPhoneNumber || null,
        nexmoApiKey: settings.notifications.nexmoApiKey || null,
        nexmoApiSecret: settings.notifications.nexmoApiSecret || null,
        nexmoFromNumber: settings.notifications.nexmoFromNumber || null,
        africasTalkingApiKey: settings.notifications.africasTalkingApiKey || null,
        africasTalkingUsername: settings.notifications.africasTalkingUsername || null,
        marketingAutomationAiEnabled:
          settings.notifications?.marketingAutomationAiEnabled ?? true,
        marketingAutomationAiMaxCandidates: Math.min(
          20,
          Math.max(
            1,
            Number(settings.notifications?.marketingAutomationAiMaxCandidates) || 12
          )
        ),
        riderBonusAiEnabled: settings.notifications?.riderBonusAiEnabled ?? false,

        customerOAuth: settings.customerOAuth ?? undefined,

        // Payment settings
        defaultCurrency: settings.payments.defaultCurrency,
        pricePerKm: settings.payments.pricePerKm,
        pharmacyCommission: settings.payments.commissionRates.pharmacy,
        autoPartsCommission: settings.payments.commissionRates.autoParts,
        foodCommission: settings.payments.commissionRates.food,
        groceryCommission: settings.payments.commissionRates.grocery,
        ridingCommission: settings.payments.commissionRates.riding,
        minimumWithdrawal: settings.payments.minimumWithdrawal,
        withdrawalFee: settings.payments.withdrawalFee,
        processingTime: settings.payments.processingTime,

        // Module settings
        pharmacyEnabled: settings.modules.pharmacy.enabled,
        pharmacyAutoApproval: settings.modules.pharmacy.autoApproval,
        pharmacyRequirePrescription: settings.modules.pharmacy.requirePrescription,
        pharmacyDeliveryRadius: settings.modules.pharmacy.deliveryRadius,
        autoPartsEnabled: settings.modules.autoParts.enabled,
        autoPartsAutoApproval: settings.modules.autoParts.autoApproval,
        foodEnabled: settings.modules.food.enabled,
        foodAutoApproval: settings.modules.food.autoApproval,
        groceryEnabled: settings.modules.grocery.enabled,
        groceryAutoApproval: settings.modules.grocery.autoApproval,
        ridingEnabled: settings.modules.riding.enabled,
        ridingAutoApproval: settings.modules.riding.autoApproval,
        ridingBackgroundCheck: settings.modules.riding.backgroundCheck,
        ridingInsuranceRequired: settings.modules.riding.insuranceRequired,

        updatedAt: new Date(),
      },
      create: {
        id: 1,
        appName: settings.general.appName,
        appVersion: settings.general.appVersion,
        timezone: settings.general.timezone,
        language: settings.general.language,
        currency: settings.general.currency,
        dateFormat: settings.general.dateFormat,
        maintenanceMode: settings.general.maintenanceMode,
        maintenanceMessage: settings.general.maintenanceMessage,
        compnyinfo: {
          company: {
            name: settings.compnyinfo.company.name,
            address: settings.compnyinfo.company.address,
            contact: settings.compnyinfo.company.contact,
            description: settings.compnyinfo.company.description,
          },
          supportCenter: {
            email: settings.compnyinfo.supportCenter.email,
            phone: settings.compnyinfo.supportCenter.phone,
            liveChat: settings.compnyinfo.supportCenter.liveChat,
            whatsapp: settings.compnyinfo.supportCenter.whatsapp,
            workingHours: settings.compnyinfo.supportCenter.workingHours,
          },
          tts: {
            baseUrl: settings.tts?.baseUrl || process.env.TTS_BASE_URL || "http://209.97.132.83:8080",
            voice: settings.tts?.voice || process.env.TTS_VOICE || "en-GB-RyanNeural",
          },
          location: {
            countryCode: (settings.compnyinfo?.location?.countryCode || "ng")
              .toString()
              .trim()
              .toLowerCase()
              .slice(0, 2),
            restrictAutocomplete: settings.compnyinfo?.location?.restrictAutocomplete ?? true,
            googleMapsApiKey: (settings.compnyinfo?.location?.googleMapsApiKey || "").trim(),
          },
          ridingEmergencyContacts: Array.isArray(settings.compnyinfo?.ridingEmergencyContacts)
            ? settings.compnyinfo.ridingEmergencyContacts
            : DEFAULT_RIDING_EMERGENCY_CONTACTS,
        },
        customerOAuth: settings.customerOAuth ?? undefined,
      },
    })

    // Update currency default status
    if (settings.general.currency) {
      // Set all currencies to not default
      await prisma.currency.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      })
      
      // Set the selected currency as default
      await prisma.currency.updateMany({
        where: { code: settings.general.currency },
        data: { isDefault: true }
      })
    }

    // Update loyalty point settings
    if (settings.loyaltyPoints) {
      const moduleMap: Record<string, string> = {
        pharmacy: "PHARMACY",
        autoParts: "AUTO_PARTS",
        food: "FOOD",
        grocery: "GROCERY",
        riding: "RIDING",
      }

      for (const [moduleKey, config] of Object.entries(settings.loyaltyPoints)) {
        const moduleValue = moduleMap[moduleKey] || moduleKey.toUpperCase()
        await prisma.loyaltyPointSettings.upsert({
          where: { module: moduleValue as any },
          update: {
            enabled: (config as any).enabled,
            formula: (config as any).formula,
            minimumOrderAmount: (config as any).minimumOrderAmount,
            maximumPointsPerOrder: (config as any).maximumPointsPerOrder,
            pointsExpiryDays: (config as any).pointsExpiryDays,
            updatedAt: new Date(),
          },
          create: {
            module: moduleValue as any,
            enabled: (config as any).enabled,
            formula: (config as any).formula || "orderAmount * 0.01",
            minimumOrderAmount: (config as any).minimumOrderAmount,
            maximumPointsPerOrder: (config as any).maximumPointsPerOrder,
            pointsExpiryDays: (config as any).pointsExpiryDays,
          },
        })
      }
    }

    invalidateAutomationAiSettingsCache()

    if (settings.moneyReceiptWhatsapp && typeof settings.moneyReceiptWhatsapp === "object") {
      const wa = settings.moneyReceiptWhatsapp as Record<string, unknown>
      await saveMoneyReceiptWhatsappConfig({
        enabled: Boolean(wa.enabled),
        phoneNumberId: wa.phoneNumberId != null ? String(wa.phoneNumberId).trim() : undefined,
        accessToken:
          typeof wa.accessToken === "string" && wa.accessToken.trim()
            ? wa.accessToken.trim()
            : undefined,
        apiVersion: wa.apiVersion != null ? String(wa.apiVersion).trim() : undefined,
        wabaId: wa.wabaId != null ? String(wa.wabaId).trim() || null : undefined,
        messageTemplate: wa.messageTemplate != null ? String(wa.messageTemplate) : undefined,
        templateName:
          wa.templateName !== undefined
            ? wa.templateName
              ? String(wa.templateName).trim()
              : null
            : undefined,
        templateLanguage:
          wa.templateLanguage != null ? String(wa.templateLanguage).trim() : undefined,
      })
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        performedBy: user.id,
        action: "UPDATE_SYSTEM_SETTINGS",
        entityType: "SYSTEM_SETTINGS",
        entityId: "1",
        details: {
          changes: redactSystemSettingsForAudit(settings),
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: "System settings updated successfully",
      settings: updatedSettings,
    })
  } catch (error) {
    console.error("Error updating system settings:", error)
    return NextResponse.json({ error: "Failed to update system settings" }, { status: 500 })
  }
}

// Some production proxies/CDNs may block PUT for app routes.
// Support POST/PATCH as compatibility aliases for the same update flow.
export async function POST(request: NextRequest) {
return PUT(request)
}

export async function PATCH(request: NextRequest) {
  return PUT(request)
}
