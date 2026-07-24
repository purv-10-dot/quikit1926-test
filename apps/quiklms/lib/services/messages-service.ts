/**
 * Messages service — ported from MessagesService (Prisma).
 *
 * Tenant isolation: conversations carry `orgId`; messages/reactions/participants
 * are scoped through their parent conversation. Every conversation lookup is scoped
 * by orgId AND participant membership (the legacy `'participants.userId': userId`
 * filter). Realtime broadcast (Socket.IO) lives in the worker (Phase 4) — these REST
 * handlers only persist + read.
 *
 * Response shapes mirror the legacy populated documents: participants[].userId and
 * senderId / lastMessageBy / replyTo are expanded into user objects (with `_id`),
 * since the Mongo controller returned populated mongoose docs.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, Forbidden, NotFound } from '@/lib/http';

const MAX_MESSAGE_LENGTH = 2000;

const PROFANITY_LIST = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'bastard', 'crap', 'dick',
  'piss', 'slut', 'whore', 'cunt', 'fag', 'nigger', 'retard',
];

// PRD-allowed conversation role pairs
const ALLOWED_ROLE_PAIRS: [string, string][] = [
  ['TEACHER', 'LEARNER'],
  ['TEACHER', 'PARENT'],
  ['PARENT', 'TEACHER'],
  ['TENANT_ADMIN', 'TEACHER'],
  ['TENANT_ADMIN', 'PARENT'],
  ['TENANT_ADMIN', 'LEARNER'],
  ['SUB_ADMIN', 'TEACHER'],
  ['SUB_ADMIN', 'PARENT'],
  ['SUB_ADMIN', 'LEARNER'],
  ['SUB_ADMIN', 'TENANT_ADMIN'],
  ['TEACHER', 'TENANT_ADMIN'],
  ['TEACHER', 'SUB_ADMIN'],
  ['PARENT', 'TENANT_ADMIN'],
  ['PARENT', 'SUB_ADMIN'],
  ['LEARNER', 'TEACHER'],
  ['LEARNER', 'SUB_ADMIN'],
];

function rolesAllowed(roleA: string, roleB: string): boolean {
  return ALLOWED_ROLE_PAIRS.some(
    ([a, b]) => (a === roleA && b === roleB) || (a === roleB && b === roleA),
  );
}

// Roles a given role may message
const MESSAGEABLE_ROLES: Record<string, string[]> = {
  TEACHER: ['LEARNER', 'PARENT', 'TENANT_ADMIN', 'SUB_ADMIN'],
  PARENT: ['TEACHER', 'TENANT_ADMIN', 'SUB_ADMIN'],
  LEARNER: ['TEACHER', 'SUB_ADMIN'],
  TENANT_ADMIN: ['TEACHER', 'PARENT', 'LEARNER', 'SUB_ADMIN'],
  SUB_ADMIN: ['TEACHER', 'PARENT', 'LEARNER', 'TENANT_ADMIN'],
  SUPER_ADMIN: ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER', 'PARENT', 'LEARNER'],
};

export interface CreateConversationInput {
  participantIds: string[];
  title?: string;
  description?: string;
  groupIcon?: string;
  type?: 'direct' | 'group';
  initialMessage?: string;
}
export interface SendMessageInput {
  text: string;
  attachmentUrls?: string[];
  replyTo?: string;
  forwardedFrom?: string;
}
export interface UpdateGroupInput {
  title?: string;
  description?: string;
  groupIcon?: string;
}

const USER_PUBLIC_SELECT = {
  id: true, firstName: true, lastName: true, email: true, role: true, profilePicture: true,
} satisfies Prisma.LmsUserSelect;

function moderateContent(text: string): { allowed: boolean; reason?: string } {
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { allowed: false, reason: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters.` };
  }
  const lower = text.toLowerCase();
  for (const word of PROFANITY_LIST) {
    const pattern = new RegExp(`\\b${word}\\b`, 'i');
    if (pattern.test(lower)) {
      return { allowed: false, reason: 'Message contains inappropriate language.' };
    }
  }
  return { allowed: true };
}

// Attach an `_id` alias so frontend code expecting the mongo shape keeps working.
function withMongoId<T extends { id: string }>(obj: T): T & { _id: string } {
  return { ...obj, _id: obj.id };
}

async function userMap(ids: string[]): Promise<Map<string, Record<string, unknown>>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const users = await prisma.lmsUser.findMany({ where: { id: { in: unique } }, select: USER_PUBLIC_SELECT });
  return new Map(users.map((u) => [u.id, withMongoId(u)]));
}

type ConvWithChildren = Prisma.LmsConversationGetPayload<{
  include: { participants: true };
}>;

/** Shape a conversation to mirror the legacy populated document. */
async function shapeConversation(conv: ConvWithChildren) {
  const userIds = [
    ...conv.participants.map((p) => p.userId),
    ...(conv.lastMessageBy ? [conv.lastMessageBy] : []),
  ];
  const users = await userMap(userIds);
  return {
    ...withMongoId(conv),
    participants: conv.participants.map((p) => ({
      ...withMongoId(p),
      userId: users.get(p.userId) ?? p.userId,
    })),
    lastMessageBy: conv.lastMessageBy ? users.get(conv.lastMessageBy) ?? conv.lastMessageBy : null,
  };
}

