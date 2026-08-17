import { HttpError } from "@/lib/auth-shims";
import { db as prisma } from "@quikit/database";
import type { CallDirection, CallHistoryItem, OrgContext } from "@/lib/shared";
import { loadPublicUsers } from "../helpers";
import * as messages from "../messages.service";

// ============================================================================
// Types
// ============================================================================

export type CallStatus = "ringing" | "active" | "ended" | "missed" | "rejected" | "timed_out";
export type CallType = "audio" | "video";
export type ParticipantState = "waiting" | "connected" | "disconnected";

export interface CreateCallInput {
  channelId?: string;
  meetingId?: string;
  type: CallType;
  targetUserIds: string[];
  /** Group calls start active; 1:1 calls start ringing. */
  initialStatus?: Extract<CallStatus, "ringing" | "active">;
}

export interface CallDto {
  id: string;
  orgId: string;
  channelId: string | null;
  meetingId: string | null;
  initiatorId: string;
  type: CallType;
  status: CallStatus;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  participants: ParticipantDto[];
}

export interface ParticipantDto {
  id: string;
  userId: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  state: ParticipantState;
}

// ============================================================================
// State machine
// ============================================================================

const VALID_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  ringing: ["active", "rejected", "timed_out", "ended", "missed"],
  active: ["ended"],
  ended: [],
  missed: [],
  rejected: [],
  timed_out: [],
};

function assertValidTransition(from: CallStatus, to: CallStatus): void {
  if (!VALID_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(400, `Invalid call transition: ${from} → ${to}`);
  }
}

// ============================================================================
// Service functions
// ============================================================================

/**
 * Create a new call. Enforces one-active-call-per-user server-side.
 */
export async function createCall(ctx: OrgContext, input: CreateCallInput): Promise<CallDto> {
  // One-active-call-per-user: check initiator isn't already in a ringing/active call
  const existingCall = await prisma.qcCall.findFirst({
    where: {
      orgId: ctx.orgId,
      initiatorId: ctx.userId,
      status: { in: ["ringing", "active"] },
    },
  });
  if (existingCall) {
    throw new HttpError(409, "You already have an active call");
  }

  // Also check if the user is a participant in another active call
  const existingParticipant = await prisma.qcCallParticipant.findFirst({
    where: {
      userId: ctx.userId,
      call: {
        orgId: ctx.orgId,
        status: { in: ["ringing", "active"] },
      },
    },
  });
  if (existingParticipant) {
    throw new HttpError(409, "You already have an active call");
  }

  const initialStatus = input.initialStatus ?? "ringing";
  const isGroupActive = initialStatus === "active";
  // The initiator is always a participant; avoid duplicates if the caller includes
  // them in targetUserIds (group calls send all channel members).
  const targetUserIds = Array.from(new Set(input.targetUserIds)).filter((id) => id !== ctx.userId);

  // Create the call with participants
  const call = await prisma.qcCall.create({
    data: {
      orgId: ctx.orgId,
      channelId: input.channelId ?? null,
      meetingId: input.meetingId ?? null,
      initiatorId: ctx.userId,
      type: input.type,
      status: initialStatus,
      // Group calls have no ring phase; mark them answered immediately.
      answeredAt: isGroupActive ? new Date() : null,
      participants: {
        create: [
          // Initiator as first participant
          {
            userId: ctx.userId,
            state: isGroupActive ? "connected" : "waiting",
            joinedAt: isGroupActive ? new Date() : null,
            lastHeartbeatAt: isGroupActive ? new Date() : null,
          },
          // Target participants
          ...targetUserIds.map((userId) => ({
            userId,
            state: isGroupActive ? "connected" : ("waiting" as ParticipantState),
            joinedAt: isGroupActive ? new Date() : null,
            lastHeartbeatAt: isGroupActive ? new Date() : null,
          })),
        ],
      },
    },
    include: { participants: true },
  });

  return serializeCall(call);
}

/**
 * Accept a call. Transitions ringing → active.
 */
