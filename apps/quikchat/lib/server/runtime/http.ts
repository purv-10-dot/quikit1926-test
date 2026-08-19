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
import { errorFields, logger } from "@/lib/shared/logger";
import type { IngestResult } from "@/lib/shared";
import { ApprovalDecisionError, IngestError, ListApprovalsError } from "./types";
import type {
  ApprovalDecisionErrorCode,
  AssistInput,
  DecideApprovalInput,
  IngestInput,
  ListApprovalsInput,
  RuntimeClient,
  RuntimeEvent,
} from "./types";
import type { AssistApprovalDecision, AssistApprovalListPage } from "@/lib/shared";

// Time-to-first-response guard: covers connection + response headers (Render
// free-tier cold starts can add 30–50s). Retired the moment the stream is open.
const CONNECT_TIMEOUT_MS = 60_000;
// Per-chunk idle guard for the SSE read loop: reset on every read, so a
// long-but-progressing generation streams freely and only a genuinely silent
// (hung / no-first-byte) runtime aborts.
const IDLE_TIMEOUT_MS = 60_000;
// Ingest is a single request/response — the runtime does extract+embed
// server-side BEFORE replying, so the whole cost is time-to-response and there's
// no stream to idle-monitor. A large doc can legitimately exceed 60s, so give it
// a generous single-shot budget rather than an idle window.
const INGEST_TIMEOUT_MS = 180_000;
/**
 * Listing approvals is a plain indexed read — no LLM call, no extract, no
 * embed — so it gets a TIGHT budget rather than reusing either of the above.
 * `assist`'s 60s guards a cold start before a stream opens and `ingest`'s 180s
 * covers server-side document processing; neither is a sane ceiling for a
 * SELECT behind a paginated endpoint.
 *
 * CONSEQUENCE IF IT FIRES: `ListApprovalsError("timeout")`, which the relay must
 * turn into a retryable error — NEVER an empty page. An empty list and a
 * timed-out list look identical on screen and mean opposite things.
 */
const LIST_APPROVALS_TIMEOUT_MS = 15_000;
/**
 * A decision is a write on the runtime's side AND, on approve, a call out to the
 * target app — so it gets more room than the list's 15s SELECT, and far less
 * than ingest's 180s (no extract, no embed). 30s is the target app's API call
 * plus overhead.
 *
 * CONSEQUENCE IF IT FIRES, and it is the sharpest one on this surface:
 * `ApprovalDecisionError("timeout")` means WE DO NOT KNOW whether the decision
 * landed. The runtime may have recorded it and executed the write while our
 * socket was already gone. Because approval is deliberately not idempotent, the
 * caller must NOT be told to try again — see `mapApprovalDecisionError`.
 */
const DECIDE_APPROVAL_TIMEOUT_MS = 30_000;

/**
 * ⏳ TEMPORARY DIAGNOSTIC — added 19 Aug 2026, remove when the diagnosis closes.
 *
 * WHY IT EXISTS: the runtime team is diagnosing why QuikChat's assist turns come
 * back with no tool catalog while their hand-built token works. Their logs show
 * `app_manifest.fetched` → `app_tools.registered` → `tool.selection` for their
 * call and NONE of the three for ours, and they asked to see our decoded token
 * payload rather than trust our reading of the source.
 *
 * REMOVAL: grep `RUNTIME_TOKEN_DEBUG` — this function, its one call site in
 * `assist()`, and the tests naming it are the whole footprint. Delete together.
 * Nothing else reads the flag.
 *
 * ⚠️ NEVER LOGS THE TOKEN OR ITS SIGNATURE. This reads `parts[1]` and nothing
 * else: the signature is never bound to a variable, so there is no path by which
 * it can reach a log line — a structural guarantee rather than a careful author.
 * Ours is HS256 with a shared secret, so a token in a log file is a credential in
 * a log file, and log files outlive the incidents that create them.
 *
 * Note the field is `tokenPayload`, not `token`: pino's `redact.paths` censors a
 * key named `token`, so the obvious name would have silently blanked the one
 * thing this exists to show.
 */
