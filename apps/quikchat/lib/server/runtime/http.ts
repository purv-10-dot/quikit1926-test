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
import type { IngestResult } from "@/lib/shared";
import { IngestError } from "./types";
import type { AssistInput, IngestInput, RuntimeClient, RuntimeEvent } from "./types";

const REQUEST_TIMEOUT_MS = 60_000; // Render free-tier cold starts can add 30–50s.

export class HttpRuntimeClient implements RuntimeClient {
  constructor(private readonly baseUrl: string) {}

  async *assist(input: AssistInput): AsyncIterable<RuntimeEvent> {
    const token = await mintRuntimeToken({
      orgId: input.orgId,
      botAgentId: input.botAgentId,
      userId: input.userId,
    });

    // orgId/userId are in the token, NOT the body. `appId` rides EVERY turn
    // (toolset scoping). A doc turn adds `url`+`filename` FLAT at the top level;
    // a KB turn adds `knowledgeBase` NESTED — both per the runtime's confirmed
    // contract. With neither, the body is byte-identical to a plain turn plus
    // the always-present `appId` (back-compat: the runtime ignores unknown-less
    // shapes; `appId` is now part of the contract on all turns).
    const body = JSON.stringify({
      appId: input.appId,
      channelId: input.channelId,
      threadRootId: input.threadRootId,
      prompt: input.prompt,
      history: input.history,
      locale: input.locale,
      ...(input.document
        ? { url: input.document.url, filename: input.document.filename }
        : {}),
      ...(input.knowledgeBase ? { knowledgeBase: input.knowledgeBase } : {}),
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

  /**
   * Ingest a document into the KB (Stage 3). Sync request/response — POSTs the
   * top-level fields to `/ai/ingest` with the same minted agent JWT as assist
   * (orgId/userId in the token). Maps a non-2xx to a coded `IngestError` the
   * relay turns into a real toast.
   */
  async ingest(input: IngestInput): Promise<IngestResult> {
    const token = await mintRuntimeToken({
      orgId: input.orgId,
      botAgentId: input.botAgentId,
      userId: input.userId,
    });

    const body = JSON.stringify({
      storageKey: input.storageKey,
      sourceFileId: input.sourceFileId,
      appId: input.appId,
      visibility: input.visibility,
      filename: input.filename,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/ai/ingest`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
        signal: controller.signal,
      });
    } catch {
      clearTimeout(timer);
      throw new IngestError("ingest_failed");
    }
    clearTimeout(timer);

    if (!res.ok) {
      const code =
        res.status === 404
          ? "object_not_found"
          : res.status === 422
            ? "extract_failed"
            : res.status === 401
              ? "bad_jwt"
              : "ingest_failed";
      throw new IngestError(code, res.status);
    }
    return (await res.json()) as IngestResult;
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