export async function acceptCall(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  // Verify user is a participant
  const participant = call.participants.find((p) => p.userId === ctx.userId);
  if (!participant) {
    throw new HttpError(403, "You are not a participant of this call");
  }

  assertValidTransition(call.status as CallStatus, "active");

  const now = new Date();
  const updated = await prisma.qcCall.update({
    where: { id: callId },
    data: {
      status: "active",
      // Capture the moment the call was first answered (RC4).
      answeredAt: call.answeredAt ?? now,
      participants: {
        update: {
          where: { callId_userId: { callId, userId: ctx.userId } },
          data: { state: "connected", joinedAt: now, lastHeartbeatAt: now },
        },
      },
    },
    include: { participants: true },
  });

  return serializeCall(updated);
}

/**
 * Reject a call. Transitions ringing → rejected.
 */
export async function rejectCall(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  const participant = call.participants.find((p) => p.userId === ctx.userId);
  if (!participant) {
    throw new HttpError(403, "You are not a participant of this call");
  }

  if (call.status === "rejected") {
    return serializeCall(call);
  }

  assertValidTransition(call.status as CallStatus, "rejected");

  const updated = await prisma.qcCall.update({
    where: { id: callId },
    data: {
      status: "rejected",
      endedAt: new Date(),
      participants: {
        update: {
          where: { callId_userId: { callId, userId: ctx.userId } },
          data: { state: "disconnected", leftAt: new Date() },
        },
      },
    },
    include: { participants: true },
  });

  return serializeCall(updated);
}

/**
 * End a call. Transitions active/ringing → ended. Computes duration.
 */
export async function endCall(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  // Either party can end (participant check)
  const participant = call.participants.find((p) => p.userId === ctx.userId);
  if (!participant) {
    throw new HttpError(403, "You are not a participant of this call");
  }

  // Idempotent: if already ended, return the existing call instead of throwing 400.
  // Multiple end paths race (keepalive PATCH + pagehide + remote relay).
  if (call.status === "ended") {
    return serializeCall(call);
  }

  assertValidTransition(call.status as CallStatus, "ended");

  const now = new Date();
  // Duration should be talk time only, not ring time (RC4).
  const durationAnchor = call.answeredAt ?? call.startedAt;
  const duration = durationAnchor
    ? Math.floor((now.getTime() - durationAnchor.getTime()) / 1000)
    : 0;

  const updated = await prisma.qcCall.update({
    where: { id: callId },
    data: {
      status: "ended",
      endedAt: now,
      duration,
      participants: {
        updateMany: {
          where: { callId, state: { not: "disconnected" } },
          data: { state: "disconnected", leftAt: now },
        },
      },
    },
    include: { participants: true },
  });

  // Release the meeting's claim token (see meeting-call.ts). Hygiene, not
  // correctness: `getOrStartMeetingCall` re-claims over a stale value anyway,
  // because other terminal paths (the timeout sweep) don't run through here.
  // Scoped by `callId` so it can only ever clear ITS OWN claim — never a newer
  // call's — if this runs late.
  if (call.meetingId) {
    await prisma.qcMeeting.updateMany({
      where: { id: call.meetingId, callId },
      data: { callId: null },
    });
  }

  return serializeCall(updated);
}

/**
 * Record a heartbeat from an active call window. Updates the participant's
 * lastHeartbeatAt so the timeout sweep can reap stale active calls (RC3).
 */
export async function recordHeartbeat(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  const participant = call.participants.find((p) => p.userId === ctx.userId);
  if (!participant) {
    throw new HttpError(403, "You are not a participant of this call");
  }

  // Heartbeats on non-active calls are harmless — the sweep only reaps active
  // calls, so just return the current state instead of throwing 400.
  if (call.status !== "active") {
    return serializeCall(call);
  }

  const updated = await prisma.qcCall.update({
    where: { id: callId },
    data: {
      participants: {
        update: {
          where: { callId_userId: { callId, userId: ctx.userId } },
          data: { lastHeartbeatAt: new Date() },
        },
      },
    },
    include: { participants: true },
  });

  return serializeCall(updated);
}