// ═══════════════ GET MESSAGEABLE CONTACTS (role-scoped) ═══════════════
export async function getMessageableContacts(
  orgId: string,
  userId: string,
  userRole: string,
  opts: { q?: string; filterRole?: string; batchId?: string } = {},
) {
  const allowedRoles = MESSAGEABLE_ROLES[userRole] || [];

  let batchStudentIds: string[] | null = null;
  let batchTeacherId: string | null = null;
  if (opts.batchId) {
    const batch = await prisma.lmsBatch.findFirst({
      where: { id: opts.batchId, orgId },
      select: { teacherId: true, students: { select: { studentId: true } } },
    });
    if (batch) {
      batchStudentIds = batch.students.map((s) => s.studentId);
      batchTeacherId = batch.teacherId;
    }
  }

  const where: Prisma.LmsUserWhereInput = {
    orgId,
    isActive: true,
    id: { not: userId },
  };

  const targetRoles = opts.filterRole && allowedRoles.includes(opts.filterRole)
    ? [opts.filterRole]
    : allowedRoles;
  // role enum values come from the static allow-list above
  (where as Record<string, unknown>).role = { in: targetRoles };

  // Batch-based scope
  if (batchStudentIds !== null) {
    if (opts.filterRole === 'LEARNER' || (!opts.filterRole && allowedRoles.includes('LEARNER'))) {
      where.id = { in: batchStudentIds, not: userId };
    } else if (opts.filterRole === 'TEACHER' || (!opts.filterRole && allowedRoles.includes('TEACHER'))) {
      if (batchTeacherId) where.id = { in: [batchTeacherId], not: userId };
    } else if (opts.filterRole === 'PARENT' || (!opts.filterRole && allowedRoles.includes('PARENT'))) {
      // parents with children in the batch (UserParent: parent has child in batch)
      where.children = { some: { childId: { in: batchStudentIds } } };
      where.id = { not: userId };
    } else if (batchStudentIds.length > 0) {
      const ids = [...batchStudentIds];
      if (batchTeacherId) ids.push(batchTeacherId);
      where.id = { in: ids, not: userId };
      delete (where as Record<string, unknown>).role;
    }
  }

  // Text search
  if (opts.q && opts.q.trim()) {
    const words = opts.q.trim().split(/\s+/).filter(Boolean);
    const wordConditions = words.map((word) => ({
      OR: [
        { firstName: { contains: word, mode: 'insensitive' as const } },
        { lastName: { contains: word, mode: 'insensitive' as const } },
        { email: { contains: word, mode: 'insensitive' as const } },
      ],
    }));
    where.AND = wordConditions;
  }

  const users = await prisma.lmsUser.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, email: true, role: true, profilePicture: true, grade: true },
    take: 30,
  });

  const safeSenderRoles = ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN'];
  const hideSensitive = !safeSenderRoles.includes(userRole);

  return users.map((u) => ({
    _id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role,
    profilePicture: u.profilePicture,
    grade: u.grade,
    ...(hideSensitive ? {} : { email: u.email }),
  }));
}

