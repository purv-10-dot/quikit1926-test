/**
 * The approval card's view-model, and the two adapters that build it.
 *
 * ── WHY THIS FILE EXISTS (one card, two sources) ────────────────────────────
 * The same card renders in two places from two different payloads: the live turn
 * gets an `AssistApprovalRequest` off the SSE stream, and the Activity list gets
 * an `AssistApprovalRow` from `GET /api/ai/requests`. They differ in the id field
 * (`requestId` vs `id`), in whether a headline exists at all, in whether
 * `expiresAt` can be null, and in whether the row may already be terminal.
 *
 * Every one of those differences is DATA. What the card does with the data —
 * unknown risk renders as highest, `toolInput` renders verbatim, an aged-out card
 * disables — is identical on both paths, and those three rules are precisely the
 * ones the brief says get forgotten. So: one component, and the shape difference
 * is absorbed here, in two small pure functions, rather than by a `mode` prop
 * that would put the three rules behind branches, or by a second component that
 * would copy them.
 *
 * Pure and clock-free by design. Expiry is deliberately NOT folded into
 * `viewerMayAct` — see that field.
 */

import type {
  ApprovalMessageData,
  AssistApprovalRequest,
  AssistApprovalRow,
  AssistApprovalStatus,
  AssistRiskClass,
  PublicUser,
} from "@/lib/shared";

/**
 * Mirror of `ASSISTANT_BOT_USER_ID` in @quikit/shared. Defined locally, NOT
 * value-imported, so this module — which client components pull — never drags
 * the shared barrel's server-only deps (ioredis/sentry) into the browser
 * bundle. Every other import here is `import type`, which erases. Kept in sync
 * with the mirrors in ChatWorkspace.tsx / ticks.ts / SchedulingModal.tsx.
 */
const ASSISTANT_BOT_USER_ID = "quikchat-assistant-bot";

/**
 * Who decided, resolved for display.
 *
 * ── THE PRECEDENCE, AND WHY EACH STEP EXISTS ───────────────────────────────
 *  1. Nobody decided → neither. `cancelled` and `expired` rows have no human
 *     actor at all, and the card's passive wording exists for exactly them.
 *  2. The VIEWER decided → "you", never their own name. It is what they would
 *     say, and it stays right when two people share a display name.
 *  3. The BOT decided → neither. Not reachable today (decisions carry a human
 *     userId), but an agent-decided row rendering as a person named
 *     "Assistant" would be a quietly wrong attribution on the one surface
 *     whose whole purpose is who-decided-what. Excluded on purpose.
 *  4. A member we can name → the name.
 *  5. Anything else → NEITHER, and the card falls back to passive voice.
 *     A departed member is the real case: they are gone from the roster, so
 *     the id resolves to nothing. Printing the raw id is the one outcome
 *     ruled out — it is the rule the boolean existed to enforce, and it
 *     survives the boolean gaining a companion.
 */
export function resolveDecider(
  decisionBy: string | null | undefined,
  viewerId: string,
  members?: readonly PublicUser[],
): { decidedByViewer: boolean; decidedByName: string | null } {
  if (!decisionBy) return { decidedByViewer: false, decidedByName: null };
  if (decisionBy === viewerId) return { decidedByViewer: true, decidedByName: null };
  if (decisionBy === ASSISTANT_BOT_USER_ID) {
    return { decidedByViewer: false, decidedByName: null };
  }
  const name = members?.find((m) => m.id === decisionBy)?.displayName;
  return { decidedByViewer: false, decidedByName: name || null };
}

/** Risk classes we know how to style, most dangerous last. */
const KNOWN_RISK: readonly AssistRiskClass[] = ["soft_write", "medium_write", "high_risk"];

/** Why the viewer cannot act, when they cannot. `null` = they can (clock aside). */
/**
 * Why the viewer cannot act, when they cannot. `null` = they can (clock aside).
 *
 * `unconfirmed` is the persisted card's own state and exists nowhere else: our
 * snapshot still says `pending`, and reconciliation found the request gone from
 * the runtime's 24h ledger, so we cannot learn what happened and never will.
 * NOT folded into `terminal` — terminal means we know the answer, this means we
 * know we don't, and offering buttons for a decision that may already exist is
 * exactly what it prevents.
 */
