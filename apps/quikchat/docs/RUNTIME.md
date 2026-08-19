# QuikChat ↔ QuikverseAI Runtime — Contract (Phase 3 v1)

Canonical wire contract for the `RuntimeClient` seam
(`apps/quikchat/lib/server/runtime/`). This is the document referenced by
`types.ts` ("The runtime build must match these shapes — see docs/RUNTIME.md").

**Status:** all shapes below verified against QuikChat source (`http.ts`,
`types.ts`, `gcs.ts`) and confirmed against the runtime source by the runtime
team on 2026-07-22. Scope: text-only, push-context, ungated replies + Stage-3
KB retrieval and ingest, plus the approval surface (`/ai/requests` and its two
decision endpoints) added 18 Aug 2026.

**Revised 18 Aug 2026, same day as written**, for three runtime changes that
landed immediately after: `outcomeSummary` (shipped — see the row fields and the
decision response), the `cancelled` status, and `total` becoming a real
`COUNT(*)`. The open ask below is down from two items to one.

**Place at:** `apps/quikchat/docs/RUNTIME.md`

---

## Endpoints

| Purpose | Method / Path | Content |
|---|---|---|
| Assist turn | `POST {RUNTIME_BASE_URL}/ai/chat/assist` | SSE (`text/event-stream`) |
| KB ingest | `POST {RUNTIME_BASE_URL}/ai/ingest` | JSON (sync request/response) |
| Approval ledger | `GET {RUNTIME_BASE_URL}/ai/requests?limit=&offset=` | JSON |
| Approve a write | `POST {RUNTIME_BASE_URL}/ai/requests/{id}/approve` | JSON (no body) |
| Reject a write | `POST {RUNTIME_BASE_URL}/ai/requests/{id}/reject` | JSON (no body) |

Live base URL (UAT/prod): `https://uataiengine.quikit.ai` (always-on cluster).

## Auth (both endpoints)

`Authorization: Bearer <agent JWT>`, minted by `mintRuntimeToken`. Claims:
`sub = botAgentId`, `orgId`, `userId`.

**`orgId` and `userId` are carried in the JWT only — never in the request body.**
The runtime derives all permission scoping from the JWT, not from body fields.

---

## `/ai/chat/assist` — request (what QuikChat sends)

```jsonc
{
  "appId": "quikchat",              // top-level, EVERY turn (runtime toolset scoping)
  "channelId": "...",               // telemetry only — NOT a retrieval boundary (see note)
  "threadRootId": "...",            // optional
  "prompt": "...",
  "history": [                      // pushed context, last ~20–30 msgs, oldest→newest
    { "role": "user|assistant", "text": "...", "createdAt": "<ISO>" }
  ],
  "locale": "en",

  // Stage-2 doc-analysis path — FLAT, present only when a document is attached:
  "url": "<v4 presigned GET>",      // path-style storage.googleapis.com URL (see GCS note)
  "filename": "...",

  // Stage-3 KB retrieval — NESTED, present only when KB is active:
  "knowledgeBase": { "enabled": true, "sourceFileIds": ["<storageKey>", ...] }
}
```

`knowledgeBase` semantics:
- omitted / `enabled:false` → plain turn, no retrieval (back-compat).
- `{ enabled:true, sourceFileIds:[...] }` → retrieval narrowed to those files.
- `{ enabled:true }` (no `sourceFileIds`) → **whole-KB widen**: retrieval across
  everything the JWT's org+user can see under the visibility rules (see §Visibility).

> **channelId is NOT a retrieval boundary.** The runtime scopes retrieval by
> `org + user + visibility` only; `channelId` is passed through for telemetry.
> "Whole KB" in widen mode = the user's entire org-visible KB across all
> channels, not this channel's KB. Per-channel isolation, if desired, must be
> expressed via `sourceFileIds` (or visibility), not `channelId`.

## `/ai/chat/assist` — response (SSE events QuikChat expects)

Each SSE message is `data: {json}`; json is one `RuntimeEvent`:

```jsonc
{ "type": "delta", "text": "..." }
{ "type": "done",  "text": "...", "agentRunId": "...", "sources": [ ... ] }  // sources OPTIONAL
{ "type": "error", "message": "...", "code": "..." }
```

`done.sources` (when citations exist):

```jsonc
{ "sourceFileId": "<storageKey>", "chunkIndex": 0, "snippet": "..." }
```

