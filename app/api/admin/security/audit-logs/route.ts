import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (user?.role !== "ADMIN" && user?.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Mock audit logs data
    const logs = [
      {
        id: "1",
        adminId: "admin123",
        adminName: "John Admin",
        action: "USER_SUSPENDED",
        module: "USER_MANAGEMENT",
        targetId: "user456",
        targetType: "USER",
        details: {
          reason: "Violation of terms of service",
          previousStatus: "ACTIVE",
          newStatus: "SUSPENDED",
        },
        timestamp: "2024-01-20T14:30:00Z",
        ipAddress: "192.168.1.100",
      },
      {
        id: "2",
        adminId: "admin123",
        adminName: "John Admin",
        action: "COMMISSION_RATE_UPDATED",
        module: "COMMISSION_MANAGEMENT",
        targetId: "pharmacy",
        targetType: "MODULE",
        details: {
          previousRate: 5.0,
          newRate: 5.5,
          effectiveDate: "2024-02-01",
        },
        timestamp: "2024-01-20T13:15:00Z",
        ipAddress: "192.168.1.100",
      },
      {
        id: "3",
        adminId: "admin789",
        adminName: "Jane Admin",
        action: "WITHDRAWAL_APPROVED",
        module: "PAYMENT_MANAGEMENT",
        targetId: "withdrawal123",
        targetType: "WITHDRAWAL",
        details: {
          amount: 15000,
          vendorId: "vendor456",
          vendorName: "MediCare Pharmacy",
        },
        timestamp: "2024-01-20T12:45:00Z",
        ipAddress: "10.0.0.50",
      },
      {
        id: "4",
        adminId: "admin456",
        adminName: "Mike Admin",
        action: "CAMPAIGN_CREATED",
        module: "MARKETING",
        targetId: "campaign789",
        targetType: "CAMPAIGN",
        details: {
          campaignName: "New Year Pharmacy Discount",
          budget: 50000,
          targetAudience: "PHARMACY_CUSTOMERS",
        },
        timestamp: "2024-01-20T11:20:00Z",
        ipAddress: "172.16.0.25",
      },
      {
        id: "5",
        adminId: "admin123",
        adminName: "John Admin",
        action: "VENDOR_VERIFIED",
        module: "VENDOR_MANAGEMENT",
        targetId: "vendor890",
        targetType: "VENDOR",
        details: {
          vendorName: "Quick Auto Parts",
          verificationType: "BUSINESS_LICENSE",
          documentId: "doc123",
        },
        timestamp: "2024-01-20T10:30:00Z",
        ipAddress: "192.168.1.100",
      },
    ]

    return NextResponse.json({ logs })
  } catch (error) {
    console.error("Error fetching audit logs:", error)
    return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 })
  }
}
