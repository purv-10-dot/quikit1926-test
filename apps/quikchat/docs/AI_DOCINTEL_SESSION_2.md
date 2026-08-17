# QuikChat — Claude Code Session: AI Doc-Intel Stage 2 (attach + summarize)

**You are Claude Code**, monorepo `C:\Users\user\Desktop\quikit-platform\quikit1926`, `apps/quikchat`, branch `feature/quikchat-port`. Read this, investigate the client attach path, then **STOP and reply with a readback**. **Do NOT write code or run git until Suyash says "go".** Suyash runs all git/terminal. Plan: `apps/quikchat/docs/AI_DOCINTEL_PLAN.md`. Stage 1 is DONE (AI-chat type + `/ai`, working against the real runtime).

## Goal (Stage 2 only)
In the AI chat, let a user **attach a document with their message → the runtime summarizes/answers about it**, streamed back. **Transient per-message analysis — NO RAG, NO ingest** (that's Stage 3). Upload path is already fixed (server-side GCS; uploads land in `quikit-bucket` under `quikchat/<orgId>/<channelId>/…`; `objectPath` = the `storageKey`). Stage 2 carries the document reference from the attached message to the runtime and renders the streamed summary.

## Runtime contract — CONFIRMED (this is the wire shape; implement to it exactly)
The runtime team confirmed `/ai/chat/assist`'s document fields, straight from its request model:
- **`url`** (string, optional) and **`filename`** (string, optional), **flat, top-level** in the body — alongside `channelId`/`prompt`/`history`. **NOT** nested, **NOT** `documentUrl`/`document_url`/`fileUrl`. Exact body when a doc is attached:
  ```json
  { "channelId": "…", "prompt": "summarize this", "history": [...], "url": "https://…", "filename": "invoice.pdf" }
  ```
- **`url` present → the runtime deterministically routes to the document-analysis agent** with that exact URL. Absent → normal chat, unchanged.
- **`url`/`filename` are per-turn only — the runtime never persists them to history.** So a follow-up question about the same doc must **resend `url`** or it's treated as a plain turn. (Stage 2 scope: send url+filename on the turn that carries the attachment; do NOT try to auto-carry it forward — that's fine for v1.)
- **Stage 2 is URL-based, not storageKey-based.** The assist path *fetches a URL*; it does not read the bucket. So QuikChat mints a **presigned GCS GET URL** and sends it. (storageKey is Stage 3's mechanism, for `/ai/ingest` — not used in Stage 2's HTTP body.)

**Two external gates (Suyash owns; NOT your code — noted so you don't assume they're done):**
1. **`document_fetch` allowlist:** the runtime enforces SSRF host-allowlisting in its `document_fetch` tool, not at the assist layer. Our presigned URLs are `https://storage.googleapis.com/…`, so **`storage.googleapis.com` must be on the runtime's allowlist** or analysis rejects the URL. Suyash is confirming this with the runtime team. Your code is correct regardless; this is a runtime-config gate for the manual test.
2. Bucket-name alignment + runtime GCS creds → **Stage 3 only** (storageKey ingest). Not a Stage 2 blocker (Stage 2 fetches a URL, needs no runtime bucket creds).

## The current seam (verified — text-only; you extend it)
1. **Client** `streamAssist(channelId, { prompt, threadRootId? }, handlers)` (`lib/assist-client.ts`) → POSTs `{ prompt, threadRootId? }`.
2. **Relay route** `POST /api/channels/[id]/assist` reads `{ prompt, threadRootId }`, builds history, calls `runtime.assist({ orgId, userId, channelId, threadRootId, prompt, history, locale, botAgentId, traceId })`.
3. **`AssistInput`** (`lib/server/runtime/types.ts`) — no file.
4. **`HttpRuntimeClient.assist`** (`lib/server/runtime/http.ts`) POSTs `{ channelId, threadRootId, prompt, history, locale }` (orgId/userId in JWT).

## Scope — thread the doc reference through the four layers

