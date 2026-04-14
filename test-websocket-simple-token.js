const WebSocket = require('ws');
const { SignJWT } = require('jose');

// Create a test token directly
const createTestToken = async () => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');
  
  const token = await new SignJWT({
    userId: 'test-user-id',
    email: 'test@example.com',
    role: 'RIDER',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
    
  return token;
};

// Test WebSocket with a test token
const testWebSocketWithTestToken = async () => {
  console.log('🧪 Testing WebSocket connection with test token...');
  
  try {
    // Create a test token
    const token = await createTestToken();
    console.log('🔑 Created test token:', token.substring(0, 20) + '...');
    
    // Test WebSocket connection
    await testWebSocketConnection(token);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
};

const testWebSocketConnection = async (token) => {
  console.log('🔌 Testing WebSocket connection with token...');
  
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:3000/ws?token=${encodeURIComponent(token)}`);
    
    ws.on('open', () => {
      console.log('✅ WebSocket connected successfully with token!');
      
      // Send a test message
      ws.send(JSON.stringify({
        type: 'ping',
        payload: { timestamp: Date.now() }
      }));
      
      // Close after 3 seconds
      setTimeout(() => {
        ws.close();
      }, 3000);
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
      console.log('🔌 Close code meanings:');
      console.log('  - 1000: Normal closure');
      console.log('  - 1008: Policy violation (likely invalid token)');
      console.log('  - 1011: Server error');
      resolve(true);
    });
  });
};

// Run the test
testWebSocketWithTestToken().then(() => {
  console.log('\n🏁 Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});


