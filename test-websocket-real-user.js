const WebSocket = require('ws');
const { SignJWT } = require('jose');

// Create a test token with a real user ID
const createTestToken = async (userId) => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key');
  
  const token = await new SignJWT({
    userId: userId,
    email: 'test@example.com',
    role: 'CUSTOMER',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
    
  return token;
};

// Test WebSocket with a real user token
const testWebSocketWithRealUser = async () => {
  console.log('🧪 Testing WebSocket connection with real user token...');
  
  try {
    // Use the first user ID from the database
    const userId = 'cmew84t210006izvifzjiyy0l'; // Super Admin user ID
    
    // Create a test token
    const token = await createTestToken(userId);
    console.log('🔑 Created test token for user:', userId);
    console.log('🔑 Token preview:', token.substring(0, 20) + '...');
    
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
testWebSocketWithRealUser().then(() => {
  console.log('\n🏁 Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