- Field names are exact camelCase (`sourceFileId`, `chunkIndex`, `snippet`).
- `sourceFileId` returned === the `sourceFileId`/`storageKey` sent at ingest
  (no runtime re-keying).
- **`sources` is omitted entirely when there are no citations** — never `[]`,
  never `null`. Both a plain turn and a "KB on but retrieved nothing" turn
  produce a `done` frame with no `sources` key. Parser rule: absent = no citations.
- `chunkIndex` is used by the client as a React key only; there is no `url`
  field, so citation chips are display-only (not links) in v1.

### `approval_needed` — a parked write (no longer reserved)

**This section previously said `approval_needed` was "reserved for the future
write/actions phase" and that "the client leaves it unhandled." Both are now
false.** It is a live, fully-typed, fully-handled frame. Corrected 18 Aug 2026.

TERMINAL, exactly like `done` and `error`: one per stream, emitted **instead of**
`done`, and the stream closes after it. A turn that ends this way has no answer
text and nothing is written to the message history — the durable record is the
runtime's own ledger row, which `/ai/requests` serves.

```jsonc
{
  "type": "approval_needed",
  "requestId": "...",          // runtime-owned; the ONLY hard-required field
  "appId": "quiktrack",        // which app the write targets
  "toolName": "create_issue",
  "riskClass": "soft_write",   // see the leniency rule below
  "summary": "...",            // the runtime's own sentence; rendered untouched
  "toolInput": { },            // target app's own argument naming — never normalised
  "expiresAt": "2026-08-18T12:15:00.000Z"
}
```

- **`riskClass` is NOT validated against the union.** The client accepts an
  unfamiliar class rather than rejecting a real parked write, and renders it at
  the HIGHEST risk. Adding a fourth class will not break the card; it will
  display conservatively until the client learns the name.
- `summary` is the headline. QuikChat never composes one from `toolName` +
  `toolInput`. **See the open ask below.**
- Only `requestId` is required. Every other field degrades rather than
  invalidating the frame.

---

## `/ai/requests` — the approval ledger

`GET`, returns `{ requests: AssistApprovalRow[], total }`.

**`total` is the unpaged `COUNT(*)`.** It previously returned the page size,
which made it useless: QuikChat's "Showing N of M" footer is driven by
`total - requests.length`, so it was always 0 and the footer was correct code
that could never fire. Our stub modelled `total` as the unpaged count from the
start, so the behaviour was right locally and unreachable in UAT — the footer
starts working now with no client change. (Fixed by the runtime 18 Aug 2026.)

**Identity is in the JWT, never the query string.** `orgId`/`userId` are not
accepted as parameters — the runtime scopes the result on the token, and that is
the mechanism that makes v1's requester-only isolation hold.

Returns pending rows **plus terminal ones** (`expired`, `rejected`, `executed`,
`failed`, `cancelled`) from the last 24h, each carrying `status`. Deliberately
unfiltered: a write that expired unactioned must remain visible as expired rather
than disappearing.

Row fields: `id`, `orgId`, `userId`, `appId`, `useCase`, `toolName`, `toolInput`,
`proposedOutput`, `riskClass`, `mode`, `status`, `decisionBy`, `decisionAt`,
`executedAt`, `expiresAt`, `createdAt`, `error`, `traceId`, `result?`,
`outcomeSummary?`.

- `toolInput` / `proposedOutput` / `result` interiors are the **target app's own
  naming** (`projectId`, `custom_field_7`, …) and are relayed byte-identical.
- `mode` is always `'copilot'` and carries no information. Carried so the payload
  round-trips; never surfaced or filtered on.
- **`outcomeSummary`** (shipped 18 Aug 2026) — a deterministic, generated
  sentence for what HAPPENED: *"Created QTRK-903"*. No LLM. Persisted on the row,
  so the list, the fetch-one and the decision response all return the same
  string. **Optional**: rows written before it shipped do not carry one, and a
  24h ledger spans the deploy, so the absent case is ordinary traffic. QuikChat
  falls back to a status-derived label and never renders blank.
  Do not confuse it with the proposal `summary`, which describes what is ABOUT to
  happen and is still missing — see the open ask below.

### Statuses

| `status` | Meaning |
|---|---|
| `pending` | Parked, awaiting an answer. The only actionable state. |
| `executed` | Approved and the write succeeded. |
| `failed` | Approved, and the target app refused the write. |
| `rejected` | A human declined it. `decisionBy` names them. |
| `expired` | Aged out unanswered. |
| `cancelled` | **Withdrawn** — the tenant disabled the assistant module while it was parked. |

