const WebSocket = require('ws');

// Test WebSocket connection
const testWebSocketConnection = () => {
  console.log('🧪 Testing WebSocket connection...');
  
  // Test without authentication first
  const ws = new WebSocket('ws://localhost:3000/ws');
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected successfully!');
    ws.close();
  });
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket connection failed:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
  });
};

// Test with authentication
const testWebSocketWithAuth = (token) => {
  console.log('🧪 Testing WebSocket connection with auth...');
  
  const ws = new WebSocket(`ws://localhost:3000/ws?token=${encodeURIComponent(token)}`);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected with auth successfully!');
    
    // Send a test message
    ws.send(JSON.stringify({
      type: 'ping',
      payload: { timestamp: Date.now() }
    }));
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', message);
  });
  
  ws.on('error', (error) => {
    console.log('❌ WebSocket auth connection failed:', error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`🔌 WebSocket auth closed: ${code} - ${reason}`);
  });
  
  // Close after 5 seconds
  setTimeout(() => {
    ws.close();
  }, 5000);
};

// Run tests
console.log('🚀 Starting WebSocket tests...');
testWebSocketConnection();

// Uncomment and provide a valid token to test with authentication
// testWebSocketWithAuth('your_token_here');


