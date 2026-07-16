/**
 * Real runtime client — code-complete but inactive until env is set
 * (`RUNTIME_MODE=http` + `RUNTIME_BASE_URL`). POSTs to `/ai/chat/assist` with a
 * minted agent JWT and parses the SSE response into `RuntimeEvent`s. Handles
 * Render cold-start latency (generous timeout) and maps HTTP/stream failures to
 * an `error` event. Tested via a mocked `fetch` (no network).
 *
 * Expected SSE: each message is `data: {json}` where json is a RuntimeEvent
 * (`{type:"delta",text}` | `{type:"done",text,agentRunId}` | `{type:"error",...}`).
 */
import { mintRuntimeToken } from "./token";
import type { AssistInput, RuntimeClient, RuntimeEvent } from "./types";

const REQUEST_TIMEOUT_MS = 60_000; // Render free-tier cold starts can add 30–50s.

export class HttpRuntimeClient implements RuntimeClient {
  constructor(private readonly baseUrl: string) {}

  async *assist(input: AssistInput): AsyncIterable<RuntimeEvent> {
    const token = await mintRuntimeToken({
      orgId: input.orgId,
      botAgentId: input.botAgentId,
      userId: input.userId,
    });

    // orgId/userId are in the token, NOT the body. A doc turn adds `url`+
    // `filename` FLAT at the top level (the runtime's confirmed contract);
    // absent → body byte-identical to a plain turn (back-compat).
    const body = JSON.stringify({
      channelId: input.channelId,
      threadRootId: input.threadRootId,
      prompt: input.prompt,
      history: input.history,
      locale: input.locale,
      ...(input.document
        ? { url: input.document.url, filename: input.document.filename }
        : {}),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/ai/chat/assist`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "text/event-stream",
          "x-trace-id": input.traceId,
        },
        body,
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      yield {
        type: "error",
        message: e instanceof Error ? e.message : "runtime request failed",
        code: "network",
      };
      return;
    }

    if (!res.ok) {
      clearTimeout(timer);
      yield { type: "error", message: `runtime responded ${res.status}`, code: String(res.status) };
      return;
    }
    if (!res.body) {
      clearTimeout(timer);
      yield { type: "error", message: "runtime returned no stream", code: "no_body" };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          const evt = parseSseBlock(block);
          if (evt) {
            yield evt;
            if (evt.type === "done") return;
          }
        }
      }
      const tail = parseSseBlock(buffer);
      if (tail) yield tail;
    } catch (e) {
      yield {
        type: "error",
        message: e instanceof Error ? e.message : "stream error",
        code: "stream",
      };
    } finally {
      clearTimeout(timer);
      reader.releaseLock();
    }
  }
}

/** Parse one SSE block into a RuntimeEvent (collecting `data:` lines as JSON). */
export function parseSseBlock(block: string): RuntimeEvent | null {
  const dataLines = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  if (!dataLines.length) return null;
  const raw = dataLines.join("");
  if (!raw || raw === "[DONE]") return null;
  try {
    const obj = JSON.parse(raw) as RuntimeEvent;
    if (obj && typeof obj.type === "string") return obj;
  } catch {
    // ignore malformed blocks (keepalives, comments)
  }
  return null;
}
