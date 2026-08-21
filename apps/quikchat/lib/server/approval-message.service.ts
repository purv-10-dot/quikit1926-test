/**
 * The persisted approval card: writing it at proposal time, patching it at
 * decision time, and reconciling it against the runtime's ledger.
 *
 * ── WHY THE MESSAGE HOLDS THE FACTS ────────────────────────────────────────
 * `GET /ai/requests` is scoped to the caller by the minted token and there is no
 * fetch-one endpoint, so an observer's ledger does not contain the requester's
 * row — rendering the channel-visible card from the ledger is not slow, it is
 * impossible. The ledger also keeps terminal rows for only 24h while the message
 * is permanent. So the message carries a snapshot (`ApprovalMessageData`).
 *
 * ── WHICH COPY IS AUTHORITATIVE ────────────────────────────────────────────
 * The message is authoritative for DISPLAY. The runtime stays authoritative for
 * DECISIONS: every approve/reject goes to it, and it answers 409 when our copy
 * is stale. That asymmetry is what makes divergence produce a wrong screen and
 * never a wrong write.
 *
 * They can still diverge — a decision taken outside our relay (a direct runtime
 * call, another client, an expiry sweep, a module-disable cancel) never reaches
 * `applyApprovalDecision`. Three layers bound it:
 *   1. the card's own expiry clock, off `expiresAt`, needing no server at all;
 *   2. `reconcileChannelApprovals` on channel open — the requester is the one
 *      person who may read the row, and repairs the view for everyone;
 *   3. `unconfirmedAt`, set when reconciliation finds the row gone from the
 *      ledger, so the card says it does not know instead of offering buttons.
 */
import { db as prisma } from "@quikit/database";
import { Prisma } from "@quikit/database";
import { publishFanout, type AssistApprovalRequest, type AssistApprovalRow } from "@/lib/shared";
import type {
  ApprovalMessageData,
  AssistApprovalDecision,
  AssistApprovalStatus,
  MessageDto,
  OrgContext,
} from "@/lib/shared";
import {
  ASSISTANT_BOT_AGENT_ID,
  ASSISTANT_BOT_USER_ID,
  ensureAssistantBot,
} from "./assistant.service";
import { errorFields, logger } from "@/lib/shared/logger";
import { toMessageDto, type MessageRow } from "./helpers";
import { readApprovalMessageData } from "@/lib/approval-card";

/**
 * `clientMessageId` prefix for a persisted proposal.
 *
 * Deliberately reusing `clientMessageId` rather than adding a column or querying
 * a JSON path: it is already indexed and unique per channel, it mirrors the
 * assist reply's `assist-<agentRunId>`, and it makes the proposal-time write
 * idempotent for free — a re-delivered `approval_needed` frame returns the row
 * that exists instead of writing a second card.
 *
 * It is also what the decision path looks the message up by. `POST
 * /api/ai/requests/{id}/approve` is NOT channel-scoped — it has a requestId and
 * nothing else — so without this the patch would need an unindexed JSON-path
 * scan across every message in the org on a write path.
 */
export const APPROVAL_MESSAGE_PREFIX = "approval-";

/** The `clientMessageId` a given request's card is stored under. */
export function approvalClientMessageId(requestId: string): string {
  return `${APPROVAL_MESSAGE_PREFIX}${requestId}`;
}

/**
 * Narrow a persisted row's `data` to our payload.
 *
 * Delegates to the client-side helper on purpose: the renderer and the writer
 * must agree on what counts as a readable card, and two copies of that check
 * would drift the moment either side gained a required field.
 */
export const readApprovalData = readApprovalMessageData;

/**
 * Persist the proposal as a channel-visible message.
 *
 * Written directly rather than through `messages.send()` for the same reasons
 * `emitSystemMessage` is: that path mints per-recipient notification rows and a
 * search-index entry, and it refuses `ApprovalRequest` outright (see
 * CLIENT_SENDABLE_TYPES — a client must never be able to author one of these).
 *
 * `content` is the proposal sentence, so the channel-list preview reads
 * correctly with no change to `messagePreview`: its `default:` branch already
 * renders `content` as text.
 *
 * Never throws into the assist stream. A card that failed to persist must not
 * take down the turn it describes — the ephemeral live card still renders and
 * the request is still parked on the runtime.
 */