// ═══════════════ LIST CONVERSATIONS ═══════════════
export async function getConversations(orgId: string, userId: string) {
  const convs = await prisma.lmsConversation.findMany({
    where: { orgId, participants: { some: { userId } } },
    include: { participants: true },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
  });

  const visible = convs.filter((c) => {
    const p = c.participants.find((pp) => pp.userId === userId);
    return p && !p.isDeleted && !p.isArchived;
  });
  return Promise.all(visible.map(shapeConversation));
}

export async function getArchivedConversations(orgId: string, userId: string) {
  const convs = await prisma.lmsConversation.findMany({
    where: { orgId, participants: { some: { userId } } },
    include: { participants: true },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
  });

  const visible = convs.filter((c) => {
    const p = c.participants.find((pp) => pp.userId === userId);
    return p && p.isArchived && !p.isDeleted;
  });
  return Promise.all(visible.map(shapeConversation));
}

// ═══════════════ CREATE CONVERSATION ═══════════════
export async function createConversation(
  orgId: string,
  userId: string,
  userRole: string,
  dto: CreateConversationInput,
) {
  const uniqueIds = [...new Set([userId, ...dto.participantIds])];

  const participantDocs = await prisma.lmsUser.findMany({
    where: { id: { in: uniqueIds }, orgId },
    select: { id: true, role: true },
  });

  const roleMap: Record<string, string> = {};
  participantDocs.forEach((u) => { roleMap[u.id] = u.role; });

  if (participantDocs.length !== uniqueIds.length) {
    throw Forbidden('One or more participants do not belong to this tenant.');
  }

  const isGroup = dto.type === 'group' || uniqueIds.length > 2;
  if (!isGroup) {
    const senderRole = roleMap[userId] || userRole;
    const otherRole = roleMap[dto.participantIds[0]];
    if (otherRole && !rolesAllowed(senderRole, otherRole)) {
      throw Forbidden(`Messaging between ${senderRole} and ${otherRole} is not allowed.`);
    }
  } else {
    const senderRole = roleMap[userId] || userRole;
    for (const pid of dto.participantIds) {
      const otherRole = roleMap[pid];
      if (otherRole && !rolesAllowed(senderRole, otherRole)) {
        throw Forbidden(`Messaging between ${senderRole} and ${otherRole} is not allowed per PRD rules.`);
      }
    }
  }

  // For direct chats, check if a conversation already exists
  if (!dto.type || dto.type === 'direct') {
    if (dto.participantIds.length === 1) {
      const candidates = await prisma.lmsConversation.findMany({
        where: {
          orgId,
          type: 'direct',
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: dto.participantIds[0] } } },
          ],
        },
        include: { participants: true },
      });
      const existing = candidates.find((c) => c.participants.length === 2);
      if (existing) {
        await prisma.lmsConversationParticipant.updateMany({
          where: { conversationId: existing.id, userId },
          data: { isDeleted: false, isArchived: false },
        });
        const refreshed = await prisma.lmsConversation.findUnique({
          where: { id: existing.id },
          include: { participants: true },
        });
        return refreshed ? shapeConversation(refreshed) : null;
      }
    }
  }

  const conversation = await prisma.lmsConversation.create({
    data: {
      orgId,
      type: dto.type || (uniqueIds.length > 2 ? 'group' : 'direct'),
      title: dto.title,
      description: dto.description,
      groupIcon: dto.groupIcon,
      createdBy: userId,
      participants: {
        create: uniqueIds.map((id, i) => ({
          userId: id,
          role: i === 0 ? 'admin' : 'member',
        })),
      },
    },
    include: { participants: true },
  });

  if (dto.initialMessage) {
    await sendMessage(orgId, conversation.id, userId, { text: dto.initialMessage });
  }

  const refreshed = await prisma.lmsConversation.findUnique({
    where: { id: conversation.id },
    include: { participants: true },
  });
  return refreshed ? shapeConversation(refreshed) : shapeConversation(conversation);
}

// ═══════════════ GET CONVERSATION DETAILS ═══════════════
async function loadConversationOrThrow(orgId: string, conversationId: string, userId: string) {
  const conversation = await prisma.lmsConversation.findFirst({
    where: { id: conversationId, orgId, participants: { some: { userId } } },
    include: { participants: true },
  });
  if (!conversation) throw NotFound('Conversation not found');
  return conversation;
}

