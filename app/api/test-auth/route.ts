import { type NextRequest, NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    
    if (!user) {
      return NextResponse.json({ 
        error: "Unauthorized",
        message: "No valid token found in Authorization header"
      }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      message: "Authentication successful",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    })
  } catch (error) {
    console.error("Test auth error:", error)
    return NextResponse.json({ 
      error: "Authentication failed",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}
