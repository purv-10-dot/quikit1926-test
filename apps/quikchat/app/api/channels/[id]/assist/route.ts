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

export const dynamic = "force-dynamic";

const encoder = new TextEncoder();
const sse = (event: unknown) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

/**
 * POST /api/channels/[id]/assist { prompt, threadRootId? }
 *
 * Invokes the (stub) runtime and relays its SSE stream to the browser. On
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
    if (!prompt) throw new HttpError(400, "prompt is required");

    // Membership (tenant isolation) + per-org/channel enable.
    await assertMembership(ctx.orgId, channelId, ctx.userId);
    if (!(await isAssistantEnabled(ctx.orgId, channelId))) {
      throw new HttpError(403, "The assistant is not enabled for this channel");
    }

    // Pushed context: recent messages → history[] (oldest→newest).
    const recent = await messages.list(ctx, channelId, ASSIST_HISTORY_LIMIT);
    const history = buildHistory(recent);
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
