import { withOrgAuth } from "@/lib/auth-shims";
import { RATE } from "@/lib/server/rate-limits";
import { decideApprovalRequest } from "@/lib/server/approval-decision";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai/requests/[id]/reject
 *
 * Relays the runtime's `POST /ai/requests/{id}/reject` — the human "no" on a
 * parked write. Twin of the approve route in every respect except the runtime
 * method called; both delegate to `decideApprovalRequest`, which is where the
 * identity rule and the error mapping live.
 *
 * Worth stating that reject gets the SAME gates and the SAME rate bucket as
 * approve rather than looser ones. It is tempting to treat "no" as harmless, but
 * a reject is still a recorded, irreversible decision on someone's parked write:
 * it consumes the request, so a wrongly-permitted reject is a denial-of-service
 * on the requester's action, and a replayed one is the same 409. The only
 * asymmetry between the two endpoints is that reject never performs a write in
 * the target app, so it cannot answer `status: "failed"` — but it is typed to,
 * because the runtime owns that vocabulary and narrowing it here would be us
 * asserting something about their build.
 *
 * ⚠️ NEVER read `userId` or `orgId` from the path, query, headers or body. See
 * the approve route and the shared helper.
 */
export const POST = withOrgAuth(
  async (_req, ctx, params) => decideApprovalRequest(ctx, params.id ?? "", "reject"),
  { rateLimit: RATE.approvalDecision, moduleKey: "assistant" },
);