export type ApprovalBlockedReason = "terminal" | "not-requester" | "unconfirmed";

export interface ApprovalCardModel {
  /** Runtime-owned id. The list calls it `id`, the stream calls it `requestId`. */
  requestId: string;
  /** Which app is about to change. Always shown — never buried in the expander. */
  appId: string;
  /** The tool the runtime wants to run, e.g. "create_issue". Raw, never parsed. */
  toolName: string;
  /**
   * The runtime's own sentence describing the write.
   *
   * `null` for list rows, because `AssistApprovalRow` DOES NOT CARRY ONE. That is
   * a real gap, not an oversight here: the Activity card is the only surface a
   * user reaches after the turn ends, and it is the one reduced to showing
   * `create_issue`. The card falls back to `toolName` verbatim rather than
   * composing a sentence from `toolName` + `toolInput` — synthesising one is the
   * exact coupling `summary` exists to prevent, and it would put our guess at
   * another app's semantics in front of the user at the moment they decide.
   * Filed for the runtime team alongside the outcome string; both are the same
   * fix, a generated string persisted on the ledger row.
   */
  summary: string | null;
  /** The tool's arguments. Relayed untouched; the card renders them verbatim. */
  toolInput: Record<string, unknown>;
  /**
   * Risk, NORMALISED — never the raw wire value.
   *
   * An unrecognised class becomes `high_risk`. `AssistRiskClass` says so and this
   * is the single place that honours it: the union is not validated at the wire
   * because the runtime may add a fourth class before this type learns about it,
   * and rendering an unfamiliar label conservatively beats rejecting a real
   * parked write. Defaulting to `soft_write` — which is what any `??` or
   * `switch` with a friendly `default` would do — would style the most dangerous
   * possible write as the mildest one.
   */
  risk: AssistRiskClass;
  /**
   * True when the runtime sent a class this build does not know. Drives the
   * "unrecognised risk level" line on the card: the user should be told WHY a
   * routine-looking write is presented at maximum caution, otherwise the
   * conservative styling just looks like a bug.
   */
  riskIsUnrecognised: boolean;
  /** ISO instant, or null when the request cannot age out. */
  expiresAt: string | null;
  /** Lifecycle state. Always `pending` for a live turn. */
  status: AssistApprovalStatus;
  /**
   * The runtime's sentence for what HAPPENED, on a terminal row — "Created
   * QTRK-903". `null` on a live proposal (nothing has happened yet) and on rows
   * that predate the field.
   *
   * When present it replaces the status-derived line. It does NOT replace
   * `error`: see that field.
   */
  outcomeSummary: string | null;
  /**
   * Did the VIEWER take the decision on this row?
   *
   * A boolean, not the id, and that is the whole design. "Rejected" and
   * "Cancelled" are passive voice hiding a subject, and the ledger exists to
   * record who decided what — but the only name this card could supply is a raw
   * user id, and printing `u-7f3a91` at someone is worse than the passive form.
   * So the adapter answers the one question it can answer truthfully from
   * `decisionBy` alone, and the card says "you" or stays passive.
   *
   * A named THIRD party belongs in `outcomeSummary`: the runtime has the
   * directory and we do not. If "cancelled by Priya" is wanted, it comes from
   * there, not from a lookup bolted on here.
   */
  decidedByViewer: boolean;
  /**
   * The decider's display name, when they are someone OTHER than the viewer and
   * we can resolve them. `null` for the viewer themselves ("you" wins), for a
   * row nobody decided, and — importantly — for an id that resolves to nothing.
   *
   * Only `fromApprovalMessage` can ever populate this, because it is the only
   * adapter whose surface can show a decision the viewer did not take. See the
   * note on each of the other two.
   */
  decidedByName: string | null;
  /**
   * May this viewer act — IGNORING THE CLOCK.
   *
   * Expiry is left out on purpose. A card can sit on screen across its own
   * expiry (a live turn the user walked away from), so "is it expired" has to be
   * re-answered as time passes, not once at adapt time. The card owns a ticking
   * clock and combines the two; keeping the clock out of here also keeps these
   * adapters pure and their tests free of fake timers. Use
   * `isApprovalExpired()` for the other half.
   */
  viewerMayAct: boolean;
  /** Why not, when `viewerMayAct` is false. Expiry is reported by the card. */
  blockedReason: ApprovalBlockedReason | null;
  /**
   * The target app's own failure message, on a `failed` row. Never rewritten,
   * and never suppressed by `outcomeSummary` — the generated sentence says WHAT
   * happened, this says why, and only one of them is actionable.
   */
  error: string | null;
  /**
   * Should the card show `toolInput`?
   *
   * True for anyone who can act, false for a channel observer. Rule 2 —
   * `toolInput` renders VERBATIM — is untouched by this: it governs HOW the
   * arguments render, and this governs WHO sees them at all. They exist so the
   * person authorising a write can verify what will actually be sent; an
   * observer is not verifying anything, and via `/ai` in a shared channel the
   * arguments can carry text the requester typed to the assistant privately.
   */
  showToolInput: boolean;
  /**
   * ── SEAM: the PROPOSAL summary, still missing ───────────────────────────
   * The outcome half of this seam closed — `outcomeSummary` above is the
   * runtime's sentence for what happened, served from the list and the decision
   * response alike, so it is identical on every device.
   *
   * What is still absent is a sentence for what is ABOUT to happen. The SSE
   * frame carries one; the ledger row does not, so the Activity card falls back
   * to the raw `toolName` (see `summary`). The runtime's generator exists but is
   * unwired and ships with emission. Still no field invented here for it: when
   * it lands it goes on `AssistApprovalRow`, is read by `fromApprovalRow`, and
   * the fallback below stops firing.
   */
}

