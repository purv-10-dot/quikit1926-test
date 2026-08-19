/**
 * Deterministic, fully-hermetic runtime stub (active default until the real
 * runtime's `/ai/chat/assist` ships). Streams a few `delta`s derived from the
 * prompt + pushed context, then a `done` carrying a generated `agentRunId`.
 * Configurable error/slow modes for tests via env.
 */
import { randomUUID } from "node:crypto";
import type {
  AssistApprovalDecision,
  AssistApprovalListPage,
  AssistApprovalRow,
  AssistApprovalStatus,
  IngestResult,
} from "@/lib/shared";
import { ApprovalDecisionError } from "./types";
import type {
  AssistInput,
  DecideApprovalInput,
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
  /**
   * Decisions already taken in THIS process, so a second tap on the same row
   * gets a real 409 rather than a second success.
   *
   * Deliberately stateful, in a file whose whole point is determinism — because
   * "approval is not idempotent" is a rule with no local expression otherwise.
   * A stateless stub would answer every double-tap with a cheerful `executed`,
   * the card's latch would look unnecessary to the next person reading it, and
   * the first real 409 would arrive in UAT. Instance-scoped, and
   * `getRuntimeClient` caches one instance, so it lasts a dev server's lifetime
   * and resets on restart; a fresh `new StubRuntimeClient()` (every test) starts
   * clean.
   */
  private readonly decided = new Map<string, AssistApprovalStatus>();

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
   * Six rows, covering every state that renders differently: `pending`,
   * `expired`, `rejected`, `executed`, `cancelled`, plus a SECOND pending row
   * whose approval answers `status: "failed"` at HTTP 200
   * (`STUB_FAILING_REQUEST_ID`) — the one response most easily mistaken for a
   * network error, and previously unreachable without the live runtime. A
   * pending-only fixture set would hide exactly what the terminal-rows change
   * exists to expose: a write that expired unactioned must be visible as
   * expired, not absent.
   *
   * `outcomeSummary` is on every terminal row EXCEPT `stub-req-cancelled`, which
   * omits it so the pre-field fallback is reachable by hand. See that row.
   *
   * Deterministic: fixed ids, fixed timestamps, no randomness, so assertions
   * against it are stable. `limit`/`offset` are honoured so pagination is
   * exercisable without the live runtime, and `total` stays the UNPAGED count.
   */
  async listApprovalRequests(input: ListApprovalsInput): Promise<AssistApprovalListPage> {
    const all = stubApprovalRows(input.orgId, input.userId).map((r) => {
      // A row decided earlier in this process reports its NEW state, so the
      // Activity list agrees with the card the user just acted on. Without this
      // the local list would keep showing an approved row as pending and the
      // "terminal rows render as terminal" path would be unreachable by hand.
      const decided = this.decided.get(r.id);
      return decided ? { ...r, status: decided, decisionBy: input.userId } : r;
    });
    const offset = Math.max(0, input.offset ?? 0);
    const limit = input.limit != null ? Math.max(0, input.limit) : all.length;
    return { requests: all.slice(offset, offset + limit), total: all.length };
  }

  async approveRequest(input: DecideApprovalInput): Promise<AssistApprovalDecision> {
    const row = this.claim(input);
    // The one fixture that answers `failed` — see STUB_FAILING_REQUEST_ID.
    if (row.id === STUB_FAILING_REQUEST_ID) {
      this.decided.set(row.id, "failed");
      return {
        requestId: row.id,
        status: "failed",
        errorCode: "APP_API_ERROR",
        error: "QuikTrack rejected the write: field 'dueDate' is in the past.",
        // Present on a FAILED decision too, and it does not carry the reason —
        // which is the point. It says what happened; `error` says why. A card
        // that dropped `error` once this arrived would lose the only actionable
        // text, so the stub makes that mistake visible locally.
        outcomeSummary: "Could not update QTRK-208.",
      };
    }
    this.decided.set(row.id, "executed");
    return {
      requestId: row.id,
      // Target app's own naming, same rule as toolInput — never camelCased by us.
      result: { issueId: "QTRK-903", url: "https://quiktrack.test/issues/QTRK-903" },
      status: "executed",
      // Served on the DECISION RESPONSE as well as the row, so the live card
      // shows the real outcome with no refetch.
      outcomeSummary: "Created QTRK-903 in QuikTrack.",
    };
  }

  async rejectRequest(input: DecideApprovalInput): Promise<AssistApprovalDecision> {
    const row = this.claim(input);
    this.decided.set(row.id, "rejected");
    return {
      requestId: row.id,
      status: "rejected",
      outcomeSummary: "Declined — nothing was changed in QuikTrack.",
    };
  }

  /**
   * Resolve a request id to a still-pending fixture row, or throw the same coded
   * error the real runtime would. Shared by approve and reject so the two cannot
   * drift on which ids they accept.
   */
  private claim(input: DecideApprovalInput): AssistApprovalRow {
    const row = stubApprovalRows(input.orgId, input.userId).find((r) => r.id === input.requestId);
    // Unknown id and another org's row are ONE code on purpose: "that exists but
    // isn't yours" is itself a leak. The real runtime scopes on the token and
    // answers 404 for both.
    if (!row) throw new ApprovalDecisionError("not_found", 404);
    if (this.decided.has(row.id) || row.status !== "pending") {
      throw new ApprovalDecisionError("already_handled", 409);
    }
    return row;
  }
}

