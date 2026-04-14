const WebSocket = require('ws');

// Simple WebSocket test without authentication
const testWebSocket = () => {
  console.log('🔌 Testing WebSocket connection without auth...');
  
  const ws = new WebSocket('ws://localhost:3000/ws');
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
    
    // Send a test message
    ws.send(JSON.stringify({
      type: 'ping',
      payload: { message: 'Hello from test client' }
    }));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', message);
    } catch (error) {
      console.log('📨 Received raw message:', data.toString());
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
  });
  
  // Close connection after 5 seconds
  setTimeout(() => {
    ws.close();
    console.log('🔌 Test completed');
  }, 5000);
};

// Test with authentication token
const testWebSocketWithAuth = (token) => {
  console.log('🔌 Testing WebSocket connection with auth...');
  
  const ws = new WebSocket(`ws://localhost:3000/ws?token=${encodeURIComponent(token)}`);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected successfully with auth!');
    
    // Send a test message
    ws.send(JSON.stringify({
      type: 'ping',
      payload: { message: 'Hello from authenticated test client' }
    }));
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received message:', message);
    } catch (error) {
      console.log('📨 Received raw message:', data.toString());
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
  });
  
  // Close connection after 5 seconds
  setTimeout(() => {
    ws.close();
    console.log('🔌 Auth test completed');
  }, 5000);
};

// Run tests
console.log('🚀 Starting WebSocket tests...');

// Test 1: Without authentication (should fail with 1008)
testWebSocket();

// Test 2: With authentication (if you have a token)
// testWebSocketWithAuth('your_token_here');

console.log('📝 Note: Test 1 should fail with code 1008 (no auth token)');
console.log('📝 Test 2 should succeed if you provide a valid token');