export function logRuntimeTokenPayload(token: string, botAgentId: string): void {
  // Read at CALL TIME, never hoisted to a module const — so the flag can be
  // flipped in UAT and take effect on the next request instead of needing a
  // fresh build.
  if (!process.env.RUNTIME_TOKEN_DEBUG) return;
  try {
    const payloadSegment = token.split(".")[1];
    if (!payloadSegment) {
      logger.warn({ botAgentId }, "runtime token debug: token has no payload segment");
      return;
    }
    const decoded: unknown = JSON.parse(
      Buffer.from(payloadSegment, "base64url").toString("utf8"),
    );
    logger.info(
      {
        botAgentId,
        tokenPayload: decoded,
        // The key set is the actual question — "what arrives" is answered by
        // which claims exist at all, not only by their values.
        tokenClaimKeys:
          decoded && typeof decoded === "object" ? Object.keys(decoded as object) : [],
      },
      "runtime token debug: decoded agent JWT payload (TEMPORARY — see RUNTIME_TOKEN_DEBUG)",
    );
  } catch (e) {
    // A malformed token must never take down an assist turn on account of a
    // diagnostic. `errorFields` so nothing rides in on the thrown value.
    logger.warn({ ...errorFields(e), botAgentId }, "runtime token debug: could not decode payload");
  }
}

export class HttpRuntimeClient implements RuntimeClient {
  constructor(private readonly baseUrl: string) {}

  async *assist(input: AssistInput): AsyncIterable<RuntimeEvent> {
    const token = await mintRuntimeToken({
      orgId: input.orgId,
      botAgentId: input.botAgentId,
      userId: input.userId,
    });

    /**
     * ⏳ TEMPORARY — see `logRuntimeTokenPayload`. Deliberately HERE, at the
     * point of use, and not inside `mintRuntimeToken`: this records the token as
     * SENT rather than as constructed, so it cannot disagree with what actually
     * goes on the wire. No-op unless `RUNTIME_TOKEN_DEBUG` is set.
     *
     * `assist` only. The reported symptom is assist-specific, and `ingest` /
     * `listApprovalRequests` / `decide` mint the identical claim set from the
     * same function — three more call sites on token-authenticated hot paths
     * would add blast radius and no information. One line each if it widens.
     */
    logRuntimeTokenPayload(token, input.botAgentId);

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
    // Guards connection + headers only. Cleared once the stream is open (below)
    // so a long-but-live generation isn't killed by a total-time cap.
    const connectTimer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

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
      clearTimeout(connectTimer);
      yield {
        type: "error",
        message: e instanceof Error ? e.message : "runtime request failed",
        code: "network",
      };
      return;
    }

    if (!res.ok) {
      clearTimeout(connectTimer);
      yield { type: "error", message: `runtime responded ${res.status}`, code: String(res.status) };
      return;
    }
    if (!res.body) {
      clearTimeout(connectTimer);
      yield { type: "error", message: "runtime returned no stream", code: "no_body" };
      return;
    }

    // Stream confirmed open — the cold-start/connect guard has done its job.
    // Clear it here (synchronously, before getReader() — no await in between, so
    // a hung body can never sit unguarded) and hand off to the per-chunk idle
    // timer below. After this point only the idle timer can abort, so a
    // mid-stream abort is unambiguously an idle stall → code:"stream".
    clearTimeout(connectTimer);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        // Arm a fresh idle window before EVERY read (first included), and clear
        // it the instant the read settles — resolve OR reject. `.finally` clears
        // on abort too, so the rejection still propagates to the catch below and
        // maps to code:"stream" (mapping unchanged).
        const idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
        const { value, done } = await reader.read().finally(() => clearTimeout(idleTimer));
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
    const timer = setTimeout(() => controller.abort(), INGEST_TIMEOUT_MS);

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

