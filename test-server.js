const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Prepare the Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO server
  try {
    const { socketIOServer } = require('./lib/socket-server.ts');
    socketIOServer.initialize(server);
    console.log('✅ Socket.IO server initialized successfully');
  } catch (error) {
    console.error('❌ Socket.IO server initialization failed:', error);
  }

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`✅ Server ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error('❌ Server preparation failed:', err);
  process.exit(1);
});
