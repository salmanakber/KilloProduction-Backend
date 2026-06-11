// pages/api/socketio.ts
import { NextApiRequest, NextApiResponse } from "next";
import { getGlobalSocketServer } from "../../lib/socket-server";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const httpServer = (res.socket as any)?.server;

  if (httpServer) {
    const socketServer = getGlobalSocketServer();
    socketServer.initialize(httpServer);

    return res.status(200).json({
      status: "Socket.IO ready",
      stats: socketServer.getStats(),
    });
  }

  return res.status(500).json({ error: "Server not available" });
}
