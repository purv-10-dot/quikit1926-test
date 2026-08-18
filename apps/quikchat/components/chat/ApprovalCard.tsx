"use client";

/**
 * The approval card — ONE component, rendered from an `ApprovalCardModel`.
 *
 * It appears in two places (the live assistant turn and the "Your approvals"
 * section in Activity) from two different payloads. The shape difference is
 * absorbed by the adapters in `lib/approval-card.ts`; by the time anything
 * reaches this file there is one model and one set of rules. See that file's
 * header for why it is one component and not two, or one with a mode prop.
 *
 * Three rules live here and nowhere else, which is the point of there being one
 * of these:
 *   1. An unrecognised `riskClass` renders at the HIGHEST risk (normalised in
 *      the adapter, styled here, and explained to the user).
 *   2. `toolInput` renders VERBATIM — keys exactly as the target app sent them.
 *   3. An aged-out card disables VISIBLY rather than failing on tap.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Clock, Shield, X } from "@/components/ui";
import type { AssistApprovalDecision, AssistApprovalStatus, AssistRiskClass } from "@/lib/shared";
import { isApprovalExpired, type ApprovalCardModel } from "@/lib/approval-card";

/** How often the card re-checks its own expiry while it is actionable. */
const EXPIRY_TICK_MS = 15_000;

const RISK_LABEL: Record<AssistRiskClass, string> = {
  soft_write: "Low risk",
  medium_write: "Medium risk",
  high_risk: "High risk",
};

/**
 * Our own label for a lifecycle state — not an interpretation of the write, and
 * only ever a FALLBACK: when the row carries the runtime's `outcomeSummary`,
 * that sentence is shown instead of anything from this function.
 *
 * `byViewer` names the actor where we can do so truthfully. "Rejected" and
 * "Cancelled" are passive voice hiding a subject, and the ledger's whole purpose
 * is who-decided-what — but the only identity available here is a boolean (see
 * `decidedByViewer`), so this says "you" or says nothing. A named third party
 * comes from `outcomeSummary`, which the runtime can populate because it has the
 * directory and this component does not.
 */
function statusLabel(status: AssistApprovalStatus, byViewer = false): string {
  switch (status) {
    case "executed":
      return "Approved — action completed";
    case "failed":
      return "Approved — the action failed";
    case "rejected":
      return byViewer ? "Rejected — you declined this" : "Rejected";
    case "cancelled":
      /**
       * Deliberately NOT the `rejected` wording. A human declining and the
       * request being withdrawn are different facts about different actors:
       * `cancelled` means the tenant disabled the assistant module while this
       * sat parked, so nobody answered it and nobody now can. Wording it as a
       * decision would attribute an administrative action to the requester —
       * who, in v1, is the person reading this card.
       */
      return byViewer
        ? "Cancelled — you withdrew this"
        : "Cancelled — withdrawn before it was answered";
    case "expired":
      return "Expired without an answer";
    case "pending":
      return "Waiting for your answer";
    default:
      /**
       * An unfamiliar state reads as unfamiliar rather than being folded into a
       * known one — so the raw value is shown.
       *
       * The `||` is the part that matters. A raw `""` (or whitespace) rendered
       * an EMPTY outcome line: the card showed a bordered box with nothing in
       * it, which reads as a rendering bug rather than as a data problem and
       * sends whoever hits it looking in the wrong place entirely. "Visibly
       * terminal" has to hold for degenerate values too, not just for
       * plausible-looking unknown ones.
       */
      /**
       * `String(...)` because TypeScript narrows `status` to `never` here — the
       * switch is exhaustive over the union — while the whole point of the
       * leniency rule is that a value OUTSIDE the union reaches this line at
       * runtime. It may not even be a string: a number or null from the wire
       * would throw on `.trim()`, turning a cosmetic unknown-state problem into
       * a blank-screen render error.
       */
      return String(status).trim() || "Unrecognised state";
  }
}

type Phase =
  | { kind: "idle" }
  | { kind: "deciding"; action: "approve" | "reject" }
  | { kind: "settled"; decision: AssistApprovalDecision }
  | { kind: "failed"; message: string; retryable: boolean };

export interface ApprovalCardProps {
  model: ApprovalCardModel;
  /**
   * Perform the decision. Rejects with an `ApprovalDecisionFailure` when the
   * decision could not be RECORDED; resolves for every recorded decision,
   * including `status: "failed"` — see the settled branch below.
   */
  onDecide: (
    requestId: string,
    action: "approve" | "reject",
  ) => Promise<AssistApprovalDecision>;
  /**
   * Fired once the truth on the server has moved: a decision settled, or a 409
   * revealed it had already moved without us. The list uses it to refetch. Not
   * fired on a retryable transport failure — nothing changed.
   */
  onSettled?: () => void;
}

