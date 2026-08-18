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
  AssistApprovalDecision,
  AssistApprovalListPage,
  AssistApprovalRequest,
  AssistSource,
  IngestResult,
  IngestVisibility,
} from "@/lib/shared";

export type {
  AssistApprovalDecision,
  AssistApprovalListPage,
  AssistApprovalRequest,
  AssistSource,
};

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

/**
 * Act on one parked request. Same identity rule as the list: `orgId`/`userId`
 * ride the MINTED TOKEN and are never sent in the path, query or body. The
 * runtime authorises the decision against the token, which is what makes
 * requester-only isolation hold — a body field would let a caller approve
 * someone else's write.
 *
 * `requestId` is the ONLY thing that comes from the client, and it is safe to:
 * a request belonging to another org resolves to 404 on the runtime side
 * precisely because the token scopes the lookup.
 */
export interface DecideApprovalInput {
  /** From the caller's auth context. Goes into the JWT, not the path. */
  orgId: string;
  userId: string;
  /** Stable bot agent id — becomes the JWT `sub`, same as assist/ingest/list. */
  botAgentId: string;
  /** The runtime-owned request id, from the SSE frame or a ledger row. */
  requestId: string;
  /** Correlates this decision with the runtime's own logs. Always sent. */
  traceId?: string;
}

/**
 * Why a decision could not be RECORDED. Distinct from a decision that was
 * recorded and whose write then failed — that is `AssistApprovalDecision` with
 * `status: "failed"` on HTTP 200, and it is not an error at all here.
 *
 * Each code means something materially different to the person who just tapped
 * a button, which is why they are not collapsed into one "couldn't approve":
 *
 *  - `already_handled` (409) — the request is no longer pending. Approval is
 *    deliberately NOT idempotent, so this is also exactly where a double-tap
 *    lands. The right response is "already handled", plus a refetch; never a
 *    retry, which would either 409 again or, worse, double-write if the runtime
 *    ever relaxed the rule.
 *  - `forbidden` (403) — permission was revoked between proposal and approval.
 *    The user could have done this a minute ago and cannot now.
 *  - `tool_gone` (410) — the tool was deregistered. Nothing the user can do, and
 *    distinct from "no permission", which sounds like it could be granted.
 *  - `not_found` (404) — unknown id, or another org's. Deliberately one code:
 *    telling a caller "that exists but isn't yours" is itself a leak.
 *  - `bad_jwt` (401) — our token, not their problem. Never shown as a user error.
 *  - `unavailable` (5xx / network) — theirs, retryable.
 *  - `timeout` — WE DO NOT KNOW whether the decision landed. See the note on
 *    the relay's message for why this must never say "try again".
 */
export type ApprovalDecisionErrorCode =
  | "already_handled"
  | "forbidden"
  | "tool_gone"
  | "not_found"
  | "bad_jwt"
  | "unavailable"
  | "timeout";

/** Thrown when a decision could not be recorded. Carries a mappable code. */
export class ApprovalDecisionError extends Error {
  constructor(
    public readonly code: ApprovalDecisionErrorCode,
    public readonly runtimeStatus?: number,
  ) {
    super(code);
    this.name = "ApprovalDecisionError";
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
  /**
   * Approve a parked write and let the runtime perform it. Resolves with the
   * OUTCOME — including `status: "failed"`, which is a successful approval of a
   * write the target app refused. Throws `ApprovalDecisionError` only when the
   * decision could not be recorded at all.
   */
  approveRequest(input: DecideApprovalInput): Promise<AssistApprovalDecision>;
  /** Reject a parked write. Same throw/resolve split as `approveRequest`. */
  rejectRequest(input: DecideApprovalInput): Promise<AssistApprovalDecision>;
}

export type RuntimeMode = "stub" | "http";
