# QuikChat — Claude Code Session: AI Doc-Intel Stage 3 (Add to KB + Q&A retrieval)

**You are Claude Code**, monorepo `C:\Users\user\Desktop\quikit-platform\quikit1926`, `apps/quikchat`, branch `feature/quikchat-port`. Read this, investigate the referenced files + **Step 0** (ingest/retrieval contract), then **STOP and reply with a readback**. **Do NOT write code or run git until Suyash says "go".** Suyash runs all git/terminal. Plan: `apps/quikchat/docs/AI_DOCINTEL_PLAN.md` (locked decisions). Stages 1 & 2 are DONE and verified end-to-end against the real runtime (attach → summarize returns real document text).

## Goal (Stage 3)
Two connected pieces, per the plan:
1. **"Add to knowledge base?" action** after a document summary → `POST /ai/ingest` (persists the doc into the KB, retrievable later).
2. **Conversation-scoped Q&A retrieval** — after a doc is in the KB, follow-up questions in that AI chat retrieve against it; an explicit "search my docs" widens to the full personal/org KB (locked decision 3).

Stage 4 (filing into a target app via agent-write) is OUT — but design the ingest metadata (`appId`/`entityId`) mindful of it.

## Locked decisions (from the plan — do NOT re-open)
- **Ingest trigger:** explicit **"Add to KB" button only** (no auto-ingest). Decision 4.
- **Visibility:** **PRIVATE default** + an explicit "share with org" (ORG) option. No per-channel. Decision 2.
- **Retrieval trigger:** **conversation-scoped auto** (docs added from *this* AI chat), **explicit "search my docs"** to widen to full personal/org KB. NOT every-turn-whole-KB. Decision 3.
- **File reference:** ingest uses the durable **`storageKey`** (= `MediaMeta.objectPath`), NOT a presigned URL. Decision 1. (Stage 2 used a URL because assist *fetches*; Stage 3 ingest has the runtime *read the bucket* by storageKey.)

