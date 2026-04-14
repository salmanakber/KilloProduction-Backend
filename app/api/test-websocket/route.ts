import { type NextRequest, NextResponse } from "next/server"
import { socketIOServer } from "@/lib/socket-server"

export async function POST(request: NextRequest) {
  try {
    const { message, type = 'test' } = await request.json()

    // Send test notification to all riders
    await socketIOServer.sendNotificationToRole('RIDER', {
      type: 'new_request',
      requestType: 'test',
      requestId: 'test-' + Date.now(),
      message: message || 'This is a test WebSocket notification',
      testData: {
        timestamp: new Date().toISOString(),
        type: type
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Test WebSocket notification sent to all riders',
      stats: socketIOServer.getStats()
    })
  } catch (error) {
    console.error('Error sending test WebSocket notification:', error)
    return NextResponse.json({ error: 'Failed to send test notification' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const stats = socketIOServer.getStats()
    return NextResponse.json({
      success: true,
      stats,
      message: 'WebSocket server is running'
    })
  } catch (error) {
    console.error('Error getting WebSocket stats:', error)
    return NextResponse.json({ error: 'Failed to get WebSocket stats' }, { status: 500 })
  }
}