`cancelled` and `rejected` are deliberately distinct and QuikChat renders them
differently. A human declining and a request being withdrawn are different facts
about different actors, and the ledger exists to record who decided what;
collapsing them would attribute an administrative action to the requester, who in
v1 is the person reading the card. A `cancelled` row carries `decisionBy: null` —
there is no human decider.

**Adding a status is safe on our side and needs no coordination.** Every gate in
QuikChat is a positive check for `"pending"` rather than a denylist of terminal
states, so an unrecognised value is non-actionable by construction. `cancelled`
was verified to render correctly as a terminal row *before* it was added to our
union.

Client → HTTP-status error mapping (`ListApprovalsErrorCode`):

| Runtime status | Client code |
|---|---|
| 401 | `bad_jwt` |
| other non-2xx | `unavailable` |
| abort (15s client timeout) | `timeout` |

A failure **throws** — it never resolves to an empty page. `{ requests: [] }`
means "you have none" and a failure means "we don't know"; the two look identical
on screen and mean opposite things.

---

## `/ai/requests/{id}/approve` and `/ai/requests/{id}/reject`

`POST`, **no request body at all**. `id` in the path is the only client-supplied
value; identity rides the JWT, same rule as the list. A request belonging to
another org must resolve to 404 — never 403 — since "that exists but isn't yours"
is itself a leak.

**NOT IDEMPOTENT, by design.** A second POST for the same id is refused with 409
rather than replayed. QuikChat depends on this: it is the backstop behind the
card's double-tap latch.

Response (HTTP 200):

```jsonc
{ "requestId": "…", "status": "executed", "result": { … }, "outcomeSummary": "Created QTRK-903" }
{ "requestId": "…", "status": "failed", "errorCode": "APP_API_ERROR", "error": "…",
  "outcomeSummary": "Could not update QTRK-208" }
{ "requestId": "…", "status": "rejected", "outcomeSummary": "Declined — nothing was changed" }
```

**`outcomeSummary` is served here as well as on the row**, which is what lets the
card that just took the decision show the real outcome with no refetch. QuikChat
still refetches the list afterwards, but only so the Activity section, a second
tab and a reload converge — the card in front of the user never waits on it.
Optional here for the same reason as on the row; absent falls back to a
status-derived label, never to blank.

⚠️ **`status: "failed"` comes back on HTTP 200 and that is correct.** The approval
succeeded — the decision was recorded and the write attempted — and the *target
app* refused it. Two failures in two systems; only a non-2xx is a failure to
decide. QuikChat renders `failed` as an outcome carrying `error`, never as a
network error, and never retries it.

⚠️ **On a `failed` decision, `outcomeSummary` does NOT replace `error`.** The
generated sentence is deterministic and says *what* happened without saying
*why*; `error` is the target app's own words and the only text on the card a user
can act on. QuikChat renders both, accepting mild duplication — please keep
sending `error` on `failed` even once every decision carries a summary.

Client → HTTP-status error mapping (`ApprovalDecisionErrorCode` → QuikChat's own
relay status):

| Runtime status | Client code | Relay status | Meaning |
|---|---|---|---|
| 409 | `already_handled` | 409 | Already handled or expired. Where a double-tap lands. |
| 403 | `forbidden` | 403 | Permission revoked between proposal and approval. |
| 410 | `tool_gone` | 410 | Tool deregistered. |
| 404 | `not_found` | 404 | Unknown id, or another org's. |
| 401 | `bad_jwt` | 502 | Our token — never shown as the user's error. |
| other non-2xx | `unavailable` | 502 | Theirs, retryable. |
| abort (30s client timeout) | `timeout` | 504 | **Unknown whether it landed.** |

The timeout row is the sharp one: because the endpoint is not idempotent, the
user is told to refresh and check, never to try again.

---

## 🔴 Open ask for the runtime team — the PROPOSAL summary on the ledger row

**One remaining item.** This section previously listed two; the second — an
outcome string — shipped on 18 Aug 2026 as `outcomeSummary`, served from the
list, the fetch-one and the decision response. It is wired and documented above.
What follows is what is left.

**`AssistApprovalRow` still carries no `summary`.** The SSE frame has one; the
ledger row does not. So the Activity card — the only surface a user reaches after
the turn ends, and the one that survives a reload or a second device — is reduced
to showing `create_issue` where the live card showed a sentence. The card that
lasts is the worse card.