## Step 0 — the `/ai/ingest` + retrieval contract (CONFIRM before implementing)
The runtime team confirmed **`/ai/ingest` takes top-level `storageKey` + `sourceFileId` + `appId` + `visibility`**. Before implementing, pin the exact remaining details (from the runtime request model / `docs/RUNTIME.md` if it now exists, else ask Suyash):
1. **Ingest request** — confirmed fields: `storageKey` (the `quikchat/<orgId>/<channelId>/<file>` key), `sourceFileId` (**idempotency/replace key** — re-ingesting the same id replaces), `appId` (`"quikchat"`), `visibility` (`"PRIVATE"` | `"ORG"` — **confirm exact enum casing**). Also confirm: does it want `filename`/`contentType`? Is it **sync** (returns when indexed) or **async** (returns a job id)? What's the **success response shape**?
2. **`sourceFileId` identity** — must be stable + unique per document so re-ingest replaces rather than duplicates. Candidates in QuikChat: the Media message id, or the `objectPath` itself. Investigate what stable id the uploaded Media message carries and pick one; state it. (`objectPath` embeds a per-upload UUID → unique per upload; confirm it's the right stable identity if the same file is re-attached.)
3. **Retrieval** — how does the runtime scope retrieval on an assist turn? The plan wants conversation-scoped auto + explicit widen. Confirm whether `/ai/chat/assist` accepts a retrieval hint (e.g. a `retrieval: { scope, sourceFileIds? }` field, or it retrieves by org/user automatically), OR whether retrieval is a separate endpoint. **This determines how decision-3 is wired.** If the assist contract has no retrieval field yet, **flag it — do NOT invent a contract**; Stage 3 then ships the ingest half + the client "search my docs" affordance stubbed until the runtime exposes scoping.

**Runtime-side gate (Suyash owns):** ingest requires the runtime pod to **read `quikit-bucket`** (`GCS_BUCKET=quikit-bucket` + creds). The `document_fetch` allowlist landing suggests the GCS env may now be set too — confirm with the runtime team that `GCS_BUCKET=quikit-bucket` + creds are live before the manual ingest test. (Code lands + unit-tests pass regardless; only the manual ingest verify needs it.)

## Scope

### A. Ingest write-path
1. **Runtime seam** (`lib/server/runtime/`): add an `ingest(input)` method to `RuntimeClient` (or a sibling call), with an `IngestInput` type `{ orgId, userId, storageKey, sourceFileId, appId, visibility, filename? }` (shape to Step-0 confirmation). Implement in `http.ts` → `POST {baseUrl}/ai/ingest` with the minted agent JWT (same auth as assist; orgId/userId in the token, the rest in the body per the confirmed contract). Stub impl mirrors the assist stub. Add the success-response type.
2. **Relay route** — new `POST /api/channels/[id]/ingest` (mirror the assist route's auth/rate-limit/membership + the **storageKey channel-authz** guard from Stage 2: `storageKey.startsWith(`quikchat/${ctx.orgId}/${channelId}/`)`). Reads `{ storageKey, sourceFileId, filename, visibility }`, calls `runtime.ingest(...)`, returns the result. `visibility` defaults to `"PRIVATE"` if absent; only `"PRIVATE"`/`"ORG"` accepted (else 400).
3. **Client**: `ingestDocument(channelId, { storageKey, sourceFileId, filename, visibility })` in `lib/api.ts` (or an assist-client sibling).

### B. "Add to KB" UI
- After an AI-chat **document** turn (a summary of an attached doc), render an **"Add to knowledge base?"** affordance (button/card) tied to that document, with a visibility choice (default **Private**, option **Share with org**). Investigate how the AI-chat renders the turn + how it can know *which* document/storageKey the summary was about (the user's attached Media message carries `objectPath` + id). The action calls `ingestDocument(...)`; on success show a confirmed state ("Added to your knowledge base"), on failure a toast.
- **Only for doc turns** — a plain chat turn has no "Add to KB". Keep it minimal.

### C. Retrieval read-path (per Step-0 outcome)
- If `/ai/chat/assist` accepts a retrieval hint: in an AI chat, **auto-scope retrieval to this conversation's ingested docs** on normal turns; add an explicit **"search my docs"** affordance (or recognized command) that widens scope to the full personal/org KB. Thread scope through the existing assist path (client → relay → `AssistInput` → http.ts body).
- If the runtime does NOT yet expose retrieval scoping: ship A + B, add the "search my docs" affordance as a stub (no-op until wired), and **flag the runtime gap** — do not invent a contract.

## Constraints
- Explicit "Add to KB" only (no auto-ingest). Visibility PRIVATE default. Retrieval conversation-scoped + explicit widen.
- Ingest uses durable **storageKey** (not a URL). Server authorizes the storageKey to the channel; never trust client identity beyond the storageKey it owns.
- Back-compat: plain turns + Stage-2 summarize unchanged. SSE/streaming/persistence model untouched.
- No Stage-4 agent-write. `appId="quikchat"`; leave `entityId` unset (reserved for Stage 4).
- Do NOT re-open the locked decisions.

## Verification gate (Suyash runs, after "go")
1. `npx tsc --noEmit` → 0.
2. `npx vitest run` → green; state expected count + the runnable-vs-DB-excluded split (ingest client/http tests runnable; relay-route ingest+authz test in the DB-excluded bucket).
3. Manual (real runtime, `RUNTIME_MODE=http`, `STORAGE_DRIVER=gcs`, **runtime pod has `GCS_BUCKET=quikit-bucket` + creds**): attach a doc → summarize → click "Add to KB" (Private) → `/ai/ingest` succeeds (confirm in runtime logs it received storageKey/sourceFileId/appId/visibility and read the object) → a follow-up question in the AI chat retrieves against the ingested doc. *(If the runtime GCS env or retrieval scoping isn't live, that manual step is the external gate — the code + unit tests still pass.)*

## STOP HERE — readback
1. **Step 0**: confirmed `/ai/ingest` fields (casing, sync/async, response shape, whether filename wanted); the chosen `sourceFileId` identity (+ why stable); and the retrieval-scoping contract (assist-field vs separate endpoint vs not-yet-exposed). If any is unconfirmed, state the assumption + that it needs Suyash before "go".
2. The runtime-seam `ingest()` + `IngestInput` shape + the `http.ts` POST.
3. The relay `POST /api/channels/[id]/ingest` — auth, storageKey channel-authz, visibility default.
4. The "Add to KB" UI: where it attaches, how it knows the document/storageKey, the visibility choice.
5. Retrieval wiring per Step-0 (or the flagged gap + stub).
6. Tests + expected count (runnable vs DB-excluded).
7. Confirm: explicit-ingest-only, PRIVATE default, storageKey-based, back-compat, no Stage-4 write, locked decisions intact.

Wait for **"go"** — if Step-0's ingest or retrieval contract is unconfirmed, surface it for Suyash before implementing past it.