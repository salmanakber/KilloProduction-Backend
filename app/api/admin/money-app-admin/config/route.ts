import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const config = await prisma.moneyTransferConfig.findFirst()

    if (!config) {
      // Return default config if none exists
      return NextResponse.json({
        success: true,
        config: {
          isEnabled: true,
          minTransferAmount: 1.0,
          maxTransferAmount: 10000.0,
          defaultCurrency: "USD",
          supportedCurrencies: ["USD", "NGN"],
          transferFeePercentage: 0.0,
          transferFeeFixed: 0.0,
          exchangeRateMargin: 0.02,
          autoPayoutEnabled: false,
          autoPayoutDelayMinutes: 12,
          withdrawalSmartAutoApprove: false,
          withdrawalSmartApproveDelayMinutes: 15,
          withdrawalPaystackBufferNgn: 50_000,
          withdrawalInstantMaxNgn: null,
        },
      })
    }

    // Don't return secret keys in GET. Publishable keys are public by design and must be
    // returned so admin inputs can show the saved values after reload.
    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        isEnabled: config.isEnabled,
        minTransferAmount: config.minTransferAmount,
        maxTransferAmount: config.maxTransferAmount,
        defaultCurrency: config.defaultCurrency,
        supportedCurrencies: config.supportedCurrencies,
        transferFeePercentage: config.transferFeePercentage,
        transferFeeFixed: config.transferFeeFixed,
        exchangeRateProvider: config.exchangeRateProvider,
        exchangeRateMargin: config.exchangeRateMargin,
        stripePublishableKey: config.stripePublishableKey,
        paystackPublicKey: config.paystackPublicKey,
        hasExchangeRateApiKey: !!config.exchangeRateApiKey,
        hasStripeConfig: !!config.stripeSecretKey,
        hasPaystackConfig: !!config.paystackSecretKey,
        settlementMode: config.settlementMode,
        autoPayoutEnabled: config.autoPayoutEnabled ?? false,
        autoPayoutDelayMinutes: config.autoPayoutDelayMinutes ?? 12,
        withdrawalSmartAutoApprove: config.withdrawalSmartAutoApprove ?? false,
        withdrawalSmartApproveDelayMinutes: config.withdrawalSmartApproveDelayMinutes ?? 15,
        withdrawalPaystackBufferNgn: config.withdrawalPaystackBufferNgn ?? 50_000,
        withdrawalInstantMaxNgn: config.withdrawalInstantMaxNgn ?? null,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Error fetching money transfer config:", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch config" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest()
    console.log("user", user)
    if (!user || user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const {
      stripeSecretKey,
      stripePublishableKey,
      stripeWebhookSecret,
      paystackSecretKey,
      paystackPublicKey,
      isEnabled,
      minTransferAmount,
      maxTransferAmount,
      defaultCurrency,
      supportedCurrencies,
      exchangeRateProvider,
      exchangeRateApiKey,
      exchangeRateMargin,
      transferFeePercentage,
      transferFeeFixed,
      settlementMode,
      autoPayoutEnabled,
      autoPayoutDelayMinutes,
      withdrawalSmartAutoApprove,
      withdrawalSmartApproveDelayMinutes,
      withdrawalPaystackBufferNgn,
      withdrawalInstantMaxNgn,
    } = body

    // Get or create config
    let config = await prisma.moneyTransferConfig.findFirst()

    const configData: any = {
      isEnabled: isEnabled !== undefined ? isEnabled : config?.isEnabled ?? true,
      minTransferAmount: minTransferAmount ?? config?.minTransferAmount ?? 1.0,
      maxTransferAmount: maxTransferAmount ?? config?.maxTransferAmount ?? 10000.0,
      defaultCurrency: defaultCurrency ?? config?.defaultCurrency ?? "USD",
      supportedCurrencies: supportedCurrencies ?? config?.supportedCurrencies ?? ["USD", "NGN"],
      exchangeRateProvider: exchangeRateProvider ?? config?.exchangeRateProvider,
      exchangeRateMargin: exchangeRateMargin ?? config?.exchangeRateMargin ?? 0.02,
      transferFeePercentage: transferFeePercentage ?? config?.transferFeePercentage ?? 0.0,
      transferFeeFixed: transferFeeFixed ?? config?.transferFeeFixed ?? 0.0,
      settlementMode:
        settlementMode === "DIRECT_BANK" || settlementMode === "WALLET"
          ? settlementMode
          : config?.settlementMode ?? "WALLET",
      autoPayoutEnabled:
        autoPayoutEnabled !== undefined
          ? Boolean(autoPayoutEnabled)
          : config?.autoPayoutEnabled ?? false,
      autoPayoutDelayMinutes:
        autoPayoutDelayMinutes != null
          ? Math.min(60, Math.max(10, Number(autoPayoutDelayMinutes) || 12))
          : config?.autoPayoutDelayMinutes ?? 12,
      withdrawalSmartAutoApprove:
        withdrawalSmartAutoApprove !== undefined
          ? Boolean(withdrawalSmartAutoApprove)
          : config?.withdrawalSmartAutoApprove ?? false,
      withdrawalSmartApproveDelayMinutes:
        withdrawalSmartApproveDelayMinutes != null
          ? Math.min(120, Math.max(1, Number(withdrawalSmartApproveDelayMinutes) || 15))
          : config?.withdrawalSmartApproveDelayMinutes ?? 15,
      withdrawalPaystackBufferNgn:
        withdrawalPaystackBufferNgn != null
          ? Math.max(0, Number(withdrawalPaystackBufferNgn) || 0)
          : config?.withdrawalPaystackBufferNgn ?? 50_000,
      withdrawalInstantMaxNgn:
        withdrawalInstantMaxNgn !== undefined
          ? withdrawalInstantMaxNgn === "" || withdrawalInstantMaxNgn === null
            ? null
            : Number.isFinite(Number(withdrawalInstantMaxNgn))
              ? Math.max(0, Number(withdrawalInstantMaxNgn))
              : config?.withdrawalInstantMaxNgn ?? null
          : config?.withdrawalInstantMaxNgn ?? null,
    }

    // Only update keys if provided
    if (stripeSecretKey) configData.stripeSecretKey = stripeSecretKey
    if (stripePublishableKey) configData.stripePublishableKey = stripePublishableKey
    if (stripeWebhookSecret) configData.stripeWebhookSecret = stripeWebhookSecret
    if (paystackSecretKey) configData.paystackSecretKey = paystackSecretKey
    if (paystackPublicKey) configData.paystackPublicKey = paystackPublicKey
    if (exchangeRateApiKey) configData.exchangeRateApiKey = exchangeRateApiKey

    if (config) {
      config = await prisma.moneyTransferConfig.update({
        where: { id: config.id },
        data: configData,
      })
    } else {
      config = await prisma.moneyTransferConfig.create({
        data: configData,
      })
    }

    // Don't return secret keys; publishable keys are safe to echo back
    return NextResponse.json({
      success: true,
      config: {
        id: config.id,
        isEnabled: config.isEnabled,
        minTransferAmount: config.minTransferAmount,
        maxTransferAmount: config.maxTransferAmount,
        defaultCurrency: config.defaultCurrency,
        supportedCurrencies: config.supportedCurrencies,
        transferFeePercentage: config.transferFeePercentage,
        transferFeeFixed: config.transferFeeFixed,
        exchangeRateProvider: config.exchangeRateProvider,
        exchangeRateMargin: config.exchangeRateMargin,
        stripePublishableKey: config.stripePublishableKey,
        paystackPublicKey: config.paystackPublicKey,
        hasExchangeRateApiKey: !!config.exchangeRateApiKey,
        hasStripeConfig: !!config.stripeSecretKey,
        hasPaystackConfig: !!config.paystackSecretKey,
        settlementMode: config.settlementMode,
        autoPayoutEnabled: config.autoPayoutEnabled,
        autoPayoutDelayMinutes: config.autoPayoutDelayMinutes,
        withdrawalSmartAutoApprove: config.withdrawalSmartAutoApprove,
        withdrawalSmartApproveDelayMinutes: config.withdrawalSmartApproveDelayMinutes,
        withdrawalPaystackBufferNgn: config.withdrawalPaystackBufferNgn,
        withdrawalInstantMaxNgn: config.withdrawalInstantMaxNgn,
        createdAt: config.createdAt,
        updatedAt: config.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Error updating money transfer config:", error)
    return NextResponse.json(
      { error: error.message || "Failed to update config" },
      { status: 500 }
    )
  }
}
