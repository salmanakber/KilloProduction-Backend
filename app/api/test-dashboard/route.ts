import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    // Test the raw SQL query that was causing issues
    const testQuery = await prisma.$queryRaw`
      SELECT 
        TO_CHAR(NOW(), 'YYYY-MM') as month,
        1000 as revenue,
        5 as orders
      LIMIT 1
    `
    
    // Test with actual orders table structure
    const testOrdersQuery = await prisma.$queryRaw`
      SELECT 
        TO_CHAR(created_at, 'YYYY-MM') as month,
        SUM(total) as revenue,
        COUNT(*) as orders
      FROM orders 
      WHERE created_at >= NOW() - INTERVAL '1 month'
      GROUP BY TO_CHAR(created_at, 'YYYY-MM')
      LIMIT 1
    `

    return NextResponse.json({
      success: true,
      message: "Dashboard test successful",
      testQuery,
      testOrdersQuery,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error("Dashboard test error:", error)
    return NextResponse.json({ 
      error: "Dashboard test failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
