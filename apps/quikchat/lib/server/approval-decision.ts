/**
 * The shared body of `POST /api/ai/requests/{id}/approve` and `.../reject`.
 *
 * One helper, two routes. The two endpoints differ ONLY in which runtime method
 * they call: identical gates, identical identity rule, identical error mapping,
 * identical "200 is an outcome" rule. Written separately they would drift, and
 * the drift would be silent — a reject route that forgot to map 409 looks
 * exactly like one that maps it, right up until someone double-taps.
 *
 * Follows `GET /api/ai/requests` deliberately and in detail; read that route
 * first if this one looks over-commented.
 */
import { randomUUID } from "node:crypto";
import { HttpError } from "@/lib/auth-shims";
import { logger } from "@/lib/shared";
import type { OrgContext } from "@/lib/shared";
import { ASSISTANT_BOT_AGENT_ID } from "@/lib/server/assistant.service";
import { getRuntimeClient } from "@/lib/server/runtime";
import { ApprovalDecisionError } from "@/lib/server/runtime/types";
import type { ApprovalDecisionErrorCode } from "@/lib/server/runtime/types";
import { userCan } from "@/lib/authz/permissions";
import { applyApprovalDecision } from "@/lib/server/approval-message.service";

export type ApprovalAction = "approve" | "reject";

/**
 * Coded failure → HTTP status + the sentence the user actually reads.
 *
 * Statuses that mean something specific to the client (409/403/410/404) pass
 * through as themselves; only our-side and their-side faults collapse (401 and
 * 5xx → 502, timeout → 504). Same split the list relay makes, for the same
 * reason: a status the client can branch on is worth preserving, a status that
 * only says "not us" is not.
 */
export function mapApprovalDecisionError(code: ApprovalDecisionErrorCode): {
  status: number;
  message: string;
} {
  switch (code) {
    case "already_handled":
      /**
       * WHERE A DOUBLE-TAP LANDS, and the reason the wording is past-tense.
       * Approval is deliberately not idempotent, so the second call is refused
       * rather than replayed. "Already handled or expired" is honest about both
       * causes and, crucially, does not invite a retry — the client's job here
       * is to refetch and show the true state, not to try again.
       */
      return {
        status: 409,
        message: "That request was already handled, or it expired before you answered.",
      };
    case "forbidden":
      // Permission revoked BETWEEN proposal and approval. The user could have
      // done this when the card appeared; saying "you don't have permission"
      // without "no longer" reads as though the card should never have shown.
      return {
        status: 403,
        message: "You no longer have permission to run this action.",
      };
    case "tool_gone":
      // Deregistered tool. Distinct from `forbidden` because "no permission"
      // sounds like something an admin could grant, and this is not that.
      return {
        status: 410,
        message: "That action is no longer available in the target app.",
      };
    case "not_found":
      // Unknown id, or another org's. One message for both — see the runtime
      // client's note on why distinguishing them is itself a leak.
      return { status: 404, message: "That request no longer exists." };
    case "bad_jwt":
      // Our token, not their mistake. 502 because from the caller's side this
      // is the service failing, and there is nothing for them to fix.
      return { status: 502, message: "The approvals service rejected the request." };
    case "timeout":
      /**
       * ⚠️ THE ONE MESSAGE THAT MUST NOT SAY "TRY AGAIN".
       *
       * A timeout here does not mean the decision failed. It means we stopped
       * waiting: the runtime may have recorded the approval and executed the
       * write after our socket closed. Because approval is deliberately not
       * idempotent, "try again" is advice toward one of two bad outcomes — a
       * 409 that now reads as a bug, or, if the runtime ever relaxes the rule,
       * a genuine double write.
       *
       * So the instruction is to go LOOK. Refreshing costs nothing and resolves
       * the ambiguity; retrying resolves nothing and can compound it. This is
       * the only failure on this surface where the safe action and the obvious
       * action differ, which is exactly why it is spelled out here rather than
       * left to whoever writes the next toast.
       */
      return {
        status: 504,
        message:
          "We didn't get a response, so this may or may not have gone through. " +
          "Refresh to check before answering again.",
      };
    default:
      return { status: 502, message: "Couldn't reach the approvals service. Try again." };
  }
}