/**
 * Mark a call as timed_out (ringing expired without answer).
 */
export async function timeoutCall(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  if (call.status === "timed_out") {
    return serializeCall(call);
  }

  assertValidTransition(call.status as CallStatus, "timed_out");

  const updated = await prisma.qcCall.update({
    where: { id: callId },
    data: {
      status: "timed_out",
      endedAt: new Date(),
    },
    include: { participants: true },
  });

  return serializeCall(updated);
}

/**
 * Mark a call as missed (for timeout).
 */
export async function markMissed(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  if (call.status === "missed") {
    return serializeCall(call);
  }

  assertValidTransition(call.status as CallStatus, "missed");

  const updated = await prisma.qcCall.update({
    where: { id: callId },
    data: {
      status: "missed",
      endedAt: new Date(),
    },
    include: { participants: true },
  });

  return serializeCall(updated);
}

/**
 * Get call details.
 */
export async function getCall(ctx: OrgContext, callId: string): Promise<CallDto> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    throw new HttpError(404, "Call not found");
  }

  return serializeCall(call);
}

/**
 * Post a call summary message to the channel.
 */
export async function postCallSummary(ctx: OrgContext, callId: string): Promise<void> {
  const call = await prisma.qcCall.findUnique({
    where: { id: callId },
    include: { participants: true },
  });

  if (!call || call.orgId !== ctx.orgId) {
    return; // silently skip if call not found
  }

  // Resolve channelId: use call's channelId for group calls,
  // or find the DM channel for 1:1 calls
  let channelId = call.channelId;
  if (!channelId && call.participants.length === 2) {
    const otherUserId = call.participants.find((p) => p.userId !== call.initiatorId)?.userId;
    if (otherUserId) {
      const dmChannel = await prisma.qcChannel.findFirst({
        where: {
          orgId: call.orgId,
          type: "dm",
          members: {
            some: { userId: call.initiatorId },
          },
        },
        include: {
          members: {
            where: { userId: otherUserId },
          },
        },
      });
      if (dmChannel && dmChannel.members.length > 0) {
        channelId = dmChannel.id;
      }
    }
  }

  if (!channelId) return; // no channel to post to

  const duration = call.duration ?? 0;
  const mins = Math.floor(duration / 60);
  const secs = duration % 60;
  const durationStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  let content: string;
  if (call.status === "missed") {
    content = "Missed call";
  } else if (call.status === "rejected") {
    content = "Call declined";
  } else if (call.status === "timed_out") {
    content = "Call timed out";
  } else {
    content = `${call.type === "video" ? "Video call" : "Audio call"} · ${durationStr}`;
  }

  await messages.send(ctx, channelId, {
    content,
    type: "Call",
    clientMessageId: `call-summary-${call.id}`,
    data: {
      callId: call.id,
      duration,
      type: call.type,
      status: call.status,
      participantCount: call.participants.length,
    },
  });
}

// ============================================================================
// History
// ============================================================================

/** Terminal states — a call is "history" once it can no longer be joined. */
const TERMINAL_STATUSES = ["ended", "missed", "rejected", "timed_out"] as const;

/** Newest-first cap; the History pane is a recent-activity list, not an archive. */
const HISTORY_LIMIT = 100;

/**
 * The viewer's call history — terminal calls only. `ringing`/`active` are
 * deliberately excluded: those are live and already served by
 * `GET /api/calls/active` for rejoin.
 *
 * Direction is derived from the viewer's perspective, not the row: a call the
 * viewer STARTED that nobody answered is an unanswered outgoing call, while
 * "missed" is specifically an unanswered call TO the viewer. A declined
 * incoming call counts as "incoming" — the viewer saw it and acted on it.
 */