export async function getConversation(orgId: string, conversationId: string, userId: string) {
  const conversation = await loadConversationOrThrow(orgId, conversationId, userId);
  return shapeConversation(conversation);
}

// ═══════════════ GET MESSAGES ═══════════════
export async function getMessages(
  orgId: string,
  conversationId: string,
  userId: string,
  page = 1,
  limit = 50,
) {
  await loadConversationOrThrow(orgId, conversationId, userId);

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.lmsMessage.findMany({
      where: { conversationId },
      include: { reactions: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.lmsMessage.count({ where: { conversationId } }),
  ]);

  const ordered = rows.reverse();
  const messages = await Promise.all(ordered.map((m) => shapeMessage(m)));
  return { messages, total, page, limit };
}

type MessageWithReactions = Prisma.LmsMessageGetPayload<{ include: { reactions: true } }>;

/** Shape a message mirroring legacy populated senderId + replyTo. */
async function shapeMessage(m: MessageWithReactions) {
  const senderIds = [m.senderId];
  let replyToDoc: { id: string; text: string; senderId: string; createdAt: Date } | null = null;
  if (m.replyTo) {
    replyToDoc = await prisma.lmsMessage.findUnique({
      where: { id: m.replyTo },
      select: { id: true, text: true, senderId: true, createdAt: true },
    });
    if (replyToDoc) senderIds.push(replyToDoc.senderId);
  }
  const users = await userMap(senderIds);
  return {
    ...withMongoId(m),
    senderId: users.get(m.senderId) ?? m.senderId,
    replyTo: replyToDoc
      ? { ...withMongoId(replyToDoc), senderId: users.get(replyToDoc.senderId) ?? replyToDoc.senderId }
      : m.replyTo,
  };
}

// ═══════════════ SEND MESSAGE ═══════════════
export async function sendMessage(
  orgId: string,
  conversationId: string,
  senderId: string,
  dto: SendMessageInput,
) {
  const conversation = await loadConversationOrThrow(orgId, conversationId, senderId);

  if ((conversation.blockedUserIds || []).includes(senderId)) {
    throw Forbidden('You are blocked from sending messages in this conversation.');
  }

  const moderation = moderateContent(dto.text);
  if (!moderation.allowed) throw BadRequest(moderation.reason);

  const message = await prisma.lmsMessage.create({
    data: {
      conversationId,
      senderId,
      text: dto.text,
      attachmentUrls: dto.attachmentUrls || [],
      replyTo: dto.replyTo,
      forwardedFrom: dto.forwardedFrom,
    },
    include: { reactions: true },
  });

  await prisma.lmsConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageText: dto.text.substring(0, 100),
      lastMessageAt: new Date(),
      lastMessageBy: senderId,
      messageCount: { increment: 1 },
    },
  });

  // Un-delete conversation for participants who had soft-deleted it
  await prisma.lmsConversationParticipant.updateMany({
    where: { conversationId, isDeleted: true },
    data: { isDeleted: false },
  });

  return shapeMessage(message);
}

// ═══════════════ EDIT MESSAGE ═══════════════
export async function editMessage(orgId: string, messageId: string, userId: string, text: string) {
  const message = await prisma.lmsMessage.findUnique({ where: { id: messageId } });
  if (!message) throw NotFound('Message not found');
  if (message.senderId !== userId) throw Forbidden('You can only edit your own messages');
  if (message.isDeleted) throw BadRequest('Cannot edit a deleted message');

  const moderation = moderateContent(text);
  if (!moderation.allowed) throw BadRequest(moderation.reason);

  const updated = await prisma.lmsMessage.update({
    where: { id: messageId },
    data: { text, isEdited: true, editedAt: new Date() },
    include: { reactions: true },
  });
  return shapeMessage(updated);
}

// ═══════════════ DELETE MESSAGE ═══════════════
export async function deleteMessage(orgId: string, messageId: string, userId: string) {
  const message = await prisma.lmsMessage.findUnique({ where: { id: messageId } });
  if (!message) throw NotFound('Message not found');
  if (message.senderId !== userId) throw Forbidden('You can only delete your own messages');

  await prisma.lmsMessage.update({
    where: { id: messageId },
    data: {
      isDeleted: true,
      deletedBy: userId,
      deletedAt: new Date(),
      text: 'This message was deleted',
    },
  });
  return { success: true, messageId };
}

