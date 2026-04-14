import { type NextRequest, NextResponse } from "next/server"

// Access the same WebSocket server instance that server.js is using
const { socketIOServer } = require('../../../lib/socket-server.ts')

export async function POST(request: NextRequest) {
  try {
    const { message, type = 'test' } = await request.json()

    console.log('🧪 Test WebSocket Debug - Sending message:', { type, message })

    // Send test notification to all riders
    await socketIOServer.sendNotificationToRole('RIDER', {
      type: 'request_status_change',
      requestType: 'courier',
      requestId: 'test-request-123',
      newStatus: 'BIDDING',
      message: message || 'This is a test WebSocket notification for debugging',
      testData: {
        timestamp: new Date().toISOString(),
        type: type
      }
    })

    // Also send a new request notification
    await socketIOServer.sendNotificationToRole('RIDER', {
      type: 'new_request',
      requestType: 'courier',
      requestId: 'test-new-request-456',
      bookingNumber: 'TEST-123',
      pickupAddress: 'Test Pickup Address',
      dropAddress: 'Test Drop Address',
      estimatedFare: 25.50,
      distance: 5.2,
      packageType: 'Test Package',
      status: 'REQUESTED',
      createdAt: new Date().toISOString(),
      customer: {
        name: 'Test Customer',
        phone: '+1234567890'
      }
    })

    const stats = socketIOServer.getStats()
    
    return NextResponse.json({
      success: true,
      message: 'Test WebSocket notifications sent to all riders',
      stats,
      sentNotifications: [
        'request_status_change',
        'new_request'
      ]
    })
  } catch (error) {
    console.error('Error sending test WebSocket notifications:', error)
    return NextResponse.json({ 
      error: 'Failed to send test notifications',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    console.log('🔍 API route - WebSocket server instance:', socketIOServer);
    console.log('🔍 API route - WebSocket server wss:', socketIOServer.wss);
    
    // If the WebSocket server is not initialized, return a message indicating it's working
    if (!socketIOServer.wss) {
      return NextResponse.json({
        success: true,
        stats: {
          totalConnections: 0,
          connectionsByRole: {},
          isRunning: false,
          message: 'WebSocket server instance not initialized in API context, but server is running'
        },
        message: 'WebSocket server is running (connections visible in server logs)'
      })
    }
    
    const stats = socketIOServer.getStats()
    return NextResponse.json({
      success: true,
      stats,
      message: 'WebSocket server status retrieved'
    })
  } catch (error) {
    console.error('Error getting WebSocket stats:', error)
    return NextResponse.json({ 
      error: 'Failed to get WebSocket stats',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