export async function writeApprovalProposal(
  ctx: OrgContext,
  channelId: string,
  request: AssistApprovalRequest,
  opts: { threadRootId?: string; now?: Date } = {},
): Promise<MessageDto | null> {
  try {
    await ensureAssistantBot(ctx.orgId, channelId);
    const clientMessageId = approvalClientMessageId(request.requestId);

    const existing = await prisma.qcMessage.findFirst({ where: { channelId, clientMessageId } });
    if (existing) return toMessageDto(existing as MessageRow, null);

    const data: ApprovalMessageData = {
      requestId: request.requestId,
      // From the caller's session, never from the frame. This is what decides
      // who gets buttons, so it must not be something the runtime can assert.
      requesterId: ctx.userId,
      appId: request.appId,
      toolName: request.toolName,
      // The stream's parser degrades a missing summary to ""; store the same
      // "no headline" null the live adapter produces so both paths fall back to
      // `toolName` identically.
      summary: request.summary || null,
      // Raw. `normaliseRisk` in the adapter owns the unknown-class rule, so it
      // applies to this path exactly as it does to the other two.
      riskClass: request.riskClass,
      toolInput: request.toolInput,
      expiresAt: request.expiresAt || null,
      proposedAt: (opts.now ?? new Date()).toISOString(),
      status: "pending",
    };

    const saved = await prisma.qcMessage.create({
      data: {
        orgId: ctx.orgId,
        channelId,
        // The assistant proposed it, so the assistant authored it — same
        // attribution the assist reply gets.
        senderId: ASSISTANT_BOT_USER_ID,
        actorType: "ai_agent",
        type: "ApprovalRequest",
        content: data.summary ?? request.toolName,
        data: data as unknown as Prisma.InputJsonValue,
        parentMessageId: opts.threadRootId ?? null,
        clientMessageId,
        reactions: {},
      },
    });

    const message = toMessageDto(saved as MessageRow, null);
    await publishFanout({ orgId: ctx.orgId, channelId, event: "message", payload: message });
    return message;
  } catch (e) {
    logger.error(
      { ...errorFields(e), orgId: ctx.orgId, channelId, requestId: request.requestId },
      "approval message: proposal write failed",
    );
    return null;
  }
}

/** Patch a persisted card's payload and fan the new state out to the channel. */
async function patchApprovalMessage(
  orgId: string,
  row: MessageRow,
  patch: Partial<ApprovalMessageData>,
): Promise<void> {
  const current = readApprovalData(row.data);
  if (!current) return;
  const next: ApprovalMessageData = { ...current, ...patch };
  const saved = await prisma.qcMessage.update({
    where: { id: row.id },
    data: { data: next as unknown as Prisma.InputJsonValue },
  });
  await publishFanout({
    orgId,
    channelId: row.channelId,
    // The same event the RSVP path uses for a re-serialized message; the client
    // already routes it through `patchMessageEvent`, which replaces by id.
    event: "message_update",
    payload: toMessageDto(saved as MessageRow, null),
  });
}

/** Find the persisted card for a request, anywhere in the org. */
async function findApprovalMessage(orgId: string, requestId: string): Promise<MessageRow | null> {
  const row = await prisma.qcMessage.findFirst({
    where: {
      orgId,
      clientMessageId: approvalClientMessageId(requestId),
      type: "ApprovalRequest",
    },
  });
  return (row as MessageRow) ?? null;
}

/**
 * Carry a decision our relay just recorded onto the persisted card.
 *
 * Best-effort by contract. The decision has already been taken on the runtime by
 * the time this runs; failing the response because our own copy could not be
 * updated would tell the user their approval failed when it did not. A missed
 * patch is repaired by `reconcileChannelApprovals` on the next channel open.
 *
 * A request with no persisted card is the normal case for anything proposed
 * before this shipped — a no-op, not an error.
 */
