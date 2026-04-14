const WebSocket = require('ws');
const axios = require('axios');

// Test WebSocket with a valid token
const testWebSocketWithToken = async () => {
  console.log('🧪 Testing WebSocket connection with token...');
  
  try {
    // First, let's try to get a valid token by creating a test user or using existing one
    console.log('1️⃣ Attempting to get a valid token...');
    
    // Check if there are any existing users in the database
    const testResponse = await axios.get('http://localhost:3000/api/test-auth', {
      headers: {
        'Authorization': 'Bearer test-token' // This will fail, but let's see the response
      }
    });
    
    console.log('✅ Got response:', testResponse.data);
    
  } catch (error) {
    console.log('❌ Auth test failed:', error.response?.data || error.message);
    
    // Let's try to create a test user or find an existing one
    console.log('2️⃣ Trying to find existing users...');
    
    try {
      // Try to get admin users
      const adminResponse = await axios.post('http://localhost:3000/api/admin/auth/login', {
        email: 'admin@test.com',
        password: 'password123'
      });
      
      console.log('✅ Admin login successful:', adminResponse.data);
      
      // Extract token from cookie or response
      const token = adminResponse.headers['set-cookie']?.[0]?.split('admin-token=')[1]?.split(';')[0];
      
      if (token) {
        console.log('🔑 Got token, testing WebSocket...');
        await testWebSocketConnection(token);
      } else {
        console.log('❌ No token found in response');
      }
      
    } catch (adminError) {
      console.log('❌ Admin login failed:', adminError.response?.data || adminError.message);
      
      // Try to create a test user
      console.log('3️⃣ Trying to create a test user...');
      
      try {
        const createUserResponse = await axios.post('http://localhost:3000/api/auth/register', {
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'RIDER',
          phone: '+1234567890'
        });
        
        console.log('✅ User created:', createUserResponse.data);
        
        // Try to login with the created user
        const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
          email: 'test@example.com',
          password: 'password123'
        });
        
        console.log('✅ User login successful:', loginResponse.data);
        
        // Extract token
        const token = loginResponse.data.token || loginResponse.data.accessToken;
        
        if (token) {
          console.log('🔑 Got token, testing WebSocket...');
          await testWebSocketConnection(token);
        } else {
          console.log('❌ No token found in login response');
        }
        
      } catch (userError) {
        console.log('❌ User creation/login failed:', userError.response?.data || userError.message);
      }
    }
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
      resolve(true);
    });
  });
};

// Run the test
testWebSocketWithToken().then(() => {
  console.log('\n🏁 Test completed!');
  process.exit(0);
}).catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});


