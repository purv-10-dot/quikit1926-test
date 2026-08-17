/**
 * RuntimeClient seam — the ONE place QuikChat calls into the QuikverseAI runtime
 * for the in-chat assistant. A stub default (active now) and a code-complete
 * HTTP impl chosen by env; nothing else in the app knows which is live. Mirrors
 * the storage-driver seam from S11.
 *
 * Contract (Phase 3 v1, text-only, push-context, ungated replies). The runtime
 * build must match these shapes — see docs/RUNTIME.md.
 */

import type {
  AssistApprovalListPage,
  AssistApprovalRequest,
  AssistSource,
  IngestResult,
  IngestVisibility,
} from "@/lib/shared";

export type { AssistApprovalListPage, AssistApprovalRequest, AssistSource };

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
  /**
   * Owning app for runtime toolset scoping — always "quikchat", sent on EVERY
   * assist turn (not just KB turns), per the runtime contract. Fixes the misfire
   * where a general question could reach another app's tools.
   */
  appId: string;
  /**
   * KB retrieval scope (Stage 3 retrieval). Absent or `enabled:false` ⇒ a plain
   * turn (no retrieval, back-compat). `sourceFileIds` present ⇒ retrieval scoped
   * to those docs; omitted (`{ enabled: true }`) ⇒ the user's whole KB. Doc
   * visibility is enforced SERVER-SIDE by the runtime (PRIVATE = uploader-only).
   * Independent of the Stage-2 `document` field.
   */
  knowledgeBase?: { enabled: boolean; sourceFileIds?: string[] };
  locale: string;
  /** Stable bot agent id (QuikChat-owned identity). */
  botAgentId: string;
  /** Correlation id propagated to the runtime for telemetry (L1). */
  traceId: string;
}

export type RuntimeEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; agentRunId: string; sources?: AssistSource[] }
  | { type: "error"; message: string; code?: string }
  /**
   * A proposed write the runtime will not perform without human approval.
   * TERMINAL, like `done` and `error` — one per stream, then it closes.
   *
   * Was a payload-less placeholder ("defined in the vocab, NOT handled in v1")
   * while the client typed the same frame richly — two descriptions of one thing.
   * Now both sides import `AssistApprovalRequest` from `@/lib/shared`.
   *
   * The relay forwards this verbatim (`route.ts` only special-cases `done`), so
   * it needs no handling here; the client reader is what turns it into a
   * callback.
   */
  | ({ type: "approval_needed" } & AssistApprovalRequest);

/** Ingest one document into the KB (Stage 3). orgId/userId ride the agent JWT. */
export interface IngestInput {
  orgId: string;
  userId: string;
  /** Stable bot agent id (QuikChat-owned identity) — becomes the JWT `sub`. */
  botAgentId: string;
  /** Durable object key (= MediaMeta.objectPath); the runtime reads the bucket. */
  storageKey: string;
  /** Idempotency/replace key. Confirmed identity: === storageKey. */
  sourceFileId: string;
  /** Owning app — "quikchat". (entityId reserved for Stage 4; not sent.) */
  appId: string;
  visibility: IngestVisibility;
  filename?: string;
}

export type IngestErrorCode = "object_not_found" | "extract_failed" | "bad_jwt" | "ingest_failed";

/** Thrown by the runtime client on a failed ingest; carries a mappable code. */
export class IngestError extends Error {
  constructor(
    public readonly code: IngestErrorCode,
    public readonly runtimeStatus?: number,
  ) {
    super(code);
    this.name = "IngestError";
  }
}

/**
 * Read the caller's approval ledger. `orgId`/`userId` ride the minted token and
 * are NEVER sent as query params — the runtime scopes the result on the token,
 * which is what makes requester-only isolation hold.
 */
export interface ListApprovalsInput {
  /** From the caller's auth context. Goes into the JWT, not the query string. */
  orgId: string;
  userId: string;
  /** Stable bot agent id — becomes the JWT `sub`, same as assist/ingest. */
  botAgentId: string;
  limit?: number;
  offset?: number;
  /** Correlates this read with the runtime's own logs. Always sent. */
  traceId?: string;
}

export type ListApprovalsErrorCode = "timeout" | "bad_jwt" | "unavailable";

/**
 * A FAILED list read — never an empty one.
 *
 * The distinction is the whole point: `{ requests: [], total: 0 }` means "you
 * have no approvals", and a timeout means "we don't know". Rendering them the
 * same way is how a silently-broken surface reads as a clean inbox. Callers must
 * turn this into a retryable error state, never an empty list.
 */
export class ListApprovalsError extends Error {
  constructor(
    public readonly code: ListApprovalsErrorCode,
    public readonly runtimeStatus?: number,
  ) {
    super(code);
    this.name = "ListApprovalsError";
  }
}

export interface RuntimeClient {
  /** SSE-shaped stream of runtime events for one assistant turn. */
  assist(input: AssistInput): AsyncIterable<RuntimeEvent>;
  /** Ingest a document into the KB (Stage 3). Sync — resolves once indexed. */
  ingest(input: IngestInput): Promise<IngestResult>;
  /**
   * The caller's approval ledger — pending PLUS terminal rows from the last 24h.
   * Throws `ListApprovalsError`; never resolves to an empty page on failure.
   */
  listApprovalRequests(input: ListApprovalsInput): Promise<AssistApprovalListPage>;
}

export type RuntimeMode = "stub" | "http";
