import { randomUUID } from "node:crypto";
import { assertMembership, HttpError, withOrgAuth } from "@/lib/auth-shims";
import { logger } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import { RATE } from "@/lib/server/rate-limits";
import * as messages from "@/lib/server/messages.service";
import {
  ASSISTANT_BOT_AGENT_ID,
  ASSIST_HISTORY_LIMIT,
  botContext,
  buildHistory,
  ensureAssistantBot,
  isAssistantEnabled,
} from "@/lib/server/assistant.service";
import { getRuntimeClient } from "@/lib/server/runtime";
import type { RuntimeEvent } from "@/lib/server/runtime";
import { getStorage } from "@/lib/server/storage";
import { userCan } from "@/lib/authz/permissions";

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const sse = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

/**
 * POST /api/channels/[id]/assist { prompt, threadRootId?, document? }
 *
 * `document: { storageKey, filename, contentType? }` (Stage 2) → the server
 * authorizes the storageKey to this channel and mints a presigned GET URL for
 * the runtime's doc-analysis path. Absent → a plain chat turn.
 *
 * Invokes the runtime and relays its SSE stream to the browser. On
 * `done`, posts the assembled reply as an `ai_agent` message (stamped with the
 * runtime's `agentRunId`, idempotent via clientMessageId) so it fans out over
 * realtime like any message. On `error`, nothing is posted.
 */
export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const channelId = params.id!;
    const body = await readJson(req);
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const threadRootId = typeof body.threadRootId === "string" ? body.threadRootId : undefined;
    // Optional attached document (Stage 2). The client names the storageKey it
    // owns from its uploaded Media message; the server mints the URL below.
    const rawDoc = body.document as
      | { storageKey?: unknown; filename?: unknown; contentType?: unknown }
      | undefined;
    const hasDoc = !!(rawDoc && typeof rawDoc.storageKey === "string" && rawDoc.storageKey);
    // A doc turn may carry an empty caption (attach + "summarize" on the URL
    // alone), so require a prompt OR a document — not a prompt unconditionally.
    if (!prompt && !hasDoc) throw new HttpError(400, "prompt or document is required");

    // Membership (tenant isolation) + per-org/channel enable.
    await assertMembership(ctx.orgId, channelId, ctx.userId);
    if (!(await isAssistantEnabled(ctx.orgId, channelId))) {
      throw new HttpError(403, "The assistant is not enabled for this channel");
    }
    // RBAC v2 gate (Phase 2): assistant use. Applies to AI-chat turns and /ai
    // in normal channels — both hit this route. Guests (Channel:view only) fail.
    if (!(await userCan(ctx.userId, ctx.orgId, "Assistant", "create"))) {
      throw new HttpError(403, "You do not have permission to use the assistant");
    }

    // Resolve the attached document → a fresh presigned GET URL, minted
    // server-side (a client-supplied URL is NEVER trusted). First authorize the
    // storageKey to this org+channel so a client can't summarize an arbitrary
    // object (tenant-key guard, matching buildObjectPath's prefix).
    let document: { url: string; filename: string } | undefined;
    if (hasDoc) {
      const storageKey = rawDoc!.storageKey as string;
      const filename = typeof rawDoc!.filename === "string" ? rawDoc!.filename : "";
      const contentType = typeof rawDoc!.contentType === "string" ? rawDoc!.contentType : undefined;
      if (!filename) throw new HttpError(400, "document.filename is required");
      if (!storageKey.startsWith(`quikchat/${ctx.orgId}/${channelId}/`)) {
        throw new HttpError(403, "document does not belong to this channel");
      }
      const url = await getStorage().createDownloadUrl(storageKey, {
        downloadName: filename,
        contentType,
      });
      document = { url, filename };
    }

    // Pushed context: recent messages → history[] (oldest→newest).
    const recent = await messages.list(ctx, channelId, ASSIST_HISTORY_LIMIT);
    // Pass `prompt` so an AI-chat turn (persisted before this call) isn't sent
    // twice — once in history, once as the live prompt. See buildHistory.
    const history = buildHistory(recent, prompt);
    await ensureAssistantBot(ctx.orgId, channelId);

    const traceId = randomUUID();
    const runtime = getRuntimeClient();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const finish = () => {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        try {
          const events = runtime.assist({
            orgId: ctx.orgId,
            userId: ctx.userId,
            channelId,
            threadRootId,
            prompt,
            history,
            document,
            locale: "en",
            botAgentId: ASSISTANT_BOT_AGENT_ID,
            traceId,
          });

          for await (const evt of events as AsyncIterable<RuntimeEvent>) {
            if (evt.type === "done") {
              // Idempotent post keyed on the runtime's agentRunId.
              const clientMessageId = `assist-${evt.agentRunId}`;
              try {
                await messages.send(
                  botContext(ctx.orgId),
                  channelId,
                  { content: evt.text, parentMessageId: threadRootId, clientMessageId },
                  { actorType: "ai_agent", agentRunId: evt.agentRunId },
                );
              } catch (e) {
                logger.error({ traceId, channelId, err: String(e) }, "assist: post reply failed");
              }
              controller.enqueue(
                sse({ type: "done", text: evt.text, agentRunId: evt.agentRunId, clientMessageId }),
              );
              break;
            }
            controller.enqueue(sse(evt));
            if (evt.type === "error") break;
          }
        } catch (e) {
          controller.enqueue(
            sse({ type: "error", message: e instanceof Error ? e.message : "assist failed" }),
          );
        } finally {
          finish();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-trace-id": traceId,
      },
    });
  },
  { rateLimit: RATE.assist },
);
