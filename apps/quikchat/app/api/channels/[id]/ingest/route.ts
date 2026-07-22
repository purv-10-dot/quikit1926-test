import { assertMembership, HttpError, withOrgAuth } from "@/lib/auth-shims";
import { logger } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";
import { ASSISTANT_BOT_AGENT_ID, isAssistantEnabled } from "@/lib/server/assistant.service";
import { markMessageIngested } from "@/lib/server/kb.service";
import { getRuntimeClient, IngestError } from "@/lib/server/runtime";
import type { IngestErrorCode } from "@/lib/server/runtime";
import type { IngestVisibility } from "@/lib/shared";
import { userCan } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

const VALID_VISIBILITY: IngestVisibility[] = ["PRIVATE", "APP", "ORG"];

/** Map a runtime ingest failure → a client HTTP status + a real, user-facing message. */
function mapIngestError(code: IngestErrorCode): { status: number; message: string } {
  switch (code) {
    case "object_not_found":
      return { status: 404, message: "The uploaded file couldn't be found for indexing." };
    case "extract_failed":
      return { status: 422, message: "We couldn't extract any text from that document." };
    case "bad_jwt":
      return { status: 502, message: "The knowledge base service rejected the request." };
    default:
      return { status: 502, message: "The knowledge base service is unavailable. Please try again." };
  }
}

/**
 * POST /api/channels/[id]/ingest { storageKey, filename, visibility? }
 *
 * Stage 3 "Add to KB": authorizes the storageKey to this channel (the Stage-2
 * tenant-key guard), then calls the runtime's sync `/ai/ingest` with the durable
 * storageKey. `sourceFileId === storageKey` (confirmed identity). `visibility`
 * defaults to PRIVATE; the runtime's full enum (incl. APP) is accepted, though
 * the Stage-3 UI only sends PRIVATE/ORG. Returns the runtime's IngestResult.
 */
export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const channelId = params.id!;
    const body = await readJson(req);
    const storageKey = typeof body.storageKey === "string" ? body.storageKey : "";
    const filename = typeof body.filename === "string" ? body.filename : "";
    // The client owns the Media message it's ingesting; passing its id lets us
    // persist the Option-B marker by primary key (see markMessageIngested).
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const visibility = (
      typeof body.visibility === "string" ? body.visibility : "PRIVATE"
    ) as IngestVisibility;

    if (!storageKey) throw new HttpError(400, "storageKey is required");
    if (!filename) throw new HttpError(400, "filename is required");
    if (!VALID_VISIBILITY.includes(visibility)) throw new HttpError(400, "invalid visibility");

    // Membership (tenant isolation) + the assistant feature gate (mirrors assist).
    await assertMembership(ctx.orgId, channelId, ctx.userId);
    if (!(await isAssistantEnabled(ctx.orgId, channelId))) {
      throw new HttpError(403, "The assistant is not enabled for this channel");
    }
    // storageKey channel-authz (Stage-2 guard): no ingesting an arbitrary object.
    if (!storageKey.startsWith(`quikchat/${ctx.orgId}/${channelId}/`)) {
      throw new HttpError(403, "document does not belong to this channel");
    }
    // RBAC v2 gate (Phase 2): PRIVATE/APP → Assistant.IngestPrivate (Member has
    // it); ORG → Assistant.IngestOrg (DECISION 3, Admin-only via its grant).
    const ingestResource =
      visibility === "ORG" ? "Assistant.IngestOrg" : "Assistant.IngestPrivate";
    if (!(await userCan(ctx.userId, ctx.orgId, ingestResource, "create"))) {
      throw new HttpError(403, "You do not have permission to add documents to this knowledge base");
    }

    try {
      const result = await getRuntimeClient().ingest({
        orgId: ctx.orgId,
        userId: ctx.userId,
        botAgentId: ASSISTANT_BOT_AGENT_ID,
        storageKey,
        sourceFileId: storageKey, // confirmed identity: sourceFileId === storageKey
        appId: "quikchat", // entityId reserved for Stage 4 — not sent
        visibility,
        filename,
      });
      // Option-B persisted marker: hang the KB flag on the Media message so a
      // fresh page load rebuilds this conversation's retrieval scope. Non-fatal
      // — a failed marker just means the scope reseeds on the next ingest/reload;
      // the ingest itself succeeded, so we still return the result.
      if (messageId) {
        try {
          await markMessageIngested({
            orgId: ctx.orgId,
            channelId,
            messageId,
            storageKey,
            visibility,
            userId: ctx.userId,
            ingestedAt: new Date(),
          });
        } catch (e) {
          logger.error(
            { channelId, messageId, err: String(e) },
            "ingest: KB marker persist failed",
          );
        }
      }
      return Response.json(result);
    } catch (e) {
      if (e instanceof IngestError) {
        const { status, message } = mapIngestError(e.code);
        return Response.json({ error: message, code: e.code }, { status });
      }
      throw e;
    }
  },
  { rateLimit: RATE.ingest, moduleKey: "knowledge_base" },
);
