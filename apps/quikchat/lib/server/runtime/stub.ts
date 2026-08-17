/**
 * Deterministic, fully-hermetic runtime stub (active default until the real
 * runtime's `/ai/chat/assist` ships). Streams a few `delta`s derived from the
 * prompt + pushed context, then a `done` carrying a generated `agentRunId`.
 * Configurable error/slow modes for tests via env.
 */
import { randomUUID } from "node:crypto";
import type { AssistApprovalListPage, AssistApprovalRow, IngestResult } from "@/lib/shared";
import type {
  AssistInput,
  IngestInput,
  ListApprovalsInput,
  RuntimeClient,
  RuntimeEvent,
} from "./types";

export interface StubOptions {
  /** Emit an `error` event instead of a normal stream. */
  errorMode?: boolean;
  /** Per-delta delay (ms) to simulate streaming/cold-start. Default 0. */
  delayMs?: number;
}

export class StubRuntimeClient implements RuntimeClient {
  constructor(private readonly opts: StubOptions = {}) {}

  async *assist(input: AssistInput): AsyncIterable<RuntimeEvent> {
    if (this.opts.errorMode) {
      yield { type: "error", message: "stub runtime error", code: "stub_error" };
      return;
    }

    const count = input.history.length;
    const trimmedPrompt = input.prompt.trim().slice(0, 120);
    const chunks = [
      `Here's what I found across the last ${count} message${count === 1 ? "" : "s"}. `,
      trimmedPrompt ? `You asked: “${trimmedPrompt}”. ` : "",
      "This is a stubbed assistant reply — the live runtime isn't wired yet.",
    ].filter(Boolean);

    for (const text of chunks) {
      if (this.opts.delayMs) await delay(this.opts.delayMs);
      yield { type: "delta", text };
    }

    const finalText = chunks.join("");
    // KB scenario: when retrieval is enabled, emit a deterministic `sources`
    // array on `done` so the relay/client citation paths are unit-testable
    // without the live runtime. A scoped turn (sourceFileIds present) cites
    // those ids; a whole-KB widen (`{ enabled: true }` alone) cites a synthetic
    // id. A plain turn (no knowledgeBase) omits `sources` entirely — the exact
    // back-compat shape the existing non-KB parser expects.
    if (input.knowledgeBase?.enabled) {
      const ids = input.knowledgeBase.sourceFileIds?.length
        ? input.knowledgeBase.sourceFileIds
        : ["stub-kb-source"];
      const sources = ids.slice(0, 2).map((sourceFileId, chunkIndex) => ({
        sourceFileId,
        chunkIndex,
        snippet: `Relevant excerpt from ${sourceFileId} (chunk ${chunkIndex}).`,
      }));
      yield { type: "done", text: finalText, agentRunId: `stub-${randomUUID()}`, sources };
      return;
    }
    yield { type: "done", text: finalText, agentRunId: `stub-${randomUUID()}` };
  }

  /** Deterministic, hermetic ingest stub (no bucket/network). */
  async ingest(input: IngestInput): Promise<IngestResult> {
    return { sourceFileId: input.sourceFileId, chunksStored: 3, contentHash: "stub-content-hash" };
  }

  /**
   * FIXTURES, not an empty page — and the choice is load-bearing.
   *
   * The seeded approval rows live in the runtime's UAT database. With
   * `RUNTIME_MODE` unset locally this stub is the ONLY source there is, so
   * returning `{ requests: [], total: 0 }` would mean every local developer, and
   * the card session that follows this one, builds against a permanently empty
   * list. "Renders nothing" would then look correct right up until UAT. This
   * project has shipped that failure more than once.
   *
   * Four rows, one per state that renders differently — `pending`, `expired`,
   * `rejected`, `executed`. A pending-only fixture set would hide exactly what
   * the terminal-rows change exists to expose: a write that expired unactioned
   * must be visible as expired, not absent.
   *
   * Deterministic: fixed ids, fixed timestamps, no randomness, so assertions
   * against it are stable. `limit`/`offset` are honoured so pagination is
   * exercisable without the live runtime, and `total` stays the UNPAGED count.
   */
  async listApprovalRequests(input: ListApprovalsInput): Promise<AssistApprovalListPage> {
    const all = stubApprovalRows(input.orgId, input.userId);
    const offset = Math.max(0, input.offset ?? 0);
    const limit = input.limit != null ? Math.max(0, input.limit) : all.length;
    return { requests: all.slice(offset, offset + limit), total: all.length };
  }
}

/** Fixed instants so fixtures never shift under a test. */
const STUB_NOW = "2026-08-14T09:00:00.000Z";

/**
 * The four fixture rows. `toolInput` interiors deliberately use the TARGET app's
 * naming (`projectId`, `assigneeId`) — not camelCased by us — so a consumer that
 * wrongly normalises them fails against the stub rather than only against UAT.
 */
function stubApprovalRows(orgId: string, userId: string): AssistApprovalRow[] {
  const base = {
    orgId,
    userId,
    appId: "quiktrack",
    useCase: "issue_management",
    // Dead field, carried so the payload round-trips honestly. Never surfaced.
    mode: "copilot",
    proposedOutput: null,
    decisionBy: null,
    decisionAt: null,
    executedAt: null,
    error: null,
  };
  return [
    {
      ...base,
      id: "stub-req-pending",
      toolName: "create_issue",
      toolInput: { projectId: "QTRK", title: "Login fails on Safari", assigneeId: "u-priya" },
      riskClass: "soft_write",
      status: "pending",
      expiresAt: "2026-08-14T09:15:00.000Z",
      createdAt: STUB_NOW,
      traceId: "stub-trace-pending",
    },
    {
      ...base,
      id: "stub-req-expired",
      toolName: "update_issue",
      toolInput: { issueId: "QTRK-141", priority: "HIGH" },
      riskClass: "medium_write",
      status: "expired",
      // Already past — this is the row that proves an unactioned write stays
      // visible instead of vanishing.
      expiresAt: "2026-08-13T10:00:00.000Z",
      createdAt: "2026-08-13T09:45:00.000Z",
      traceId: "stub-trace-expired",
    },
    {
      ...base,
      id: "stub-req-rejected",
      toolName: "delete_issue",
      toolInput: { issueId: "QTRK-77" },
      riskClass: "high_risk",
      status: "rejected",
      decisionBy: userId,
      decisionAt: "2026-08-13T14:02:00.000Z",
      expiresAt: null,
      createdAt: "2026-08-13T14:00:00.000Z",
      traceId: "stub-trace-rejected",
    },
    {
      ...base,
      id: "stub-req-executed",
      toolName: "create_issue",
      toolInput: { projectId: "QTRK", title: "Add rate limit to /assist" },
      riskClass: "soft_write",
      status: "executed",
      decisionBy: userId,
      decisionAt: "2026-08-13T16:10:00.000Z",
      executedAt: "2026-08-13T16:10:04.000Z",
      expiresAt: null,
      createdAt: "2026-08-13T16:08:00.000Z",
      traceId: "stub-trace-executed",
      result: { issueId: "QTRK-902", url: "https://quiktrack.test/issues/QTRK-902" },
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
