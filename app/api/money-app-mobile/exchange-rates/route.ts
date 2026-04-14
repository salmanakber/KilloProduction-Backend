import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"


/**
 * Applies a margin to a currency conversion rate
 * so the sender sees a worse (lower) rate.
 *
 * @param baseRate - Real FX rate (e.g. 280 PKR per USD)
 * @param marginPercent - Margin percentage (e.g. 2 for 2%)
 * @returns Adjusted rate after margin
 */
export function applyFxMargin(baseRate: number, marginPercent: number): number {
    if (baseRate <= 0) throw new Error('Invalid base rate');
    if (marginPercent < 0) throw new Error('Invalid margin');
  
    // Apply margin to the rate
    const marginFactor = 1 - marginPercent / 100;
    const adjustedRate = baseRate * marginFactor;
  
    // Keep high precision for FX rates (6 decimals recommended)
    return Number(adjustedRate.toFixed(6));
  }
  

// Get exchange rate from exchangerate-api.com
async function getExchangeRate(fromCurrency: string, toCurrency: string) {
  try {
    // Get API key and margin from config or environment
    const config = await prisma.moneyTransferConfig.findFirst()
    const apiKey = config?.exchangeRateApiKey || process.env.EXCHANGE_RATE_API_KEY
    const margin = config?.exchangeRateMargin ?? 0.02 // Default 2% margin
    

    let baseRate: number | null = null

    if (!apiKey) {
      // Fallback to free tier (no API key needed for basic usage)
      const response = await fetch(
        `https://api.exchangerate-api.com/v4/latest/${fromCurrency}`
      )
      const data = await response.json()
      baseRate = data.rates[toCurrency] || null
    } else {
      // Use API key for better rate limits
      const response = await fetch(
        `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${fromCurrency}`
      )
      const data = await response.json()
      
      if (data.result === "success") {
        
        baseRate = data.conversion_rates[toCurrency] || null
        
      }
    }

    if (!baseRate) {
      return null
    }

    // Apply margin: rate / (1 + margin)
    // This reduces the rate shown to sender, so platform keeps the margin
    // e.g., if base rate is 280 PKR and margin is 0.05 (5%), 
    // rate becomes 280 / 1.05 = 266.67 PKR (sender gets less, platform keeps the difference)
    
    const rateWithMargin = applyFxMargin(baseRate, margin)

    

    return rateWithMargin
  } catch (error) {
    console.error("Error fetching exchange rate:", error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from") || "USD"
    const to = searchParams.get("to") || "NGN"
    
    const rate = await getExchangeRate(from, to)
    
    
    if (!rate) {
      return NextResponse.json(
        { error: "Failed to fetch exchange rate" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      from: from,
      to: to,
      rate: rate,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in exchange rate endpoint:", error)
    return NextResponse.json(
      { error: error.message || "Failed to get exchange rate" },
      { status: 500 }
    )
  }
}
