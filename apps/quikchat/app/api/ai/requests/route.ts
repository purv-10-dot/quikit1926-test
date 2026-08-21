import { randomUUID } from "node:crypto";
import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { logger } from "@/lib/shared";
import { RATE } from "@/lib/server/rate-limits";
import { ASSISTANT_BOT_AGENT_ID } from "@/lib/server/assistant.service";
import { getRuntimeClient } from "@/lib/server/runtime";
import { ListApprovalsError } from "@/lib/server/runtime/types";
import { userCan } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

/** Page size ceiling — a client asking for more gets this. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * GET /api/ai/requests?limit=&offset=
 *
 * Relays the runtime's `GET /ai/requests` — the caller's approval ledger. Our
 * browser client cannot call the runtime directly (it holds no agent JWT), so
 * this exists purely to mint the token and forward.
 *
 * Returns pending rows PLUS terminal ones (`expired`, `rejected`, `executed`,
 * `failed`) from the last 24h, each carrying `status`. Deliberately unfiltered:
 * narrowing to `pending` here would reinstate the trace gap — a write that
 * expired unactioned would silently disappear instead of showing as expired.
 *
 * ── NOT CHANNEL-SCOPED, so `assertMembership` has no analogue ───────────────
 * Every other assistant route proves the caller belongs to a channel. There is
 * no channel here, and nothing replaces that check because nothing needs to:
 * isolation is inherent. `orgId` and `userId` come from `ctx` (session-derived),
 * ride the minted JWT, and the runtime scopes the result on the token.
 *
 * ⚠️ THE ONE THING THAT COULD GO QUIETLY WRONG: never read `userId` or `orgId`
 * from the query string, a header, or the body — not "validate then use", not
 * "allow if it matches". Accepting either from the client is how requester-only
 * isolation becomes "ask for anyone's ledger", and it would look like ordinary
 * parameter plumbing in review. Only `limit` and `offset` come from the request.
 *
 * Gates, and why each:
 *   - `withOrgAuth`        — session + orgId + QuikChat app access.
 *   - `userCan("Assistant","create")` — same capability as using the assistant;
 *     correctly refuses Guests, who hold `Channel:view` only.
 *   - `moduleKey: "assistant"` — 404 when the module is off for the tenant. An
 *     approval request is an artefact OF the assistant; with it disabled the
 *     only rows a tenant could see are historical, and "this feature does not
 *     exist for you" is the honest answer. (Known consequence, filed: a request
 *     already parked when the module is switched off becomes unactionable and
 *     expires unseen. That is a question about what disabling means for
 *     in-flight work, not a reason to leak a list past the gate.)
 *   - `RATE.approvalsList` — read-shaped, NOT `RATE.assist`; see that bucket.
 */
export const GET = withOrgAuth(
  async (req, ctx) => {
    if (!(await userCan(ctx.userId, ctx.orgId, "Assistant", "create"))) {
      throw new HttpError(403, "You do not have permission to use the assistant");
    }

    // ONLY paging comes from the caller. See the warning above.
    const url = new URL(req.url);
    const limit = clampInt(url.searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
    const offset = clampInt(url.searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

    const traceId = randomUUID();
    try {
      const page = await getRuntimeClient().listApprovalRequests({
        // Session-derived, never client-supplied.
        orgId: ctx.orgId,
        userId: ctx.userId,
        botAgentId: ASSISTANT_BOT_AGENT_ID,
        limit,
        offset,
        traceId,
      });
      // Relayed verbatim: `toolInput`/`proposedOutput`/`result` interiors are the
      // target app's own naming and are never normalised here.
      return Response.json(page);
    } catch (e) {
      // A FAILED read must never render as an empty inbox. `{ requests: [] }`
      // means "you have none"; a timeout means "we don't know", and the two look
      // identical on screen while meaning opposite things. So: a non-2xx with a
      // message the client can show as retryable, never a synthesised page.
      const code = e instanceof ListApprovalsError ? e.code : "unavailable";
      logger.warn(
        { traceId, orgId: ctx.orgId, userId: ctx.userId, code },
        "approvals: list read failed",
      );
      if (code === "timeout") {
        throw new HttpError(504, "The approvals service didn't respond. Try again.");
      }
      throw new HttpError(502, "Couldn't reach the approvals service. Try again.");
    }
  },
  { rateLimit: RATE.approvalsList, moduleKey: "assistant" },
);

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