export async function applyApprovalDecision(
  orgId: string,
  requestId: string,
  decision: AssistApprovalDecision,
  opts: { decisionBy?: string; now?: Date } = {},
): Promise<void> {
  try {
    const row = await findApprovalMessage(orgId, requestId);
    if (!row) return;
    const at = (opts.now ?? new Date()).toISOString();
    await patchApprovalMessage(orgId, row, {
      status: decision.status,
      outcomeSummary: decision.outcomeSummary ?? null,
      error: decision.error ?? null,
      decisionBy: opts.decisionBy ?? null,
      // This decision came through our relay, by definition — we are the code
      // that took it. Stamped so a later reconcile comparing against the ledger
      // is looking at the same fact from both sides.
      decisionAgentId: ASSISTANT_BOT_AGENT_ID,
      decisionAt: at,
      confirmedAt: at,
      // A decided card is no longer waiting on anything, so any earlier
      // "we couldn't confirm this" is now answered and must be cleared.
      unconfirmedAt: null,
    });
  } catch (e) {
    logger.error(
      { ...errorFields(e), orgId, requestId },
      "approval message: decision patch failed",
    );
  }
}

/** Fields on the ledger row that our snapshot mirrors. */
function fromLedgerRow(row: AssistApprovalRow, at: string): Partial<ApprovalMessageData> {
  return {
    status: row.status,
    outcomeSummary: row.outcomeSummary ?? null,
    error: row.error ?? null,
    decisionBy: row.decisionBy ?? null,
    decisionAgentId: row.decisionAgentId ?? null,
    decisionAt: row.decisionAt ?? null,
    expiresAt: row.expiresAt ?? null,
    confirmedAt: at,
    unconfirmedAt: null,
  };
}

/** Does our copy already say what the ledger says? */
function agrees(mine: ApprovalMessageData, theirs: AssistApprovalRow): boolean {
  return (
    mine.status === theirs.status &&
    (mine.outcomeSummary ?? null) === (theirs.outcomeSummary ?? null) &&
    (mine.error ?? null) === (theirs.error ?? null) &&
    (mine.decisionBy ?? null) === (theirs.decisionBy ?? null)
  );
}

export interface ReconcileResult {
  /** Cards checked (this viewer's own, still non-terminal). */
  checked: number;
  /** Cards whose snapshot disagreed with the ledger and were patched. */
  patched: number;
  /** Cards the ledger no longer knows about — marked unconfirmed. */
  unconfirmed: number;
}

/**
 * LAYER 2: repair this channel's cards against the runtime's ledger.
 *
 * Requester-only by construction, and that is the design rather than a
 * restriction: the ledger is token-scoped, so the caller can only ever see their
 * OWN rows. Running it for the requester repairs the card for every observer in
 * the channel, because the fanout goes to the channel.
 *
 * ⚠️ `rows` MUST come from the runtime read the caller's own token authorises.
 * Never accept a status from a client — that would make the card's outcome line
 * something any channel member could assert, which is the same hole the
 * CLIENT_SENDABLE_TYPES allow-list closes on the write side.
 *
 * Cards already terminal are skipped: a decided card cannot become undecided,
 * and re-checking every historical card on every channel open would grow without
 * bound.
 */
