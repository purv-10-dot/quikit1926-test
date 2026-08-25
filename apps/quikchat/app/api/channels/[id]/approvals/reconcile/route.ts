import { randomUUID } from "node:crypto";
import { assertMembership, HttpError, withOrgAuth } from "@/lib/auth-shims";
import { logger } from "@/lib/shared";
import { RATE } from "@/lib/server/rate-limits";
import { ASSISTANT_BOT_AGENT_ID } from "@/lib/server/assistant.service";
import { reconcileChannelApprovals } from "@/lib/server/approval-message.service";
import { getRuntimeClient } from "@/lib/server/runtime";
import { ListApprovalsError } from "@/lib/server/runtime/types";
import { userCan } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

/**
 * How many ledger rows we ask for. The relay's own ceiling is 100.
 *
 * Sized to make `ledgerComplete` true in every ordinary case: a requester with
 * more than this many rows in a 24h window falls back to repair-only, which is
 * correct but weaker. See the `total` check below.
 */
const LEDGER_PAGE = 100;

/**
 * POST /api/channels/[id]/approvals/reconcile — LAYER 2 of the drift bound.
 *
 * Re-reads the caller's approval ledger and repairs this channel's persisted
 * approval cards against it, fanning out `message_update` for any that moved.
 *
 * ── WHY THIS EXISTS AT ALL ─────────────────────────────────────────────────
 * The persisted card holds a snapshot of the request, patched by our own
 * decision relay. A decision taken ANY other way — a direct runtime API call,
 * another client, the runtime's expiry sweep, a module-disable cancel — never
 * reaches that relay, and our copy would say `pending` forever. This is the
 * repair pass, and the requester running it fixes the card for every observer in
 * the channel, because the fanout goes to the channel.
 *
 * ── WHY IT TAKES NOTHING FROM THE CLIENT BUT A CHANNEL ID ──────────────────
 * ⚠️ The new state is read from the runtime with the caller's own minted token
 * and is NEVER accepted from the request. A body carrying `{ requestId, status }`
 * would let any channel member assert the outcome line on a card — the same hole
 * the `CLIENT_SENDABLE_TYPES` allow-list closes on the write side, arriving by a
 * different door. `channelId` is the only input, and membership is proved below.
 *
 * Requester-only is inherent rather than enforced: the ledger is token-scoped, so
 * the caller can only ever see their own rows, and the reconciler skips cards
 * belonging to anyone else.
 *
 * Gates mirror the other assistant routes: session + org, `Assistant:create`,
 * `moduleKey: "assistant"`, and channel membership.
 */
export const POST = withOrgAuth(
  async (_req, ctx, params) => {
    const channelId = params.id!;
    await assertMembership(ctx.orgId, channelId, ctx.userId);
    if (!(await userCan(ctx.userId, ctx.orgId, "Assistant", "create"))) {
      throw new HttpError(403, "You do not have permission to use the assistant");
    }

    const traceId = randomUUID();
    let page;
    try {
      page = await getRuntimeClient().listApprovalRequests({
        // Session-derived, never client-supplied — same rule as the list relay.
        orgId: ctx.orgId,
        userId: ctx.userId,
        botAgentId: ASSISTANT_BOT_AGENT_ID,
        limit: LEDGER_PAGE,
        traceId,
      });
    } catch (e) {
      /**
       * ⚠️ A FAILED READ MUST CHANGE NOTHING.
       *
       * The reconciler treats a request missing from `rows` as "the ledger no
       * longer has it" and marks the card unconfirmed. Handing it an empty array
       * because the service was down would mark every healthy pending card in
       * the channel as unconfirmable — turning a transient outage into a durable
       * wrong state written to the database and fanned out to everyone.
       *
       * This is the same distinction the list relay draws between an empty page
       * and a failed one, with a sharper consequence: there, the mistake renders
       * a wrong screen; here, it persists one.
       */
      const code = e instanceof ListApprovalsError ? e.code : "unavailable";
      logger.warn(
        { traceId, orgId: ctx.orgId, channelId, code },
        "approvals: reconcile skipped, ledger read failed",
      );
      if (code === "timeout") {
        throw new HttpError(504, "The approvals service didn't respond. Try again.");
      }
      throw new HttpError(502, "Couldn't reach the approvals service. Try again.");
    }

    /**
     * Did we see the WHOLE ledger? Only then may a gap be read as "this row is
     * gone". With a partial page, a live request simply beyond the page boundary
     * is indistinguishable from an aged-out one, so the reconciler repairs what
     * it can see and concludes nothing from absence.
     */
    const ledgerComplete = page.requests.length >= page.total;

    const result = await reconcileChannelApprovals(ctx, channelId, page.requests, {
      ledgerComplete,
    });
    if (result.patched || result.unconfirmed) {
      logger.info(
        { traceId, orgId: ctx.orgId, channelId, ...result, ledgerComplete },
        "approvals: reconciled persisted cards",
      );
    }
    return Response.json({ ...result, ledgerComplete });
  },
  { rateLimit: RATE.approvalsList, moduleKey: "assistant" },
);