  /**
   * `GET /ai/requests?limit=&offset=` — the caller's approval ledger.
   *
   * ⚠️ `orgId`/`userId` go into the MINTED TOKEN and never into the query
   * string. The runtime scopes the result on the token, which is the mechanism
   * that makes v1's requester-only isolation hold — a query param would let a
   * caller ask for someone else's ledger.
   *
   * Request/response, so it follows `ingest`'s shape, not `assist`'s: one
   * AbortController, one timeout, a typed throw. None of the stream guards
   * (connect vs idle) apply — there is no stream to idle-monitor.
   *
   * `x-trace-id` is sent unconditionally. `ingest` omits it, which is an
   * omission rather than a precedent: an approval is the single thing most
   * likely to need tracing across two systems after the fact.
   */
  async listApprovalRequests(input: ListApprovalsInput): Promise<AssistApprovalListPage> {
    const token = await mintRuntimeToken({
      orgId: input.orgId,
      botAgentId: input.botAgentId,
      userId: input.userId,
    });

    const qs = new URLSearchParams();
    if (input.limit != null) qs.set("limit", String(input.limit));
    if (input.offset != null) qs.set("offset", String(input.offset));
    const query = qs.toString();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LIST_APPROVALS_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/ai/requests${query ? `?${query}` : ""}`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(input.traceId ? { "x-trace-id": input.traceId } : {}),
        },
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      // An abort here is the timeout firing; anything else is a network fault.
      // Both are "we don't know", which is NOT "you have none".
      throw new ListApprovalsError(
        (e as { name?: string })?.name === "AbortError" ? "timeout" : "unavailable",
      );
    }
    clearTimeout(timer);

    if (!res.ok) {
      throw new ListApprovalsError(res.status === 401 ? "bad_jwt" : "unavailable", res.status);
    }

    // Relayed as-is. `toolInput`/`proposedOutput`/`result` interiors are the
    // target app's own naming and are never touched; `mode` is carried and
    // ignored. See AssistApprovalRow.
    return (await res.json()) as AssistApprovalListPage;
  }

  /** `POST /ai/requests/{id}/approve` — perform the parked write. */
  approveRequest(input: DecideApprovalInput): Promise<AssistApprovalDecision> {
    return this.decide(input, "approve");
  }

  /** `POST /ai/requests/{id}/reject` — discard the parked write. */
  rejectRequest(input: DecideApprovalInput): Promise<AssistApprovalDecision> {
    return this.decide(input, "reject");
  }

  /**
   * The shared decision call. Approve and reject differ ONLY in the path
   * segment: same auth, same identity rule, same timeout, same status mapping,
   * same "200 is an outcome" rule. Splitting them into two near-identical
   * methods is how one of them quietly stops mapping 409.
   *
   * ⚠️ `orgId`/`userId` go into the MINTED TOKEN. The only client-derived value
   * in the whole request is `requestId` in the path, and there is no body at
   * all — an empty POST, deliberately, so there is nowhere for an identity field
   * to be added later "just to be safe".
   *
   * ⚠️ A 2xx ALWAYS resolves, including `status: "failed"`. That is a recorded
   * approval whose write the target app refused: an outcome to render, not a
   * transport error to retry. Only a non-2xx throws.
   */
  private async decide(
    input: DecideApprovalInput,
    action: "approve" | "reject",
  ): Promise<AssistApprovalDecision> {
    const token = await mintRuntimeToken({
      orgId: input.orgId,
      botAgentId: input.botAgentId,
      userId: input.userId,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DECIDE_APPROVAL_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(
        `${this.baseUrl}/ai/requests/${encodeURIComponent(input.requestId)}/${action}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/json",
            ...(input.traceId ? { "x-trace-id": input.traceId } : {}),
          },
          signal: controller.signal,
        },
      );
    } catch (e) {
      clearTimeout(timer);
      // An abort is the timeout; anything else is a network fault. They are
      // NOT the same here: a network fault before the request left is "nothing
      // happened", while a timeout is "we don't know". Keeping them apart is
      // what lets the relay word the two differently.
      throw new ApprovalDecisionError(
        (e as { name?: string })?.name === "AbortError" ? "timeout" : "unavailable",
      );
    }
    clearTimeout(timer);

    if (!res.ok) throw new ApprovalDecisionError(decisionCodeFor(res.status), res.status);

    // `result` interiors are the target app's own naming — relayed byte-identical,
    // never normalised, exactly like `toolInput` on the list.
    return (await res.json()) as AssistApprovalDecision;
  }
}

/**
 * Runtime HTTP status → decision error code.
 *
 * Every branch here is a genuinely different situation for the person who just
 * tapped a button, which is why this is a table and not `status >= 400`.
 * `default` is `unavailable` (retryable) rather than a hard failure: an
 * unrecognised status from the runtime is more likely a proxy or a gateway than
 * a semantic refusal, and telling the user "try again" is the safe reading — the
 * one status where "try again" is NOT safe (timeout) never reaches this function.
 */
function decisionCodeFor(status: number): ApprovalDecisionErrorCode {
  switch (status) {
    case 409:
      return "already_handled";
    case 403:
      return "forbidden";
    case 410:
      return "tool_gone";
    case 404:
      return "not_found";
    case 401:
      return "bad_jwt";
    default:
      return "unavailable";
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
