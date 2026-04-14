const WebSocket = require('ws');
const axios = require('axios');

// Test the complete WebSocket flow
const testCompleteWebSocketFlow = async () => {
  console.log('🚀 Starting complete WebSocket flow test...');
  
  try {
    // First, test the server status
    console.log('\n1️⃣ Testing server status...');
    const response = await axios.get('http://localhost:3000/api/test-websocket-debug');
    console.log('✅ Server status:', response.data);
    
    // Test WebSocket connection without auth (should fail)
    console.log('\n2️⃣ Testing WebSocket without auth (should fail)...');
    await testWebSocketConnection(false);
    
    // Test WebSocket connection with invalid token (should fail)
    console.log('\n3️⃣ Testing WebSocket with invalid token (should fail)...');
    await testWebSocketConnection(true, 'invalid_token');
    
    // Test sending notification via API
    console.log('\n4️⃣ Testing notification via API...');
    try {
      const notificationResponse = await axios.post('http://localhost:3000/api/test-websocket-debug', {
        type: 'test_notification',
        message: 'Test notification from API'
      });
      console.log('✅ Notification sent via API:', notificationResponse.data);
    } catch (error) {
      console.log('❌ Failed to send notification via API:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
};

const testWebSocketConnection = (withAuth = false, token = null) => {
  return new Promise((resolve) => {
    const wsUrl = withAuth && token 
      ? `ws://localhost:3000/ws?token=${encodeURIComponent(token)}`
      : 'ws://localhost:3000/ws';
    
    console.log(`🔌 Connecting to: ${wsUrl.replace(token || '', '[TOKEN]')}`);
    
    const ws = new WebSocket(wsUrl);
    let connected = false;
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully!');
      connected = true;
      
      // Send a ping
      ws.send(JSON.stringify({
        type: 'ping',
        payload: { timestamp: Date.now() }
      }));
      
      // Close after 2 seconds
      setTimeout(() => {
        ws.close();
      }, 2000);
    });
    
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', message);
    });
    
    ws.on('error', (error) => {
      console.log('❌ WebSocket connection failed:', error.message);
      resolve(false);
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
      resolve(connected);
    });
  });
};

// Run the test
testCompleteWebSocketFlow().then(() => {
  console.log('\n🏁 Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});