/**
 * Is this request past its expiry at `now`?
 *
 * A null `expiresAt` means it cannot age out (terminal rows carry null), and an
 * unparseable one is treated as NOT expired: a card that refuses to work because
 * the runtime sent a timestamp we could not read is a worse failure than one that
 * lets the tap through and gets an honest 409.
 */
export function isApprovalExpired(expiresAt: string | null, now: number): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now;
}

/**
 * Narrow a persisted message's `data` to an approval payload, or null.
 *
 * Lives here, beside the adapter that consumes it, so the client renderer and
 * the server writer agree on what counts as a readable card by construction
 * rather than by convention — the server imports this rather than keeping its
 * own copy of the shape check.
 *
 * Checks only the two fields the card cannot work without: an id to decide on
 * and a requester to compare the viewer against. Everything else has a
 * rendering fallback already (unknown risk → highest, missing summary →
 * toolName, unknown status → not actionable), so a stricter gate here would
 * blank a card the component can render honestly.
 */
export function readApprovalMessageData(data: unknown): ApprovalMessageData | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.requestId !== "string" || typeof d.requesterId !== "string") return null;
  return d as unknown as ApprovalMessageData;
}

/** Normalise a wire risk value, flagging anything outside the known union. */
function normaliseRisk(raw: unknown): { risk: AssistRiskClass; riskIsUnrecognised: boolean } {
  return KNOWN_RISK.includes(raw as AssistRiskClass)
    ? { risk: raw as AssistRiskClass, riskIsUnrecognised: false }
    : // Unknown, missing, null, empty string, a number — all the same answer.
      { risk: "high_risk", riskIsUnrecognised: true };
}

/**
 * Live turn → card model.
 *
 * Always actionable: the frame arrived on the viewer's own stream, so they are
 * the requester by definition, and it is `pending` because the runtime has only
 * just parked it. Nothing to check.
 */
