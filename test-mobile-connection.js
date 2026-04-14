const { io } = require('socket.io-client');

// Test mobile client connection to Socket.IO server
console.log('🧪 Testing mobile client connection to Socket.IO server...');

const socket = io('http://localhost:3000', {
  path: '/api/socketio',
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO server');
  console.log('📱 Socket ID:', socket.id);
  
  // Test authentication with a dummy token
  console.log('🔑 Attempting authentication...');
  socket.emit('authenticate', { token: 'test-token-123' });
});

socket.on('authenticated', () => {
  console.log('✅ Authentication successful');
  
  // Test sending a ping
  console.log('📡 Sending ping...');
  socket.emit('ping', { ts: Date.now() });
});

socket.on('auth_error', (error) => {
  console.log('❌ Authentication failed (expected):', error);
  console.log('ℹ️ This is expected since we used a dummy token');
});

socket.on('pong', () => {
  console.log('✅ Pong received from server');
});

socket.on('notification', (data) => {
  console.log('📨 Notification received:', data);
});

socket.on('new_request', (data) => {
  console.log('📨 New request received:', data);
});

socket.on('request_status_change', (data) => {
  console.log('📨 Request status change received:', data);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection error:', error);
});

// Keep the script running for 10 seconds
setTimeout(() => {
  console.log('🧪 Test completed');
  socket.disconnect();
  process.exit(0);
}, 10000);

