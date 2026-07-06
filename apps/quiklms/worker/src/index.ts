/**
 * QuikSkill worker entrypoint — Socket.IO gateways (/messages, /exams),
 * cron scheduler, and the TUS upload server, all on one HTTP server.
 */
import 'dotenv/config';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { env } from './env.js';
import { registerExamNamespace } from './sockets/exams.js';
import { registerMessagesNamespace } from './sockets/messages.js';
import { startCron } from './cron.js';
import { tusServer } from './tus.js';
import { prisma } from './db.js';

const httpServer = createServer((req, res) => {
  const url = req.url || '';
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'quikskill-worker' }));
    return;
  }
  if (url.startsWith('/uploads')) {
    tusServer.handle(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
});

// Socket.IO (shares the HTTP server). With credentials:true the CORS origin
// MUST be an explicit allow-list (the '*' wildcard is invalid + insecure when
// credentials are sent). Read allowed origins from env (comma-separated),
// falling back to the configured frontend/API URLs.
const allowedOrigins = [
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
  ...(process.env.NEXT_PUBLIC_API_URL ? process.env.NEXT_PUBLIC_API_URL.split(',') : []),
]
  .map((o) => o.trim())
  .filter(Boolean);
const io = new SocketServer(httpServer, {
  cors: { origin: allowedOrigins.length > 0 ? allowedOrigins : ['http://localhost:3020'], credentials: true },
});
registerExamNamespace(io);
registerMessagesNamespace(io);

async function main() {
  startCron();

  httpServer.listen(env.PORT, () => {
    console.log(`[worker] listening on :${env.PORT} — sockets(/messages,/exams), cron, tus(/uploads)`);
  });
}

async function shutdown() {
  console.log('[worker] shutting down...');
  await prisma.$disconnect().catch(() => {});
  io.close();
  httpServer.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void main();