export async function listHistory(ctx: OrgContext): Promise<CallHistoryItem[]> {
  const calls = await prisma.qcCall.findMany({
    where: {
      orgId: ctx.orgId,
      status: { in: [...TERMINAL_STATUSES] },
      // Participant rows cover the normal case; initiatorId is a belt-and-braces
      // OR so a call whose participant rows were pruned still shows for its owner.
      OR: [{ initiatorId: ctx.userId }, { participants: { some: { userId: ctx.userId } } }],
    },
    include: { participants: true },
    orderBy: { startedAt: "desc" },
    take: HISTORY_LIMIT,
  });

  // Batch the two name lookups rather than resolving per row.
  const otherUserIds: string[] = [];
  const channelIds: string[] = [];
  for (const call of calls) {
    if (call.participants.length === 2) {
      const other = call.participants.find((p) => p.userId !== ctx.userId);
      if (other) otherUserIds.push(other.userId);
    } else if (call.channelId) {
      channelIds.push(call.channelId);
    }
  }

  const users = await loadPublicUsers(otherUserIds);
  // QcCall.channelId has no Prisma relation (plain String?), so channel names
  // can't be `include`d — fetch them separately, scoped to the org.
  const channels = channelIds.length
    ? await prisma.qcChannel.findMany({
        where: { id: { in: Array.from(new Set(channelIds)) }, orgId: ctx.orgId },
        select: { id: true, name: true },
      })
    : [];
  const channelNames = new Map(channels.map((c) => [c.id, c.name]));

  return calls.map((call) => {
    const status = call.status as CallHistoryItem["status"];
    const isInitiator = call.initiatorId === ctx.userId;
    const unanswered = status === "missed" || status === "timed_out";
    const direction: CallDirection = !isInitiator && unanswered
      ? "missed"
      : isInitiator
        ? "outgoing"
        : "incoming";

    // 1:1 is decided by participant count, NOT by channelId — a DM call carries
    // its channel id too, so channelId presence doesn't imply a group call.
    const isGroup = call.participants.length !== 2;
    // Kept as its own binding (not inlined into the users.get below) because the
    // raw id is now returned too — the history pane's quick-reply needs it to
    // find-or-create the DM when the call carried no channel.
    const otherUserId = isGroup
      ? null
      : (call.participants.find((p) => p.userId !== ctx.userId)?.userId ?? null);
    const other = otherUserId ? users.get(otherUserId) : undefined;
    const name = isGroup
      ? ((call.channelId ? channelNames.get(call.channelId) : null) ?? "Group call")
      : (other?.displayName ?? "Unknown");

    return {
      id: call.id,
      name,
      avatarUrl: isGroup ? null : (other?.avatarUrl ?? null),
      direction,
      type: call.type as CallType,
      isGroup,
      startedAt: call.startedAt.toISOString(),
      // Unanswered calls have no talk time; normalize 0 to null so the UI hides it.
      durationSeconds: call.duration && call.duration > 0 ? call.duration : null,
      status,
      channelId: call.channelId ?? null,
      otherUserId,
    };
  });
}

// ============================================================================
// Serialization
// ============================================================================

function serializeCall(call: {
  id: string;
  orgId: string;
  channelId: string | null;
  meetingId: string | null;
  initiatorId: string;
  type: string;
  status: string;
  startedAt: Date;
  answeredAt: Date | null;
  endedAt: Date | null;
  duration: number | null;
  participants: {
    id: string;
    userId: string;
    joinedAt: Date | null;
    leftAt: Date | null;
    state: string;
    lastHeartbeatAt: Date | null;
  }[];
}): CallDto {
  return {
    id: call.id,
    orgId: call.orgId,
    channelId: call.channelId,
    meetingId: call.meetingId,
    initiatorId: call.initiatorId,
    type: call.type as CallType,
    status: call.status as CallStatus,
    startedAt: call.startedAt,
    answeredAt: call.answeredAt,
    endedAt: call.endedAt,
    duration: call.duration,
    participants: call.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      joinedAt: p.joinedAt,
      leftAt: p.leftAt,
      state: p.state as ParticipantState,
    })),
  };
}