export function fromApprovalRequest(req: AssistApprovalRequest): ApprovalCardModel {
  const { risk, riskIsUnrecognised } = normaliseRisk(req.riskClass);
  return {
    requestId: req.requestId,
    appId: req.appId,
    toolName: req.toolName,
    // The stream's parser degrades a missing summary to "" rather than dropping
    // the frame; treat that as "no headline" so the card falls back to toolName
    // instead of rendering an empty heading.
    summary: req.summary || null,
    toolInput: req.toolInput,
    risk,
    riskIsUnrecognised,
    expiresAt: req.expiresAt || null,
    status: "pending",
    // Nothing has happened yet — this is a proposal, not an outcome. The live
    // card gets its outcome from the decision RESPONSE once answered, not from
    // here; see `SettledLine`.
    outcomeSummary: null,
    decidedByViewer: false,
    // A live frame is always `pending` — nothing has been decided yet. Once it
    // is, the decision was the VIEWER's (it arrived on their own stream), and
    // `SettledLine` renders "you" from the decision response. No name to find.
    decidedByName: null,
    viewerMayAct: true,
    blockedReason: null,
    error: null,
    // The live turn is the requester's own stream by definition.
    showToolInput: true,
  };
}

/**
 * Ledger row → card model.
 *
 * `viewerId` is checked against `row.userId` even though it is tautological in
 * v1: the runtime scopes the ledger on the minted token, so every row already
 * belongs to the viewer. It is here for the day that stops being true — the
 * moment an approver who is not the requester can see a row, an unchecked card
 * offers buttons that 403 — and because "requester-only" should be legible in
 * the code and not only in a heading.
 */
export function fromApprovalRow(row: AssistApprovalRow, viewerId: string): ApprovalCardModel {
  const { risk, riskIsUnrecognised } = normaliseRisk(row.riskClass);
  /**
   * ⚠️ A POSITIVE CHECK FOR "pending", NEVER A DENYLIST OF TERMINAL STATES —
   * and this is why `status` needs no normaliser while `riskClass` does.
   *
   * For `riskClass` the safe value (`high_risk`) is INSIDE the known set, so an
   * unfamiliar value has to be actively mapped onto it; left alone it renders
   * mild. Hence `normaliseRisk` above.
   *
   * For `status` the safe behaviour is "not actionable", and `!== "pending"`
   * delivers that for free: `cancelled`, a state added next quarter, a typo, an
   * empty string — none of them are `"pending"`, so none of them are actionable,
   * without this function ever having heard of them. `cancelled` was verified to
   * render correctly as a terminal row BEFORE it was added to the union.
   *
   * Written as `status !== "executed" && status !== "rejected" && …` it would
   * invert: every unknown state would read as live, and a request nobody can
   * action would grow Approve/Reject buttons. The card repeats the same positive
   * check independently rather than trusting `viewerMayAct` — see ApprovalCard.
   */
  const isPending = row.status === "pending";
  const isRequester = row.userId === viewerId;
  return {
    requestId: row.id,
    appId: row.appId,
    toolName: row.toolName,
    summary: null, // the ledger carries none — see ApprovalCardModel.summary
    toolInput: row.toolInput,
    risk,
    riskIsUnrecognised,
    expiresAt: row.expiresAt,
    status: row.status,
    // Absent on rows written before the runtime shipped the field. `||` folds
    // an empty string into "absent" as well as a missing key: the card branches
    // on presence, so `""` would win that branch and render a blank outcome —
    // the exact failure the status fallback exists to prevent. Same normalise
    // `summary` gets in `fromApprovalRequest`.
    outcomeSummary: row.outcomeSummary || null,
    // `decisionBy` is null on rows nobody decided (pending, expired) and on a
    // `cancelled` row the runtime attributed to no one.
    decidedByViewer: row.decisionBy != null && row.decisionBy === viewerId,
    /**
     * ALWAYS null, and not for want of a members list.
     *
     * The ledger is scoped to the caller by the minted token, and in v1 the
     * requester IS the approver — so `decisionBy` on every row this adapter can
     * ever see is either the viewer's own id or null. "You" or passive covers
     * 100% of it, and a name here would be unreachable code.
     *
     * ⚠️ SEAM, the same one `viewerMayAct` carries above: the day an approver
     * who is not the requester ships, this becomes reachable — and Activity has
     * no channel to resolve names from (`AssistApprovalRow` carries no
     * `channelId`). It will need an org-level lookup or a name on the row, not
     * a members prop threaded down. Deliberately not built for yet.
     */
    decidedByName: null,
    viewerMayAct: isPending && isRequester,
    blockedReason: !isPending ? "terminal" : !isRequester ? "not-requester" : null,
    error: row.error,
    // The ledger is token-scoped, so a row reaching this adapter is the
    // viewer's own. `isRequester` is checked anyway, for the same reason
    // `viewerMayAct` checks it — see this function's header.
    showToolInput: isRequester,
  };
}

