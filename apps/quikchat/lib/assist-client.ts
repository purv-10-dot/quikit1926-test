/**
 * Client SSE reader for the in-chat assistant. POSTs the prompt to the relay
 * route and parses the `text/event-stream` response into delta/done/error
 * callbacks. Pass an AbortSignal to support client-side "stop" (closes the
 * stream; the runtime has no server-side cancellation yet — J1).
 */

import type { AssistApprovalRequest, AssistRiskClass, AssistSource } from "@/lib/shared";

// Re-exported so a later session can build the approval card against these
// without redeclaring the shape — the drift this session removed on the server
// side is just as easy to reintroduce on the client.
export type { AssistApprovalRequest, AssistRiskClass, AssistSource };

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
  /**
   * The assistant proposed a write that needs human approval. TERMINAL — treated
   * exactly like `done`/`error`, so anything after it is swallowed.
   *
   * OPTIONAL so existing callers compile unchanged. When it is absent the frame
   * does NOT silently settle: see `onApprovalNeeded` in the guard below for why
   * that would be worse than the bug this replaced.
   */
  onApprovalNeeded?: (request: AssistApprovalRequest) => void;
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
  | { type: "error"; message: string; code?: string }
  // Wire data, so every field is `unknown` until `parseApprovalRequest` vets it.
  // Typing it as `AssistApprovalRequest` here would be a lie about a JSON.parse
  // result and would make the malformed path need a cast.
  | {
      type: "approval_needed";
      requestId?: unknown;
      appId?: unknown;
      toolName?: unknown;
      riskClass?: unknown;
      summary?: unknown;
      toolInput?: unknown;
      expiresAt?: unknown;
    };

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
  // Exactly-one-terminal-callback contract. `done` and `error` are terminal, and
  // so is a body that closes having emitted NEITHER (proxy drop, runtime
  // generator ending mid-turn, route `finish()` on a loop that never saw a
  // terminal event). Without the close case the caller gets no callback at all
  // and its loader has no off-switch — stuck on "Thinking…" forever. Post-
  // terminal deltas are swallowed for the same reason: they'd repopulate a
  // bubble the caller has already torn down.
  let settled = false;
  const guarded: GuardedHandlers = {
    onDelta: (t) => {
      if (!settled) handlers.onDelta(t);
    },
    onDone: (p) => {
      if (settled) return;
      settled = true;
      handlers.onDone(p);
    },
    onError: (m) => {
      if (settled) return;
      settled = true;
      handlers.onError(m);
    },
    /**
     * Terminal, and deliberately never silent.
     *
     * Two failure modes are being avoided here, and the obvious implementation
     * hits both:
     *
     *  1. MALFORMED FRAME → `onError`, not a drop. Swallowing it would leave
     *     `settled` false, the stream would close, and the caller would get
     *     "The assistant stream ended unexpectedly" — the exact bug this handler
     *     exists to remove. A dropped terminal frame IS the bug.
     *
     *  2. NO HANDLER SUPPLIED → `onError`, not a silent settle. Setting
     *     `settled = true` and calling nothing would correctly suppress the
     *     "unexpectedly" error and then hang the caller's loader on "Thinking…"
     *     forever, because the exactly-one-terminal-callback contract exists to
     *     give that loader an off-switch. A wrong error traded for a hung
     *     spinner is worse and harder to diagnose.
     *
     * The absent-handler wording matters: by the time this fires the runtime has
     * already parked the write and created the request row. The action genuinely
     * IS pending somewhere the user cannot see it, so the message must not imply
     * nothing happened.
     */
    onApprovalNeeded: (raw) => {
      if (settled) return;
      const request = parseApprovalRequest(raw);
      settled = true;
      if (!request) {
        handlers.onError("The assistant proposed an action, but the approval request was malformed");
        return;
      }
      if (handlers.onApprovalNeeded) {
        handlers.onApprovalNeeded(request);
        return;
      }
      handlers.onError(
        "The assistant proposed an action that needs approval, but this view can't show it yet",
      );
    },
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        dispatch(parseBlock(block), guarded);
      }
    }
    dispatch(parseBlock(buffer), guarded);
    // Stream closed cleanly but nothing terminal ever arrived.
    guarded.onError("The assistant stream ended unexpectedly");
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return; // user stopped
    guarded.onError("The assistant stream was interrupted");
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

function dispatch(evt: StreamEvent | null, handlers: GuardedHandlers): void {
  if (!evt) return;
  if (evt.type === "delta") handlers.onDelta(evt.text);
  else if (evt.type === "done") handlers.onDone(evt);
  else if (evt.type === "error") handlers.onError(evt.message);
  else if (evt.type === "approval_needed") handlers.onApprovalNeeded(evt);
}

/**
 * Internal shape of the guarded wrappers. `onApprovalNeeded` is REQUIRED here
 * even though it is optional on the public `AssistHandlers`: the guard always
 * exists and decides what to do when the caller's is missing.
 */
interface GuardedHandlers {
  onDelta: (text: string) => void;
  onDone: (payload: AssistDonePayload) => void;
  onError: (message: string) => void;
  onApprovalNeeded: (raw: unknown) => void;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Vet a wire frame into an `AssistApprovalRequest`, or null if unusable.
 *
 * MINIMAL GATE: only `requestId` is hard-required, because it is the identity —
 * without it nothing downstream can approve, reject or even reference the
 * request. Everything else degrades to an empty string rather than rejecting the
 * frame: an over-strict validator would turn a real, already-parked write into
 * "malformed" because the runtime renamed a cosmetic field.
 *
 * `riskClass` is NOT validated against the union — see the note on
 * `AssistRiskClass`. An unrecognised value passes through and the card must
 * treat unknown as highest risk.
 *
 * `summary` and `toolInput` pass through untouched: no interpretation, no
 * truncation, no reformatting.
 */
function parseApprovalRequest(raw: unknown): AssistApprovalRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const requestId = str(o.requestId);
  if (!requestId) return null;
  const toolInput =
    o.toolInput && typeof o.toolInput === "object" && !Array.isArray(o.toolInput)
      ? (o.toolInput as Record<string, unknown>)
      : {};
  return {
    requestId,
    appId: str(o.appId),
    toolName: str(o.toolName),
    riskClass: o.riskClass as AssistRiskClass,
    summary: str(o.summary),
    toolInput,
    expiresAt: str(o.expiresAt),
  };
}
