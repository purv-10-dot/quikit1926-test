/**
 * QuikSkill worker entrypoint — Socket.IO gateways (/messages, /exams),
 * cron scheduler, and the TUS upload server, all on one HTTP server.
 */
import 'dotenv/config';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { env } from './env.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { registerExamNamespace } from './sockets/exams.js';
import { registerMessagesNamespace, emitToConversation, MESSAGES_NAMESPACE } from './sockets/messages.js';
import { startCron } from './cron.js';
import { tusServer } from './tus.js';
import { prisma } from './db.js';

const MAX_EMIT_BODY_BYTES = 256 * 1024;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Read a size-capped JSON request body. Returns null on overflow / bad JSON. */
function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_EMIT_BODY_BYTES) { req.destroy(); resolve(null); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * POST /internal/emit — server-to-server socket broadcast.
 *
 * The Next app owns chat persistence over REST but holds no socket, so a
 * message saved there reached nobody in real time. This lets it ask the worker
 * to fan the event out. Trusted-caller only: guarded by the shared
 * INTERNAL_SECRET, never exposed to browsers, and it touches no database.
 *
 * Body: { namespace: "/messages", room: "conv:<id>", event: string, data: any }
 */
async function handleInternalEmit(req: IncomingMessage, res: ServerResponse) {
  // Unset secret ⇒ endpoint is closed, not open.
  if (!env.INTERNAL_SECRET || req.headers['x-internal-secret'] !== env.INTERNAL_SECRET) {
    json(res, 401, { error: 'unauthorized' });
    return;
  }
  const body = await readJsonBody(req);
  if (!body) { json(res, 400, { error: 'invalid json body' }); return; }

  const { namespace, room, event, data } = body as {
    namespace?: unknown; room?: unknown; event?: unknown; data?: unknown;
  };
  if (typeof namespace !== 'string' || !namespace.startsWith('/')) { json(res, 400, { error: 'invalid namespace' }); return; }
  if (typeof room !== 'string' || !room) { json(res, 400, { error: 'invalid room' }); return; }
  if (typeof event !== 'string' || !event) { json(res, 400, { error: 'invalid event' }); return; }

  if (namespace === MESSAGES_NAMESPACE) emitToConversation(io, room, event, data);
  else io.of(namespace).to(room).emit(event, data);
  json(res, 200, { ok: true });
}

const httpServer = createServer((req, res) => {
  const url = req.url || '';
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'quikskill-worker' }));
    return;
  }
  if (url.split('?')[0] === '/internal/emit') {
    if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return; }
    void handleInternalEmit(req, res).catch(() => json(res, 500, { error: 'emit failed' }));
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