/**
 * Persisted message → card model. The THIRD source, and the only one that can
 * be read by someone who is not the requester.
 *
 * ── WHY A THIRD ADAPTER AND NOT A THIRD CARD ───────────────────────────────
 * Same reason there are two already: the three rules (unknown risk renders
 * highest, `toolInput` verbatim, an aged-out card disables visibly) live in the
 * component, and every shape difference is absorbed here. This path adds two
 * genuinely new pieces of DATA — an observer who may not act, and a state where
 * we do not know the answer — and both come out as ordinary model fields.
 *
 * ── THE ORDER OF THE BLOCKED REASONS IS LOAD-BEARING ───────────────────────
 * `terminal`, then `unconfirmed`, then `not-requester` — and the middle one
 * outranking the last is the deliberate part.
 *
 * `terminal` first: a decided card is an outcome for everyone, and reads the
 * same to requester and observer alike.
 *
 * `unconfirmed` before `not-requester` because it describes THE REQUEST, not
 * the viewer. Telling an observer “only the person who asked can answer this”
 * about a request that may already be gone implies someone still can, which is
 * the one thing we know we cannot promise. “We couldn't confirm what happened”
 * is true for whoever is reading it. The observer still loses the arguments —
 * `showToolInput` keys off `isRequester` alone and is unaffected by this order.
 */
export function fromApprovalMessage(
  data: ApprovalMessageData,
  viewerId: string,
  /**
   * The channel roster, for resolving `decisionBy` to a name. OPTIONAL, and the
   * optionality is load-bearing: `MessageRowActions` is itself optional all the
   * way down from `MessageList`, so a row can genuinely render without one. No
   * members simply means no name, which is the same passive fallback a departed
   * member takes — never a raw id, and never a blank where a name should be.
   */
  members?: readonly PublicUser[],
): ApprovalCardModel {
  const { risk, riskIsUnrecognised } = normaliseRisk(data.riskClass);
  // The same POSITIVE check for pending that `fromApprovalRow` makes, and for
  // the same reason: an unfamiliar status must fall out as not-actionable
  // without this function having heard of it.
  const isPending = data.status === "pending";
  const isRequester = data.requesterId === viewerId;
  const isUnconfirmed = !!data.unconfirmedAt;

  const blockedReason: ApprovalBlockedReason | null = !isPending
    ? "terminal"
    : isUnconfirmed
      ? "unconfirmed"
      : !isRequester
        ? "not-requester"
        : null;

  return {
    requestId: data.requestId,
    appId: data.appId,
    toolName: data.toolName,
    // Unlike the ledger row, the persisted card DOES carry the proposal
    // sentence — it was captured off the SSE frame at proposal time, which is
    // the one moment it exists. So this surface never falls back to the raw
    // tool name the Activity card is stuck with.
    summary: data.summary || null,
    toolInput: data.toolInput,
    risk,
    riskIsUnrecognised,
    expiresAt: data.expiresAt || null,
    status: data.status,
    // `||` folds an empty string into absent, same as the other two adapters:
    // the card branches on presence and `""` would win that branch and render
    // a blank outcome.
    outcomeSummary: data.outcomeSummary || null,
    ...resolveDecider(data.decisionBy, viewerId, members),
    viewerMayAct: isPending && isRequester && !isUnconfirmed,
    blockedReason,
    error: data.error || null,
    // The observer rule. Everything else on the card is identical for both.
    showToolInput: isRequester,
  };
}
