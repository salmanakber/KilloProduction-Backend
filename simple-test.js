const WebSocket = require('ws');

console.log('🧪 Testing WebSocket connection...');

const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connected!');
  ws.close();
});

ws.on('error', (error) => {
  console.log('❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket closed: ${code} - ${reason}`);
  process.exit(0);
});


