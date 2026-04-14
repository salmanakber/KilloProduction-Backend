const { io } = require('socket.io-client');

// Test Socket.IO connection
const socket = io('http://localhost:3000', {
  path: '/api/socketio',
  transports: ['websocket']
});

socket.on('connect', () => {
  console.log('✅ Connected to Socket.IO server');
  
  // Test authentication (you'll need a valid token)
  socket.emit('authenticate', { token: 'test-token' });
});

socket.on('authenticated', () => {
  console.log('✅ Authentication successful');
});

socket.on('auth_error', (error) => {
  console.log('❌ Authentication failed:', error);
});

socket.on('notification', (data) => {
  console.log('📨 Notification received:', data);
});

socket.on('new_request', (data) => {
  console.log('📨 New request received:', data);
});

socket.on('request_status_change', (data) => {
  console.log('📨 Request status change:', data);
});

socket.on('disconnect', () => {
  console.log('🔌 Disconnected from server');
});

socket.on('connect_error', (error) => {
  console.log('❌ Connection error:', error);
});

// Keep the script running
setTimeout(() => {
  console.log('Test completed');
  socket.disconnect();
  process.exit(0);
}, 10000);