### 1. `lib/server/runtime/types.ts` — extend `AssistInput`
```ts
/** Optional attached document for the doc-analysis path (Stage 2). Absent = plain chat turn. */
document?: {
  url: string;        // presigned GET URL the runtime fetches (Stage 2 sends this)
  filename: string;
};
```
Optional — a normal turn omits it. (No `storageKey` in `AssistInput` for Stage 2 — the runtime is URL-based here. The storageKey stays client/relay-side for minting the URL + authz; it's Stage 3 that sends storageKey to `/ai/ingest`.)

### 2. `lib/server/runtime/http.ts` — forward it
When `input.document` is present, add **top-level flat** `url` + `filename` to the POST body (exactly as the confirmed contract). Absent → body byte-identical to today (back-compat).

### 3. `app/api/channels/[id]/assist/route.ts` — accept, authorize, mint, forward
- Read optional `document?: { storageKey: string; filename: string; contentType?: string }` from the request body. (Client sends the **storageKey** it owns — NOT a url; the server mints the url.)
- **Relax the prompt guard:** today `if (!prompt) throw 400`. A doc turn may have an empty caption → change to `if (!prompt && !document) throw 400` so "attach with no text" works (runtime summarizes on url alone).
- **Authorize the storageKey to the channel:** require `storageKey.startsWith(\`quikchat/${ctx.orgId}/${channelId}/\`)` (matches `buildObjectPath`), else 403. A client must not summarize an arbitrary object. (Tenant-key guard, platform pattern.)
- **Mint the presigned url server-side** (never trust a client url): `await getStorage().createDownloadUrl(storageKey, { downloadName: filename, contentType })` — reuse the exact pattern from `messages.service.ts` (the media-download path).
- Pass `document: { url, filename }` into the existing `runtime.assist({...})` call.

### 4. Client — attach in the AI chat + send the ref
Confirmed gap from investigation: in the AI chat, an attachment goes composer `sendPending()` → `onSendMedia(media, caption, localUrl)` → `handleSendMedia` which posts the Media message but **never invokes the assistant**. Stage 1's `handleAiChatSend` only wired the text path. Fix:
- Extend `handleAssist(prompt, document?)` to pass `document` into `streamAssist`.
- Add `handleAiChatSendMedia(media, caption, localUrl)` = `handleSendMedia(media, caption, localUrl)` (persist + render the Media message as today) **then** `handleAssist(caption, { storageKey: media.objectPath, filename: media.originalName, contentType: media.mediaType })`.
- Wire per type: `onSendMedia={activeChannel.type === "ai" ? handleAiChatSendMedia : handleSendMedia}` (normal channels unchanged).
- Extend `streamAssist`'s body type (`lib/assist-client.ts`) to carry optional `document: { storageKey, filename, contentType? }` (client→relay; the relay converts storageKey→url).
- Streamed summary renders via the existing delta/done path — no change.

## Constraints
- **Transient only** — no `/ai/ingest`, no "Add to KB", no retrieval (Stage 3).
- **Back-compat:** no-attachment turn + plain-channel `/ai` send exactly what they do today (`document` optional throughout).
- SSE/streaming, done/delta, message-persistence model — unchanged.
- **Server mints the url from storageKey; never trust a client url. Authorize storageKey to the channel.**
- Preserve Stage-1 "persist user msg → assist" (media persisted via `handleSendMedia` before assist).

## Verification gate (Suyash runs, after "go")
1. `npx tsc --noEmit` → 0.
2. `npx vitest run` → green; state expected count. Runnable adds: `http.ts` doc-forwarding (top-level `url`+`filename` when `document` present; unchanged when absent); `assist-client` body carries `document`. Relay-route doc-resolution/authz test goes in the DB-excluded bucket (`route.test.ts`), doesn't move the `vitest run` count. Baseline = current fresh run (was 505/82).
3. Manual (real runtime, `RUNTIME_MODE=http`, `STORAGE_DRIVER=gcs`, **and `storage.googleapis.com` allowlisted on the runtime**): AI chat → attach a document + "summarize this" → uploads to the bucket, relay mints a presigned url, runtime receives top-level `url`+`filename` (confirm in runtime logs), real summary streams back + persists. Normal message (no attachment) unchanged. *(If the allowlist gate isn't live yet, expect the runtime to reject the fetch — that's the external gate, not a code bug.)*

## STOP HERE — readback
1. `AssistInput.document` shape + the `http.ts` top-level `url`/`filename` body change.
2. Relay-route change: reading `document`, the relaxed prompt guard, the storageKey channel-authz check, and the `createDownloadUrl` mint (quote the `messages.service.ts` pattern you mirror).
3. Client attach flow: quote `handleAiChatSend` + the composer `onSendMedia` path, and the new `handleAiChatSendMedia` + `streamAssist` body extension.
4. Tests + expected count (runnable vs DB-excluded split).
5. Confirm: transient only, back-compat for plain turns, SSE/persistence unchanged, server-minted url + storageKey authz.

Wait for **"go"**.