// ═══════════════ REACT TO MESSAGE ═══════════════
export async function reactToMessage(orgId: string, messageId: string, userId: string, emoji: string) {
  const message = await prisma.lmsMessage.findUnique({ where: { id: messageId } });
  if (!message) throw NotFound('Message not found');

  await loadConversationOrThrow(orgId, message.conversationId, userId);

  const existing = await prisma.lmsMessageReaction.findFirst({ where: { messageId, userId, emoji } });
  if (existing) {
    await prisma.lmsMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.lmsMessageReaction.create({ data: { messageId, userId, emoji } });
  }

  const reactions = await prisma.lmsMessageReaction.findMany({ where: { messageId } });
  return { messageId, reactions };
}

// ═══════════════ FORWARD MESSAGE ═══════════════
export async function forwardMessage(
  orgId: string,
  messageId: string,
  userId: string,
  targetConversationId: string,
) {
  const original = await prisma.lmsMessage.findUnique({ where: { id: messageId } });
  if (!original) throw NotFound('Original message not found');

  await loadConversationOrThrow(orgId, original.conversationId, userId);
  await loadConversationOrThrow(orgId, targetConversationId, userId);

  return sendMessage(orgId, targetConversationId, userId, {
    text: original.text,
    attachmentUrls: original.attachmentUrls,
    forwardedFrom: messageId,
  });
}

// ═══════════════ ARCHIVE / UNARCHIVE ═══════════════
async function setParticipantFlag(
  orgId: string,
  conversationId: string,
  userId: string,
  data: Prisma.LmsConversationParticipantUpdateManyMutationInput,
) {
  const conv = await prisma.lmsConversation.findFirst({
    where: { id: conversationId, orgId, participants: { some: { userId } } },
    select: { id: true },
  });
  if (!conv) throw NotFound('Conversation not found');
  await prisma.lmsConversationParticipant.updateMany({ where: { conversationId, userId }, data });
}

export async function archiveConversation(orgId: string, conversationId: string, userId: string) {
  await setParticipantFlag(orgId, conversationId, userId, { isArchived: true });
  return { success: true };
}

export async function unarchiveConversation(orgId: string, conversationId: string, userId: string) {
  await setParticipantFlag(orgId, conversationId, userId, { isArchived: false });
  return { success: true };
}

export async function deleteConversation(orgId: string, conversationId: string, userId: string) {
  await setParticipantFlag(orgId, conversationId, userId, { isDeleted: true, deletedAt: new Date() });
  return { success: true };
}

export async function muteConversation(orgId: string, conversationId: string, userId: string, muted: boolean) {
  await setParticipantFlag(orgId, conversationId, userId, { isMuted: muted });
  return { success: true, muted };
}

// ═══════════════ GROUP MANAGEMENT ═══════════════
export async function updateGroup(orgId: string, conversationId: string, userId: string, dto: UpdateGroupInput) {
  const conv = await loadConversationOrThrow(orgId, conversationId, userId);
  if (conv.type !== 'group') throw BadRequest('Cannot update a direct conversation');

  const participant = conv.participants.find((p) => p.userId === userId);
  if (!participant || participant.role !== 'admin') {
    throw Forbidden('Only group admins can update group settings');
  }

  const data: Prisma.LmsConversationUpdateInput = {};
  if (dto.title !== undefined) data.title = dto.title;
  if (dto.description !== undefined) data.description = dto.description;
  if (dto.groupIcon !== undefined) data.groupIcon = dto.groupIcon;

  await prisma.lmsConversation.update({ where: { id: conversationId }, data });
  const refreshed = await prisma.lmsConversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });
  return refreshed ? shapeConversation(refreshed) : null;
}