/**
 * Run one decision and return the relay's Response.
 *
 * ⚠️ THE ONE THING THAT COULD GO QUIETLY WRONG — the same one the list relay
 * carries, and it is sharper here because this endpoint WRITES. Never read
 * `userId` or `orgId` from the path, the query string, a header or the body. Not
 * "validate then use", not "allow if it matches". They come from `ctx`
 * (session-derived) and ride the minted JWT, and the runtime authorises the
 * decision on that token. Accepting either from the client turns "approve my own
 * parked write" into "approve anyone's", and it would look like ordinary
 * parameter plumbing in review.
 *
 * `requestId` is the ONLY client-supplied value, and it is safe precisely
 * because of the above: another org's id resolves to 404 on the runtime side
 * since the token scopes the lookup. It is not validated for shape here — an
 * unknown id is the runtime's 404 to give, and a regex would only add a second
 * place to be wrong about the runtime's id format.
 */
export async function decideApprovalRequest(
  ctx: OrgContext,
  requestId: string,
  action: ApprovalAction,
): Promise<Response> {
  if (!requestId) throw new HttpError(400, "requestId is required");

  // Same capability as using the assistant, and as listing the ledger. Correctly
  // refuses Guests, who hold `Channel:view` only. Deliberately NOT a stricter
  // gate than the list: anyone who can see their own parked write can answer it,
  // because in v1 the requester is the approver.
  if (!(await userCan(ctx.userId, ctx.orgId, "Assistant", "create"))) {
    throw new HttpError(403, "You do not have permission to use the assistant");
  }

  const traceId = randomUUID();
  const client = getRuntimeClient();
  // Built ONCE and handed to whichever method runs. Two literals would be two
  // places for the identity fields to diverge, and a reject path that quietly
  // stopped passing `orgId` would still typecheck and still work — until it hit
  // a runtime that scoped on it.
  const input = {
    // Session-derived, never client-supplied. See the warning above.
    orgId: ctx.orgId,
    userId: ctx.userId,
    botAgentId: ASSISTANT_BOT_AGENT_ID,
    requestId,
    traceId,
  };
  try {
    const decision = await (action === "approve"
      ? client.approveRequest(input)
      : client.rejectRequest(input));

    /**
     * 200, INCLUDING `status: "failed"`.
     *
     * The decision was recorded; the target app then refused the write. Two
     * different systems, two different failures, and only one of them is ours to
     * report as an error. Returning 4xx/5xx here would tell the client to retry
     * a decision that has already been consumed, and would bury the target app's
     * `errorCode`/`error` — the only part of the payload that says what went
     * wrong. Relayed verbatim, `result` interiors untouched.
     */
    if (decision.status === "failed") {
      logger.info(
        { traceId, orgId: ctx.orgId, userId: ctx.userId, requestId, action },
        "approvals: decision recorded, target app refused the write",
      );
    }

    /**
     * Carry the outcome onto the persisted card and fan it out, so the channel
     * — including everyone who was never in the turn — sees the state change
     * live rather than on their next reload.
     *
     * AWAITED but never able to fail this response. The decision is already
     * recorded on the runtime by now; reporting an error because our own copy
     * could not be updated would tell the user their approval failed when it
     * did not. `applyApprovalDecision` swallows and logs its own failures, and
     * a missed patch is repaired by the next reconcile.
     *
     * This route is NOT channel-scoped — it has a requestId and nothing else —
     * which is why the card is stored under a `clientMessageId` derived from
     * that id and found by an indexed lookup rather than a JSON-path scan.
     */
    await applyApprovalDecision(ctx.orgId, requestId, decision, {
      decisionBy: ctx.userId,
    });

    return Response.json(decision);
  } catch (e) {
    const code = e instanceof ApprovalDecisionError ? e.code : "unavailable";
    const { status, message } = mapApprovalDecisionError(code);
    logger.warn(
      { traceId, orgId: ctx.orgId, userId: ctx.userId, requestId, action, code, status },
      "approvals: decision failed",
    );
    // `code` is on the body so the client can branch (refetch on 409, stop
    // offering the buttons on 410) without parsing the human sentence. Same
    // shape as the ingest relay's `{ error, code }`.
    return Response.json({ error: message, code }, { status });
  }
}
