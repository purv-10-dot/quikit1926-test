/**
 * /messages Socket.IO namespace — ported from MessagesGateway.
 * JWT handshake auth, presence, rate limit (20 msgs / 60s / user), and the
 * full event set: joinConversation/leaveConversation, sendMessage→newMessage +
 * conversationUpdated, editMessage→messageEdited, deleteMessage→messageDeleted,
 * reactToMessage→messageReaction, typing→userTyping, markRead.
 */
import type { Server, Socket } from 'socket.io';
import { prisma } from '../db.js';
import { verifySocketToken } from '../jwt.js';

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

interface MsgSocket extends Socket {
  userId?: string;
  tenantId?: string | null;
}

const rate = new Map<string, { count: number; resetAt: number }>();
const online = new Map<string, number>(); // userId → socket count

function allowed(userId: string): boolean {
  const now = Date.now();
  const entry = rate.get(userId);
  if (!entry || now > entry.resetAt) {
    rate.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

export function registerMessagesNamespace(io: Server): void {
  const ns = io.of('/messages');

  // Periodic rate-bucket cleanup
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of rate) if (now > v.resetAt) rate.delete(k);
  }, RATE_LIMIT_WINDOW_MS);
  cleanup.unref?.();

  ns.use(async (socket: MsgSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    const claims = token ? await verifySocketToken(token) : null;
    if (!claims?.sub) return next(new Error('unauthorized'));
    socket.userId = claims.sub;
    socket.tenantId = claims.tenantId ?? null;
    next();
  });

  ns.on('connection', (socket: MsgSocket) => {
    const uid = socket.userId!;
    online.set(uid, (online.get(uid) || 0) + 1);
    ns.emit('presence', { userId: uid, status: 'online' });

    socket.on('joinConversation', (data: { conversationId: string }) => {
      socket.join(`conv:${data.conversationId}`);
    });
    socket.on('leaveConversation', (data: { conversationId: string }) => {
      socket.leave(`conv:${data.conversationId}`);
    });

    socket.on('sendMessage', async (data: { conversationId: string; text: string; attachmentUrls?: string[]; replyTo?: string }) => {
      if (!allowed(uid)) {
        socket.emit('rateLimited', { message: 'Too many messages. Please slow down.' });
        return;
      }
      try {
        // Membership check
        const participant = await prisma.lmsConversationParticipant.findFirst({
          where: { conversationId: data.conversationId, userId: uid },
        });
        if (!participant) return;

        const message = await prisma.lmsMessage.create({
          data: {
            conversationId: data.conversationId,
            senderId: uid,
            text: data.text,
            attachmentUrls: data.attachmentUrls ?? [],
            replyTo: data.replyTo ?? null,
          },
        });
        await prisma.lmsConversation.update({
          where: { id: data.conversationId },
          data: { lastMessageText: data.text, lastMessageAt: new Date(), lastMessageBy: uid, messageCount: { increment: 1 } },
        });
        ns.to(`conv:${data.conversationId}`).emit('newMessage', message);
        ns.to(`conv:${data.conversationId}`).emit('conversationUpdated', {
          conversationId: data.conversationId,
          lastMessageText: data.text,
          lastMessageAt: message.createdAt,
        });
      } catch (e) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('editMessage', async (data: { conversationId: string; messageId: string; text: string }) => {
      const msg = await prisma.lmsMessage.findUnique({ where: { id: data.messageId } });
      if (!msg || msg.senderId !== uid) return;
      const updated = await prisma.lmsMessage.update({ where: { id: data.messageId }, data: { text: data.text, isEdited: true, editedAt: new Date() } });
      ns.to(`conv:${updated.conversationId}`).emit('messageEdited', updated);
    });

    socket.on('deleteMessage', async (data: { conversationId: string; messageId: string }) => {
      const msg = await prisma.lmsMessage.findUnique({ where: { id: data.messageId } });
      if (!msg || msg.senderId !== uid) return;
      await prisma.lmsMessage.update({ where: { id: data.messageId }, data: { isDeleted: true, deletedBy: uid, deletedAt: new Date() } });
      ns.to(`conv:${data.conversationId}`).emit('messageDeleted', { messageId: data.messageId });
    });

    socket.on('reactToMessage', async (data: { conversationId: string; messageId: string; emoji: string }) => {
      const existing = await prisma.lmsMessageReaction.findFirst({ where: { messageId: data.messageId, userId: uid, emoji: data.emoji } });
      if (existing) await prisma.lmsMessageReaction.delete({ where: { id: existing.id } });
      else await prisma.lmsMessageReaction.create({ data: { messageId: data.messageId, userId: uid, emoji: data.emoji } });
      ns.to(`conv:${data.conversationId}`).emit('messageReaction', { messageId: data.messageId, userId: uid, emoji: data.emoji, removed: !!existing });
    });

    socket.on('typing', (data: { conversationId: string; isTyping: boolean }) => {
      socket.to(`conv:${data.conversationId}`).emit('userTyping', { userId: uid, conversationId: data.conversationId, isTyping: data.isTyping });
    });

    socket.on('markRead', async (data: { conversationId: string }) => {
      await prisma.lmsConversationParticipant.updateMany({
        where: { conversationId: data.conversationId, userId: uid },
        data: { lastReadAt: new Date() },
      });
      ns.to(`conv:${data.conversationId}`).emit('messagesRead', { conversationId: data.conversationId, userId: uid });
    });

    socket.on('disconnect', () => {
      const n = (online.get(uid) || 1) - 1;
      if (n <= 0) {
        online.delete(uid);
        ns.emit('presence', { userId: uid, status: 'offline' });
      } else {
        online.set(uid, n);
      }
    });
  });
}
