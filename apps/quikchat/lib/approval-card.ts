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
  AssistApprovalRequest,
  AssistApprovalRow,
  AssistApprovalStatus,
  AssistRiskClass,
} from "@/lib/shared";

/** Risk classes we know how to style, most dangerous last. */
const KNOWN_RISK: readonly AssistRiskClass[] = ["soft_write", "medium_write", "high_risk"];

/** Why the viewer cannot act, when they cannot. `null` = they can (clock aside). */
export type ApprovalBlockedReason = "terminal" | "not-requester";

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
    viewerMayAct: true,
    blockedReason: null,
    error: null,
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
    viewerMayAct: isPending && isRequester,
    blockedReason: !isPending ? "terminal" : !isRequester ? "not-requester" : null,
    error: row.error,
  };
}
