import { withOrgAuth } from "@/lib/auth-shims";
import { RATE } from "@/lib/server/rate-limits";
import { decideApprovalRequest } from "@/lib/server/approval-decision";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/requests/[id]/approve
 *
 * Relays the runtime's `POST /ai/requests/{id}/approve` — the human "yes" on a
 * parked write. Our browser client cannot call the runtime directly (it holds no
 * agent JWT), so this exists purely to mint the token and forward.
 *
 * The body of the work, the identity rule and the whole error mapping live in
 * `lib/server/approval-decision.ts`, shared with the reject route so the two
 * cannot drift. Read the warning there before changing anything here.
 *
 * ── NOT CHANNEL-SCOPED, so `assertMembership` has no analogue ───────────────
 * Same as `GET /api/ai/requests`: there is no channel, and nothing replaces that
 * check because nothing needs to. `orgId`/`userId` come from `ctx`, ride the
 * minted JWT, and the runtime authorises the decision on the token — a request
 * belonging to another org resolves to 404 there.
 *
 * ⚠️ NEVER read `userId` or `orgId` from the path, query, headers or body. The
 * only client-supplied value is `[id]`, and it is safe only because of the
 * above. This endpoint WRITES, in another app; the list relay's warning applies
 * here with the consequences one step larger.
 *
 * ⚠️ NOT IDEMPOTENT, deliberately. A second POST for the same id is refused with
 * 409, which is also where a double-tapped button lands. The client guards the
 * tap; this is the backstop that makes the guard's failure harmless rather than
 * a double write.
 *
 * Gates, and why each — identical to the list relay's, on purpose:
 *   - `withOrgAuth`        — session + orgId + QuikChat app access.
 *   - `userCan("Assistant","create")` — in the shared helper. Same capability as
 *     using the assistant and as listing the ledger: in v1 the requester is the
 *     approver, so a stricter gate here would show a card nobody could answer.
 *   - `moduleKey: "assistant"` — 404 when the module is off for the tenant. Note
 *     the known consequence, filed against the runtime team: a request already
 *     parked when the module is switched off becomes unactionable through this
 *     route too, and expires unseen.
 *   - `RATE.approvalDecision` — write-shaped, NOT `RATE.approvalsList`.
 */
export const POST = withOrgAuth(
  async (_req, ctx, params) => decideApprovalRequest(ctx, params.id ?? "", "approve"),
  { rateLimit: RATE.approvalDecision, moduleKey: "assistant" },
);
