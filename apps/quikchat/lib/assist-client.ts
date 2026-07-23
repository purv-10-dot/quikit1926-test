/**
 * Client SSE reader for the in-chat assistant. POSTs the prompt to the relay
 * route and parses the `text/event-stream` response into delta/done/error
 * callbacks. Pass an AbortSignal to support client-side "stop" (closes the
 * stream; the runtime has no server-side cancellation yet — J1).
 */

import type { AssistSource } from "@/lib/shared";

export type { AssistSource };

export interface AssistDonePayload {
  text: string;
  agentRunId: string;
  clientMessageId: string;
  /**
   * Retrieval citations for a KB-backed turn (Stage 3). Present only when the
   * KB was used; absent on a plain turn. Rendered as ephemeral source chips on
   * the live turn — never persisted.
   */
  sources?: AssistSource[];
}

export interface AssistHandlers {
  onDelta: (text: string) => void;
  onDone: (payload: AssistDonePayload) => void;
  onError: (message: string) => void;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      text: string;
      agentRunId: string;
      clientMessageId: string;
      sources?: AssistSource[];
    }
  | { type: "error"; message: string; code?: string };

export async function streamAssist(
  channelId: string,
  body: {
    prompt: string;
    threadRootId?: string;
    /**
     * Optional attached document (Stage 2). The client sends the `storageKey`
     * it owns from its uploaded Media message; the relay authorizes it and mints
     * the presigned URL server-side (a client URL is never trusted).
     */
    document?: { storageKey: string; filename: string; contentType?: string };
    /**
     * Optional KB retrieval scope (Stage 3). Nested per the runtime contract.
     * Omit entirely for a plain turn; `{ enabled: true, sourceFileIds }` scopes
     * retrieval to the conversation's docs; `{ enabled: true }` widens to the
     * whole KB ("search my docs").
     */
    knowledgeBase?: { enabled: boolean; sourceFileIds?: string[] };
  },
  handlers: AssistHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api/channels/${channelId}/assist`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return; // stopped before connect
    handlers.onError("Couldn't reach the assistant");
    return;
  }

  if (!res.ok || !res.body) {
    handlers.onError(`Assistant unavailable (${res.status})`);
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
        dispatch(parseBlock(block), handlers);
      }
    }
    dispatch(parseBlock(buffer), handlers);
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return; // user stopped
    handlers.onError("The assistant stream was interrupted");
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): StreamEvent | null {
  const raw = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("");
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as StreamEvent;
    return obj && typeof obj.type === "string" ? obj : null;
  } catch {
    return null;
  }
}

function dispatch(evt: StreamEvent | null, handlers: AssistHandlers): void {
  if (!evt) return;
  if (evt.type === "delta") handlers.onDelta(evt.text);
  else if (evt.type === "done") handlers.onDone(evt);
  else if (evt.type === "error") handlers.onError(evt.message);
}