export async function reconcileChannelApprovals(
  ctx: OrgContext,
  channelId: string,
  rows: AssistApprovalRow[],
  opts: { now?: Date; ledgerComplete: boolean },
): Promise<ReconcileResult> {
  const at = (opts.now ?? new Date()).toISOString();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const result: ReconcileResult = { checked: 0, patched: 0, unconfirmed: 0 };

  const candidates = await prisma.qcMessage.findMany({
    where: { orgId: ctx.orgId, channelId, type: "ApprovalRequest" },
  });

  for (const row of candidates) {
    const mine = readApprovalData(row.data);
    if (!mine) continue;
    // Only the requester can read this request's ledger row, so only they can
    // reconcile it. Someone else's card in the same channel is left alone.
    if (mine.requesterId !== ctx.userId) continue;
    if (mine.status !== "pending") continue;
    result.checked += 1;

    const theirs = byId.get(mine.requestId);
    if (theirs) {
      // AGREEMENT WRITES NOTHING.
      //
      // An earlier version refreshed `confirmedAt` here. Nothing reads that
      // field on a pending card — there is no "checked just now" on the card —
      // so it was a DB write per card per channel open with no reader, which is
      // how a cheap repair pass turns into a background write load nobody
      // attributed to opening a conversation. If an "as of" line is ever added,
      // this is where it comes back, together with the thing that renders it.
      if (agrees(mine, theirs)) continue;
      /**
       * THE ONE MOMENT `decisionAgentId` IS WORTH ANYTHING.
       *
       * Our copy says `pending` and the ledger says otherwise, so something
       * happened that our decision relay did not record. Two very different
       * causes, indistinguishable in the logs until now:
       *
       *   - it came through US and our own `applyApprovalDecision` failed
       *     silently (it swallows and logs by design) — OUR bug, worth an alert;
       *   - it was taken elsewhere — a direct runtime call, another client, the
       *     expiry sweep — which is exactly what this pass exists to repair.
       *
       * A DIMENSION, not a branch. The repair is identical either way, and the
       * field cannot inform the repair decision — see the note on the contract.
       */
      logger.info(
        {
          orgId: ctx.orgId,
          channelId,
          requestId: mine.requestId,
          status: theirs.status,
          decisionAgentId: theirs.decisionAgentId ?? null,
          decidedViaQuikchat: theirs.decisionAgentId === ASSISTANT_BOT_AGENT_ID,
        },
        "approval message: snapshot behind the ledger, repairing",
      );
      await patchApprovalMessage(ctx.orgId, row as MessageRow, fromLedgerRow(theirs, at));
      result.patched += 1;
      continue;
    }

    /**
     * LAYER 3. The ledger returned our other rows but not this one, so it is
     * gone: terminal rows live 24h and this aged out while our copy still said
     * `pending`. We cannot learn what happened and never will be able to.
     *
     * Recorded rather than guessed. Inventing `expired` here would be asserting
     * an outcome we do not have — the plausible-looking wrong value that goes
     * unnoticed, exactly the `isDefault` shape. The card renders this as "may
     * already have been answered" and stops offering buttons.
     *
     * ⚠️ ONLY when we actually saw the WHOLE ledger. `rows` is one PAGE, and a
     * requester with more rows than it holds has live, healthy requests missing
     * from it. Marking those unconfirmable would report absence of evidence as
     * evidence — the same error as rendering a failed list read as an empty
     * inbox, but persisted. A partial page still repairs the disagreements it
     * CAN see above; it just concludes nothing from a gap.
     *
     * An already-marked row is left alone, so the timestamp records when we
     * FIRST could not confirm.
     */
    if (!opts.ledgerComplete) continue;

    if (!mine.unconfirmedAt) {
      await patchApprovalMessage(ctx.orgId, row as MessageRow, { unconfirmedAt: at });
      result.unconfirmed += 1;
    }
  }

  return result;
}

/** Are there cards in this channel worth a reconcile pass? Cheap pre-check. */
export async function hasPendingApprovalMessages(
  ctx: OrgContext,
  channelId: string,
): Promise<boolean> {
  const rows = await prisma.qcMessage.findMany({
    where: { orgId: ctx.orgId, channelId, type: "ApprovalRequest" },
    select: { data: true },
  });
  return rows.some((r) => {
    const d = readApprovalData(r.data);
    return !!d && d.requesterId === ctx.userId && d.status === "pending";
  });
}

/** Re-exported so callers need not reach into two modules for one concept. */
export type { AssistApprovalStatus };