/** Fixed instants so fixtures never shift under a test. */
const STUB_NOW = "2026-08-14T09:00:00.000Z";

/**
 * The pending row whose approval answers `status: "failed"` on HTTP 200.
 *
 * Exists because that is the single most misreadable response on this surface —
 * the approval succeeded and the target app refused the write — and a stub where
 * every approve returns `executed` makes "renders the outcome, not a network
 * error" untestable by hand. A developer needs to be able to reach the failed
 * card locally.
 */
export const STUB_FAILING_REQUEST_ID = "stub-req-pending-failing";

/**
 * The fixture rows. `toolInput` interiors deliberately use the TARGET app's
 * naming (`projectId`, `assigneeId`, and a snake_case `custom_field_7`) — not
 * camelCased by us — so a consumer that wrongly normalises them fails against the
 * stub rather than only against UAT.
 *
 * The snake_case key is load-bearing and was missing until 18 Aug: every fixture
 * interior happened to be camelCase already, so a normalising consumer passed
 * every local run and would have broken on first contact with a real QuikTrack
 * payload. That is exactly the failure these fixtures exist to prevent, so the
 * key is now present on the row a card is most likely to be built against.
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
      toolInput: {
        projectId: "QTRK",
        title: "Login fails on Safari",
        assigneeId: "u-priya",
        // snake_case ON PURPOSE. A consumer that normalises interiors must break
        // here, locally, and not first against a real QuikTrack payload in UAT.
        custom_field_7: { nested: ["a", 1, null] },
      },
      riskClass: "soft_write",
      status: "pending",
      expiresAt: "2026-08-14T09:15:00.000Z",
      createdAt: STUB_NOW,
      traceId: "stub-trace-pending",
    },
    {
      ...base,
      id: STUB_FAILING_REQUEST_ID,
      toolName: "update_issue",
      toolInput: { issueId: "QTRK-208", dueDate: "2020-01-01" },
      riskClass: "medium_write",
      status: "pending",
      expiresAt: "2026-08-14T09:20:00.000Z",
      createdAt: STUB_NOW,
      traceId: "stub-trace-pending-failing",
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
      // The runtime's sweep generates one for expiry too — it is a terminal
      // state with a describable outcome, not only decisions have them.
      outcomeSummary: "Expired after 15 minutes; QTRK-141 was not changed.",
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
      // Decided BY the viewer, so the card can say "you declined this" rather
      // than the passive "Rejected". `decisionBy: userId` above is what makes
      // that path reachable locally.
      outcomeSummary: "Declined — QTRK-77 was not deleted.",
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
      outcomeSummary: "Created QTRK-902 in QuikTrack.",
    },
    {
      ...base,
      id: "stub-req-cancelled",
      toolName: "update_issue",
      toolInput: { issueId: "QTRK-310", status: "DONE" },
      riskClass: "medium_write",
      /**
       * The tenant disabled the assistant module while this sat parked, so
       * nobody answered it and nobody now can. `decisionBy: null` on purpose —
       * this is the case with no human actor at all, which is what separates it
       * from `rejected` and what the card's passive wording exists for.
       */
      status: "cancelled",
      decisionBy: null,
      decisionAt: "2026-08-13T18:30:00.000Z",
      expiresAt: null,
      createdAt: "2026-08-13T18:00:00.000Z",
      traceId: "stub-trace-cancelled",
      /**
       * DELIBERATELY NO `outcomeSummary` — the one terminal fixture without it.
       *
       * Rows written before the runtime shipped the field are the common case in
       * a 24h ledger spanning the deploy, and a card that renders blank for them
       * fails on real historical data. Same instinct as the snake_case key: the
       * fallback path has to be reachable by hand, not only in a unit test, or
       * "it renders" stays true locally right up until someone opens Activity in
       * UAT.
       */
    },
  ];
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
