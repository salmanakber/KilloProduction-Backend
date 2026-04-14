// lib/socket-init.ts
import { getGlobalSocketServer } from './socket-server';

let isInitialized = false;

export function ensureSocketServerInitialized() {
  if (isInitialized) {
    return;
  }

  const socketServer = getGlobalSocketServer();
  console.log('🔌 Ensuring socket server is initialized...');
  console.log('🔌 Socket server instance:', !!socketServer);
  console.log('🔌 Socket server stats:', socketServer.getStats());
  
  isInitialized = true;
}

// Export a function that API routes can call to ensure socket server is ready
export function getSocketServer() {
  ensureSocketServerInitialized();
  return getGlobalSocketServer();
}
