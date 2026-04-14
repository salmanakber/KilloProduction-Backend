// pages/api/socketio.ts
import { NextApiRequest, NextApiResponse } from "next";
import { socketIOServer, getGlobalSocketServer } from "../../lib/socket-server";

export default function handler(req: NextApiRequest, res: NextApiResponse) {

  if ((res.socket as any)?.server) {
    // Always initialize the socketIOServer, even if io already exists
    socketIOServer.initialize((res.socket as any).server);
    
    // Update the global instance
    if (typeof global !== 'undefined') {
      global.__socketIOServer = socketIOServer;
    }
    
    return res.status(200).json({ status: "Socket.IO ready" });
  }
  
  return res.status(500).json({ error: "Server not available" });
}
