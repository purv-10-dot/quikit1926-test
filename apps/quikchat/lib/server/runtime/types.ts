/**
 * RuntimeClient seam — the ONE place QuikChat calls into the QuikverseAI runtime
 * for the in-chat assistant. A stub default (active now) and a code-complete
 * HTTP impl chosen by env; nothing else in the app knows which is live. Mirrors
 * the storage-driver seam from S11.
 *
 * Contract (Phase 3 v1, text-only, push-context, ungated replies). The runtime
 * build must match these shapes — see docs/RUNTIME.md.
 */

export interface AssistHistoryItem {
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}

export interface AssistInput {
  /** From the caller's auth context — NEVER sent in the runtime request body. */
  orgId: string;
  userId: string;
  channelId: string;
  threadRootId?: string;
  prompt: string;
  /** Pushed context: the last ~20–30 messages, oldest→newest. */
  history: AssistHistoryItem[];
  /**
   * Optional attached document for the doc-analysis path (Stage 2). Absent = a
   * plain chat turn. URL-based: the runtime fetches `url` (a presigned GET URL
   * minted server-side); it does not read the bucket. Per-turn only — the
   * runtime never persists it to history.
   */
  document?: {
    url: string;
    filename: string;
  };
  locale: string;
  /** Stable bot agent id (QuikChat-owned identity). */
  botAgentId: string;
  /** Correlation id propagated to the runtime for telemetry (L1). */
  traceId: string;
}

export type RuntimeEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; agentRunId: string }
  | { type: "error"; message: string; code?: string }
  // Reserved for the later actions phase — defined in the vocab, NOT handled in v1.
  | { type: "approval_needed" };

export interface RuntimeClient {
  /** SSE-shaped stream of runtime events for one assistant turn. */
  assist(input: AssistInput): AsyncIterable<RuntimeEvent>;
}

export type RuntimeMode = "stub" | "http";
