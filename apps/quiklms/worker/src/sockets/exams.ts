/**
 * /exams Socket.IO namespace — ported from ExamGateway.
 * JWT handshake auth; on joinExam emits timerSync every 30s, examWarning at the
 * 5-minute and 1-minute marks, and forceSubmit at deadline (also triggers the
 * server-side auto-submit).
 */
import type { Server, Socket } from 'socket.io';
import { prisma } from '../db.js';
import { verifySocketToken } from '../jwt.js';
import { autoSubmitSession } from '../jobs/exam-auto-submit.js';

interface ExamSocket extends Socket {
  userId?: string;
  tenantId?: string | null;
  examSessionId?: string;
}

const timers = new Map<string, NodeJS.Timeout>();

async function status(tenantId: string, sessionId: string) {
  const session = await prisma.examSession.findFirst({ where: { id: sessionId, tenantId } });
  if (!session) return null;
  const deadline = session.serverDeadline ? new Date(session.serverDeadline).getTime() : 0;
  const remainingSeconds = deadline ? Math.max(0, Math.floor((deadline - Date.now()) / 1000)) : 0;
  const answers = (session.answers as Record<string, unknown>) || {};
  return { remainingSeconds, answeredCount: Object.keys(answers).length, status: session.status };
}

export function registerExamNamespace(io: Server): void {
  const ns = io.of('/exams');

  ns.use(async (socket: ExamSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const claims = token ? await verifySocketToken(token) : null;
    if (!claims?.sub) return next(new Error('unauthorized'));
    socket.userId = claims.sub;
    socket.tenantId = claims.tenantId ?? null;
    next();
  });

  ns.on('connection', (socket: ExamSocket) => {
    socket.on('joinExam', async (data: { sessionId: string }) => {
      const room = `exam:${data.sessionId}`;
      socket.join(room);
      socket.examSessionId = data.sessionId;
      const key = `${data.sessionId}:${socket.userId}`;

      if (!timers.has(key)) {
        const interval = setInterval(async () => {
          try {
            const s = await status(socket.tenantId!, data.sessionId);
            if (!s) throw new Error('gone');
            socket.emit('timerSync', { remainingSeconds: s.remainingSeconds, answeredCount: s.answeredCount });
            if (s.remainingSeconds <= 300 && s.remainingSeconds > 270) {
              socket.emit('examWarning', { message: '5 minutes remaining', remainingSeconds: s.remainingSeconds });
            }
            if (s.remainingSeconds <= 60 && s.remainingSeconds > 30) {
              socket.emit('examWarning', { message: '1 minute remaining', remainingSeconds: s.remainingSeconds });
            }
            if (s.remainingSeconds <= 0) {
              await autoSubmitSession(data.sessionId).catch(() => {});
              ns.to(room).emit('forceSubmit', { reason: 'timeout' });
              clearInterval(interval);
              timers.delete(key);
            }
          } catch {
            clearInterval(interval);
            timers.delete(key);
          }
        }, 30_000);
        timers.set(key, interval);
      }
      socket.emit('joinedExam', { sessionId: data.sessionId });
    });

    socket.on('leaveExam', () => {
      if (socket.examSessionId) {
        socket.leave(`exam:${socket.examSessionId}`);
        const key = `${socket.examSessionId}:${socket.userId}`;
        const t = timers.get(key);
        if (t) { clearInterval(t); timers.delete(key); }
      }
    });

    socket.on('disconnect', () => {
      if (socket.examSessionId) {
        const key = `${socket.examSessionId}:${socket.userId}`;
        const t = timers.get(key);
        if (t) { clearInterval(t); timers.delete(key); }
      }
    });
  });
}
