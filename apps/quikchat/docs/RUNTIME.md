# QuikChat ↔ QuikverseAI Runtime — Contract (Phase 3 v1)

Canonical wire contract for the `RuntimeClient` seam
(`apps/quikchat/lib/server/runtime/`). This is the document referenced by
`types.ts` ("The runtime build must match these shapes — see docs/RUNTIME.md").

**Status:** all shapes below verified against QuikChat source (`http.ts`,
`types.ts`, `gcs.ts`) and confirmed against the runtime source by the runtime
team on 2026-07-22. Scope: text-only, push-context, ungated replies + Stage-3
KB retrieval and ingest.

**Place at:** `apps/quikchat/docs/RUNTIME.md`

---

## Endpoints

| Purpose | Method / Path | Content |
|---|---|---|
| Assist turn | `POST {RUNTIME_BASE_URL}/ai/chat/assist` | SSE (`text/event-stream`) |
| KB ingest | `POST {RUNTIME_BASE_URL}/ai/ingest` | JSON (sync request/response) |

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

**Reserved, MUST NOT be emitted on the retrieval path in v1:**
`{ "type": "approval_needed" }` — reserved for the future write/actions phase.
The client leaves it unhandled.

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

---

## Open product decision (not a wire issue)

QuikChat builds KB scope **per-channel** (`listChannelKbSourceFileIds`,
`GET /kb-docs` seed from this channel's messages), but the runtime's widen mode
(`{ enabled:true }` with no ids) searches the user's **whole org-visible KB**, not
this channel's. If the intended UX for "widen" is "this channel's whole KB,"
QuikChat must send the channel's `sourceFileIds` in widen mode rather than an
empty `{ enabled:true }`. Resolve and update `buildKnowledgeBase` if needed.
