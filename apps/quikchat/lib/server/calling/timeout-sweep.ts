import { db as prisma } from "@quikit/database";
import { errorFields, logger } from "@/lib/shared";
import * as calling from "./calling.service";

let started = false;
export const RINGING_TIMEOUT_MS = 30_000;
export const ACTIVE_HEARTBEAT_TIMEOUT_MS = 60_000;
export const ACTIVE_HEARTBEAT_GRACE_MS = 30_000;
export const ACTIVE_MAX_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours hard cap
export const SWEEP_INTERVAL_MS = 10_000;

/**
 * Single sweep run: marks every `ringing` call older than `RINGING_TIMEOUT_MS`
 * as `missed`, and ends any `active` call whose participants have gone silent
 * (no heartbeat within `ACTIVE_HEARTBEAT_TIMEOUT_MS` after an initial grace
 * period, or active longer than `ACTIVE_MAX_DURATION_MS`). Exported for testing.
 */
export async function runCallTimeoutSweep(): Promise<void> {
  const now = Date.now();
  const ringingCutoff = new Date(now - RINGING_TIMEOUT_MS);
  const heartbeatCutoff = new Date(now - ACTIVE_HEARTBEAT_TIMEOUT_MS);
  const graceCutoff = new Date(now - ACTIVE_HEARTBEAT_GRACE_MS);
  const maxDurationCutoff = new Date(now - ACTIVE_MAX_DURATION_MS);

  try {
    // 1. Reap stale ringing calls.
    const staleRinging = await prisma.qcCall.findMany({
      where: {
        status: "ringing",
        startedAt: { lt: ringingCutoff },
      },
      include: { participants: true },
    });

    for (const call of staleRinging) {
      try {
        // Use the initiator as the actor; the initiator is always a participant,
        // so the membership gate in markMissed passes.
        const ctx = { orgId: call.orgId, userId: call.initiatorId };
        await calling.markMissed(ctx, call.id);
        await calling.postCallSummary(ctx, call.id);
      } catch (e) {
        // Best-effort: a race (another participant ended/accepted the call) or a
        // transient DB error should not stop the sweep.
        logger.error(
          { ...errorFields(e), callId: call.id, orgId: call.orgId },
          "call timeout sweep: failed to mark ringing call missed",
        );
      }
    }

    // 2. Reap stale active calls (RC3).
    const staleActive = await prisma.qcCall.findMany({
      where: {
        status: "active",
        OR: [
          // Hard cap: no call should stay active forever.
          { answeredAt: { lt: maxDurationCutoff } },
          // Heartbeat-based: active long enough to have sent a heartbeat, but no
          // participant has checked in recently.
          {
            answeredAt: { lt: graceCutoff },
            participants: {
              every: { lastHeartbeatAt: { lt: heartbeatCutoff } },
            },
          },
        ],
      },
      include: { participants: true },
    });

    for (const call of staleActive) {
      try {
        const ctx = { orgId: call.orgId, userId: call.initiatorId };
        await calling.endCall(ctx, call.id);
        await calling.postCallSummary(ctx, call.id);
      } catch (e) {
        logger.error(
          { ...errorFields(e), callId: call.id, orgId: call.orgId },
          "call timeout sweep: failed to end stale active call",
        );
      }
    }
  } catch (e) {
    logger.error({ ...errorFields(e) }, "call timeout sweep: query failed");
  }
}

/**
 * Background sweep that marks stale `ringing` calls as `missed` on the server.
 *
 * Why this exists: the gateway emits `call:timed_out` after 30s but is write-free,
 * so it cannot persist the timeout. The client is supposed to PATCH the call on
 * that event, but a client may be offline, refreshed, or suffering from socket
 * churn. This sweep makes the app authoritative for timeout persistence without
 * relying on any client action.
 */
export function startCallTimeoutSweep(): void {
  if (started) return;
  // Never start in test environments (vitest or generic test runners).
  if (typeof process !== "undefined" && process.env.VITEST) return;
  started = true;

  // Run immediately on startup, then every interval.
  void runCallTimeoutSweep();
  setInterval(runCallTimeoutSweep, SWEEP_INTERVAL_MS);
}