/**
 * Re-render on a timer so a card can age out while it is on screen.
 *
 * Only ticks while there is something to age. A live turn can sit for the whole
 * expiry window with the user looking straight at it; without this, the buttons
 * stay enabled past the deadline and the first sign of trouble is a 409 on tap —
 * which is the specific failure "disables visibly rather than failing on tap"
 * rules out.
 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), EXPIRY_TICK_MS);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function ApprovalCard({ model, onDecide, onSettled }: ApprovalCardProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  /**
   * THE DOUBLE-TAP GUARD, and it is a ref rather than the `phase` state above on
   * purpose.
   *
   * Two clicks in the same tick both run the handler with the same closed-over
   * `phase`, so a `if (phase.kind === "deciding") return` check passes twice and
   * fires two POSTs. A ref is written synchronously and read by the second call
   * immediately, so the second tap never reaches the network. `phase` still
   * drives what the user sees; this decides what happens.
   *
   * It matters because approval is deliberately NOT idempotent: the second POST
   * is refused with 409 rather than replayed. The 409 is the backstop that makes
   * an escaped tap harmless — this latch is what stops it being routine.
   */
  const inFlight = useRef(false);

  const settled = phase.kind === "settled";
  const busy = phase.kind === "deciding";
  // Stop the clock once a decision has landed — a settled card cannot age out,
  // and a terminal row never could.
  const now = useNow(model.viewerMayAct && !settled && !!model.expiresAt);
  const expired = isApprovalExpired(model.expiresAt, now);
  /**
   * A failure only keeps the buttons down when RETRYING IS UNSAFE. The two must
   * agree with the latch in `decide` below — `retryable` is the single fact both
   * read, so a transient blip re-offers the button and a 409/410/timeout does
   * not. Blocking on `phase.kind === "failed"` alone would leave a card dead
   * after one flaky request.
   */
  const blockedByFailure = phase.kind === "failed" && !phase.retryable;
  const canAct = model.viewerMayAct && !expired && !busy && !settled && !blockedByFailure;

  const decide = useCallback(
    (action: "approve" | "reject") => {
      if (inFlight.current) return; // synchronous — see `inFlight`
      inFlight.current = true;
      setPhase({ kind: "deciding", action });
      onDecide(model.requestId, action).then(
        (decision) => {
          setPhase({ kind: "settled", decision });
          onSettled?.();
        },
        (e: unknown) => {
          const err = e as { message?: string; code?: string };
          /**
           * Re-enable ONLY for a plain transport failure.
           *
           * `unavailable` is the one code where nothing happened and trying
           * again is sound. Everything else stays latched:
           *   - `timeout` — we do not know whether it landed, so re-offering the
           *     button is inviting the double write the 409 exists to catch.
           *     The relay's message tells them to refresh instead.
           *   - `already_handled` / `forbidden` / `tool_gone` / `not_found` —
           *     the request is gone or barred. Another tap cannot change that.
           */
          const retryable = err.code === "unavailable";
          if (retryable) inFlight.current = false;
          setPhase({
            kind: "failed",
            message: err.message || "Couldn't record your answer.",
            retryable,
          });
          // A 409 means the server's truth moved without us — a second tab, or
          // an expiry sweep. Refetch so the list stops showing it as pending.
          if (err.code === "already_handled") onSettled?.();
        },
      );
    },
    [model.requestId, onDecide, onSettled],
  );

  const entries = Object.entries(model.toolInput);

  return (
    <div
      className="qc-approval"
      data-risk={model.risk}
      data-status={model.status}
      data-testid="approval-card"
      data-request-id={model.requestId}
    >
      <div className="qc-approval__head">
        <span className="qc-approval__risk" data-testid="approval-risk">
          <Shield size={12} aria-hidden />
          {RISK_LABEL[model.risk]}
        </span>
        {/* Which app is about to change. Never behind the expander: the user
            should not have to open anything to learn what is being touched. */}
        <span className="qc-approval__app" data-testid="approval-app">
          {model.appId}
        </span>
        {model.expiresAt && model.status === "pending" ? (
          <span className="qc-approval__expiry" data-expired={expired}>
            <Clock size={12} aria-hidden />
            {expired ? "Expired" : `Expires ${new Date(model.expiresAt).toLocaleTimeString()}`}
          </span>
        ) : null}
      </div>

      {/* The runtime's sentence, passed through untouched — never interpreted,
          truncated or reformatted. When the ledger gives us none, the tool's raw
          name stands in; we do not compose a sentence from toolName+toolInput. */}
      {model.summary ? (
        <p className="qc-approval__summary" data-testid="approval-summary">
          {model.summary}
        </p>
      ) : (
        <p className="qc-approval__summary qc-approval__summary--fallback">
          <code data-testid="approval-summary-fallback">{model.toolName}</code>
        </p>
      )}

      {model.riskIsUnrecognised ? (
        // Say WHY it is at maximum caution. Silent conservative styling on an
        // ordinary-looking write just reads as a bug.
        <p className="qc-approval__note" data-testid="approval-risk-unknown">
          <AlertCircle size={12} aria-hidden />
          This action has an unrecognised risk level, so it&apos;s shown at the highest.
        </p>
      ) : null}

      <details className="qc-approval__details">
        <summary>Details</summary>
        <dl className="qc-approval__kv" data-testid="approval-tool-input">
          <dt>tool</dt>
          <dd>
            <code>{model.toolName}</code>
          </dd>
          {/*
            VERBATIM. Keys are the target app's own naming — `projectId`,
            `custom_field_7`, whatever QuikTrack calls things — and are rendered
            exactly as received: no camelCasing, no prettifying, no title-casing,
            no reordering. Typing or normalising the interior would be inventing a
            contract we do not own, and the person approving a write needs to see
            what will actually be sent, not our rendering of it.
          */}
          {entries.length === 0 ? (
            <>
              <dt>arguments</dt>
              <dd>none</dd>
            </>
          ) : (
            entries.map(([key, value]) => (
              <div className="qc-approval__kvrow" key={key}>
                <dt>{key}</dt>
                <dd>
                  <code>{typeof value === "string" ? value : JSON.stringify(value)}</code>
                </dd>
              </div>
            ))
          )}
        </dl>
      </details>

      {phase.kind === "settled" ? (
        <SettledLine decision={phase.decision} />
      ) : model.status !== "pending" ? (
        /*
         * A terminal row is an outcome, not a live proposal — no buttons, ever.
         *
         * This is the card's OWN positive check for "pending", repeated rather
         * than delegated to `model.viewerMayAct`. The adapter already computed
         * the same thing; doing it again here means an unknown status renders as
         * terminal even if a future adapter (or a hand-built model) got
         * `viewerMayAct` wrong. Two independent gates, both positive, so an
         * unfamiliar state falls safe at each — see AssistApprovalStatus.
         */
        <div className="qc-approval__outcome" data-testid="approval-terminal">
          {/*
            The runtime's sentence when there is one, our label when there is
            not. Rows predating `outcomeSummary` are the common case in a 24h
            ledger that spans the deploy, so the fallback is a live path, not a
            defensive gesture.
          */}
          {model.outcomeSummary ?? statusLabel(model.status, model.decidedByViewer)}
          {/*
            `error` renders INDEPENDENTLY of which line won above. On a failed
            row the generated sentence may say "Could not create the issue"
            without saying why, and this is the target app's own words — the only
            text on the card a user can act on. Mild duplication beats dropping it.
          */}
          {model.error ? <span className="qc-approval__err">{model.error}</span> : null}
        </div>
      ) : model.blockedReason === "not-requester" ? (
        <div className="qc-approval__outcome">Only the person who asked can answer this.</div>
      ) : (
        <>
          <div className="qc-approval__actions">
            {/* Both buttons take the same latch: approving must disable reject
                too, or a fast pair of clicks sends one of each. */}
            <button
              type="button"
              className="qc-btn qc-btn--primary"
              disabled={!canAct}
              onClick={() => decide("approve")}
              data-testid="approval-approve"
            >
              <Check size={14} aria-hidden />
              {phase.kind === "deciding" && phase.action === "approve" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              className="qc-btn"
              disabled={!canAct}
              onClick={() => decide("reject")}
              data-testid="approval-reject"
            >
              <X size={14} aria-hidden />
              {phase.kind === "deciding" && phase.action === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
          {expired ? (
            // Visible, next to the disabled buttons. The card explains itself
            // rather than letting the user find out by tapping.
            <p className="qc-approval__note" data-testid="approval-expired">
              This request expired before it was answered, so it can no longer be run.
            </p>
          ) : null}
        </>
      )}

      {phase.kind === "failed" ? (
        <p className="qc-approval__err" role="alert" data-testid="approval-error">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What happened, once a decision has landed.
 *
 * `status: "failed"` arrives on HTTP 200 and is rendered as an OUTCOME, in the
 * card, with the target app's own message — not as a transport error and not as
 * a toast. The approval succeeded; the write did not. Telling the user "couldn't
 * reach the service" here would be false, would hide the only text that explains
 * the refusal, and would invite a retry of a decision already consumed.
 */
function SettledLine({ decision }: { decision: AssistApprovalDecision }) {
  const failed = decision.status === "failed";
  return (
    <div
      className="qc-approval__outcome"
      data-outcome={decision.status}
      data-testid="approval-settled"
      role="status"
    >
      {/*
        NO REFETCH NEEDED. The runtime serves `outcomeSummary` on the decision
        response as well as on the ledger row, so the card that just took the
        decision shows the real outcome immediately — "Created QTRK-903" rather
        than "Approved — action completed".
        The list still refetches (`onSettled`), but for the OTHER surfaces: the
        Activity section, a second tab, a reload. This line never waits on it.
        `||` and not `??`: this value comes straight off the wire with no adapter
        in between, so an empty string reaches here intact — and an empty summary
        is the runtime saying nothing useful, which our own label beats.
      */}
      {decision.outcomeSummary || statusLabel(decision.status)}
      {failed && decision.error ? (
        // Same rule as the terminal row: the app's own words survive whichever
        // line won above, because they are the only actionable text here.
        <span className="qc-approval__err" data-testid="approval-settled-error">
          {decision.error}
        </span>
      ) : null}
    </div>
  );
}
