#!/usr/bin/env node
/** Quick check: Socket.IO over HTTPS vs direct IP */
const { io } = require("socket.io-client")

const targets = [
  process.env.SOCKET_TEST_URL || "https://api.kilo1app.com",
  process.env.SOCKET_TEST_FALLBACK || "http://209.97.132.83:3000",
]

async function test(url) {
  return new Promise((resolve) => {
    const socket = io(url, {
      path: "/api/socketio",
      transports: ["polling", "websocket"],
      reconnection: false,
      timeout: 12000,
    })
    socket.on("connect", () => {
      const transport = socket.io.engine?.transport?.name
      console.log(`✅ ${url} connected (${transport}) id=${socket.id}`)
      socket.disconnect()
      resolve(true)
    })
    socket.on("connect_error", (err) => {
      console.log(`❌ ${url} failed: ${err.message}`)
      resolve(false)
    })
    setTimeout(() => {
      console.log(`⏱️  ${url} timed out`)
      socket.disconnect()
      resolve(false)
    }, 13000)
  })
}

;(async () => {
  for (const url of targets) {
    await test(url)
  }
})()
