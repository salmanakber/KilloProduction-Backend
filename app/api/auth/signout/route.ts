import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    // Create response with cleared cookie
    const response = NextResponse.json({
      success: true,
      message: "Successfully signed out"
    })

    // Clear the admin-token cookie
    response.cookies.set({
      name: "admin-token",
      value: "",
      expires: new Date(0), // Set to past date to expire immediately
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    })

    return response
  } catch (error) {
    console.error("Signout error:", error)
    return NextResponse.json({ 
      error: "Failed to sign out" 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Create response with cleared cookie
    const response = NextResponse.json({
      success: true,
      message: "Successfully signed out"
    })

    // Clear the admin-token cookie
    response.cookies.set({
      name: "admin-token",
      value: "",
      expires: new Date(0), // Set to past date to expire immediately
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    })

    return response
  } catch (error) {
    console.error("Signout error:", error)
    return NextResponse.json({ 
      error: "Failed to sign out" 
    }, { status: 500 })
  }
}