export async function addParticipants(orgId: string, conversationId: string, userId: string, participantIds: string[]) {
  const conv = await loadConversationOrThrow(orgId, conversationId, userId);
  if (conv.type !== 'group') throw BadRequest('Cannot add participants to a direct conversation');

  const participant = conv.participants.find((p) => p.userId === userId);
  if (!participant || participant.role !== 'admin') {
    throw Forbidden('Only group admins can add participants');
  }

  const existingIds = conv.participants.map((p) => p.userId);
  const newIds = participantIds.filter((id) => !existingIds.includes(id));
  if (newIds.length === 0) throw BadRequest('All users are already participants');

  await prisma.lmsConversationParticipant.createMany({
    data: newIds.map((id) => ({ conversationId, userId: id, role: 'member' as const })),
    skipDuplicates: true,
  });

  await prisma.lmsMessage.create({
    data: {
      conversationId,
      senderId: userId,
      text: `${newIds.length} participant(s) added to the group`,
    },
  });

  const refreshed = await prisma.lmsConversation.findUnique({
    where: { id: conversationId },
    include: { participants: true },
  });
  return refreshed ? shapeConversation(refreshed) : null;
}

export async function removeParticipant(orgId: string, conversationId: string, userId: string, targetUserId: string) {
  const conv = await loadConversationOrThrow(orgId, conversationId, userId);
  if (conv.type !== 'group') throw BadRequest('Cannot remove participants from a direct conversation');

  if (userId !== targetUserId) {
    const participant = conv.participants.find((p) => p.userId === userId);
    if (!participant || participant.role !== 'admin') {
      throw Forbidden('Only group admins can remove participants');
    }
  }

  await prisma.lmsConversationParticipant.deleteMany({ where: { conversationId, userId: targetUserId } });

  await prisma.lmsMessage.create({
    data: {
      conversationId,
      senderId: userId,
      text: userId === targetUserId ? 'left the group' : 'removed a participant',
    },
  });
  return { success: true };
}

export async function makeAdmin(orgId: string, conversationId: string, userId: string, targetUserId: string) {
  const conv = await loadConversationOrThrow(orgId, conversationId, userId);
  const participant = conv.participants.find((p) => p.userId === userId);
  if (!participant || participant.role !== 'admin') {
    throw Forbidden('Only admins can promote members');
  }

  await prisma.lmsConversationParticipant.updateMany({
    where: { conversationId, userId: targetUserId },
    data: { role: 'admin' },
  });
  return { success: true };
}

// ═══════════════ MARK AS READ ═══════════════
export async function markAsRead(orgId: string, conversationId: string, userId: string) {
  const conv = await prisma.lmsConversation.findFirst({
    where: { id: conversationId, orgId, participants: { some: { userId } } },
    select: { id: true },
  });
  if (conv) {
    await prisma.lmsConversationParticipant.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
  }
  return { success: true };
}

// ═══════════════ BLOCK / UNBLOCK ═══════════════
export async function blockUser(orgId: string, conversationId: string, userId: string, blockedUserId: string) {
  await loadConversationOrThrow(orgId, conversationId, userId);
  const conv = await prisma.lmsConversation.findFirst({ where: { id: conversationId, orgId }, select: { blockedUserIds: true } });
  if (conv && !conv.blockedUserIds.includes(blockedUserId)) {
    await prisma.lmsConversation.updateMany({
      where: { id: conversationId, orgId },
      data: { blockedUserIds: { push: blockedUserId } },
    });
  }
  return { success: true, message: 'User blocked in this conversation.' };
}

export async function unblockUser(orgId: string, conversationId: string, userId: string, blockedUserId: string) {
  await loadConversationOrThrow(orgId, conversationId, userId);
  const conv = await prisma.lmsConversation.findFirst({ where: { id: conversationId, orgId }, select: { blockedUserIds: true } });
  if (conv) {
    await prisma.lmsConversation.updateMany({
      where: { id: conversationId, orgId },
      data: { blockedUserIds: { set: conv.blockedUserIds.filter((id) => id !== blockedUserId) } },
    });
  }
  return { success: true, message: 'User unblocked in this conversation.' };
}

// ═══════════════ REPORT / FLAG ═══════════════
export async function reportMessage(orgId: string, messageId: string, userId: string, reason: string) {
  const message = await prisma.lmsMessage.findUnique({ where: { id: messageId } });
  if (!message) throw NotFound('Message not found.');
  await loadConversationOrThrow(orgId, message.conversationId, userId);
  await prisma.lmsMessage.update({ where: { id: messageId }, data: { isFlagged: true, flagReason: reason } });
  return { success: true, message: 'Message has been reported.' };
}