We understand the generator exists but is unwired, and ships with emission. Two
things worth stating while it is still in flight:

- **QuikChat will not synthesise one from `toolName` + `toolInput`.** That is
  precisely the coupling `summary` exists to prevent: it would put our guess at
  another app's argument semantics in front of the user at the moment they
  authorise a write, and it would rot silently every time QuikTrack renamed a
  field. The fallback is the raw tool name — honest and poor — until this lands.
- **It is a different string from `outcomeSummary`,** not a rename of it. One
  describes what is *about to* happen and is needed on a `pending` row; the other
  describes what *did* happen and only exists on terminal ones. A row mid-life
  needs the first and has no second.

The seam is left in `ApprovalCardModel.summary` and no field name has been
invented for it. When it lands, `fromApprovalRow` gains one line and the
`toolName` fallback stops firing.

---

## `/ai/ingest` — request

```jsonc
{
  "storageKey": "...",        // durable object key (= MediaMeta.objectPath); runtime reads the bucket
  "sourceFileId": "...",      // === storageKey (idempotency/replace key; stored verbatim)
  "appId": "quikchat",
  "visibility": "PRIVATE|ORG",// APP is valid server-side but never sent by the QuikChat UI
  "filename": "..."           // optional
}
```

Returns `IngestResult` (client consumes `sourceFileId` and `chunksStored`).
Ingest is synchronous — the runtime does extract + embed **before** replying.

Client → HTTP-status error mapping:

| Runtime status | Client `IngestErrorCode` |
|---|---|
| 404 | `object_not_found` |
| 422 | `extract_failed` |
| 401 | `bad_jwt` |
| other non-2xx | `ingest_failed` |

---

## Visibility enforcement (server-side, in retrieval SQL)

Enforced in the retrieval `WHERE`, never a post-filter, scoped by the JWT:

```sql
org_id = <jwt.orgId>
AND ( uploaded_by = <jwt.userId>                         -- PRIVATE: uploader-only
      OR (visibility = 'APP' AND app_id = <request appId>)
      OR visibility = 'ORG' )                            -- ORG: any user in the org
```

- `PRIVATE` = only the `userId` that ingested it can retrieve it.
- `ORG` = any user in the same org.
- A file id from another org can never surface chunks — the org predicate always
  wins; `sourceFileIds` can only narrow within scope, never widen across it.
- QuikChat does **not** enforce visibility client-side by design; the runtime is
  the single enforcement point.

---

## GCS URL form (SSRF allowlist)

The runtime gates all server-side fetches (`url` doc path + KB source fetches)
through a host allowlist (`DOCUMENT_FETCH_ALLOWED_HOSTS`), matched on **host**.

QuikChat mints **path-style** v4 signed GET URLs:
`https://storage.googleapis.com/<bucket>/<object>` — host = `storage.googleapis.com`.
(`gcs.ts` uses `@google-cloud/storage` `getSignedUrl` with no `virtualHostedStyle`,
which defaults to path-style.) This host is on the UAT allowlist (proven
end-to-end 2026-07-20). If the minting ever switches to virtual-hosted
(`<bucket>.storage.googleapis.com`), the allowlist entry must be updated to that
exact host or fetches fail-closed to the stub (silent retrieval no-op).

---

## Client timeout budgets (informational)

- assist: 60s connect/headers guard (covers cold start) + 60s per-chunk idle guard
  (reset each read; a long-but-progressing stream is not killed).
- ingest: 180s single-shot (extract+embed is synchronous; ~27s observed for a
  22-page PDF on UAT — comfortable headroom).
- `/ai/requests` list: 15s single-shot. It is an indexed read behind a paginated
  endpoint — no LLM call, no extract, no embed — so neither of the above is a
  sane ceiling.
- `/ai/requests/{id}/approve|reject`: 30s single-shot. More room than the list
  (approve calls out to the target app's API) and far less than ingest.

---

## Open product decision (not a wire issue)

QuikChat builds KB scope **per-channel** (`listChannelKbSourceFileIds`,
`GET /kb-docs` seed from this channel's messages), but the runtime's widen mode
(`{ enabled:true }` with no ids) searches the user's **whole org-visible KB**, not
this channel's. If the intended UX for "widen" is "this channel's whole KB,"
QuikChat must send the channel's `sourceFileIds` in widen mode rather than an
empty `{ enabled:true }`. Resolve and update `buildKnowledgeBase` if needed.
