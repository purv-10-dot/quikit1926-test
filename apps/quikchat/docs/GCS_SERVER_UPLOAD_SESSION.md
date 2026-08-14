# QuikChat — Claude Code Session: server-side GCS uploads (converge on platform pattern; kill browser-direct PUT)

**You are Claude Code**, monorepo `C:\Users\user\Desktop\quikit-platform\quikit1926`, `apps/quikchat`, branch `feature/quikchat-port`. Read this whole prompt, investigate the referenced files, then **STOP and reply with a readback**. **Do NOT write code or run git until Suyash says "go".** Suyash runs all git/terminal.

## Why
QuikChat's GCS driver hands the **browser** a direct-to-GCS signed **write** URL; the browser PUTs bytes straight to `storage.googleapis.com`. That's cross-origin → requires bucket CORS, which `quikit-bucket` doesn't have (browser blocked with `No 'Access-Control-Allow-Origin'`). **Every other QuikIT app (quiktrack/quikhrms/quikcrm) uploads server-side**: browser → the app's own API route → the app's server calls GCS with the SA creds (`file(key).save(...)`). No browser-direct write → no CORS needed. QuikChat is the outlier. Converge it onto the platform pattern.

**Key insight — the pattern already exists in QuikChat.** The `local` driver (`lib/server/storage/local.ts`) already routes the PUT through an app endpoint (`/api/uploads/local/{token}` → `LocalDriver.write()`), bytes transiting the app. Do the **same for GCS**: keep the storage seam and client flow identical; only change *where the browser PUTs* (an app route, not GCS directly) and have the server push to GCS.

## Scope

### 1. `lib/server/storage/gcs.ts` — route uploads through the app, not the browser
- **`createUploadTarget`**: instead of a direct GCS v4 signed-write URL, return `uploadUrl: /api/uploads/gcs/{token}` where `{token}` is an HMAC-signed token carrying `{ kind:"up", objectPath, contentType, maxBytes, orgId, userId, exp }` — mirror `LocalDriver.createUploadTarget` + `signToken` (reuse `lib/server/storage/tokens.ts`; use the same/an analogous secret — see note). `method:"PUT"`, `headers:{ "Content-Type": contentType }`, same `objectPath` from `buildObjectPath`, `maxBytes`, `expiresAt`. **No `x-goog-*` header, no browser-facing GCS URL.**
- **Add a server-side `write(objectPath, body, contentType)`** to `GcsDriver` (mirrors `LocalDriver.write`): `const bucket = await this.bucket(); await bucket.file(objectPath).save(Buffer.from(body), { contentType, resumable:false, metadata:{ cacheControl:"private, max-age=300" } });`. **You must extend the loose `GcsBucket`/`GcsFile` interfaces in this file to include `save(...)`** (currently only `getSignedUrl`/`delete`). Match the `save` options quiktrack/quikhrms use (`resumable:false`).
- **`createDownloadUrl`**: **leave as-is** (GCS v4 signed-GET). A signed GET the browser navigates/loads is not the blocked-PUT case; the other apps use signed-GET too. Do NOT change downloads unless the readback surfaces a reason.
- Keep the credential resolution (`GCS_CREDENTIALS_JSON` / split / keyfile) untouched — it works.

### 2. New route `app/api/uploads/gcs/[token]/route.ts` — the server-side receiver
Mirror `app/api/uploads/local/[token]/route.ts` (READ IT FIRST — match its token verification, error handling, size enforcement, and response shape exactly). It must:
- `PUT` handler: verify the HMAC token (`verifyToken` from `tokens.ts`); reject expired/invalid (401/403 as the local route does).
- Enforce `Content-Type` matches the token and body size ≤ `maxBytes` (the direct-GCS path enforced size via `x-goog-content-length-range`; now enforce it in the route — reject >maxBytes with 413).
- Read the raw body to a Buffer and call the GCS driver's new `write(objectPath, body, contentType)`.
- Return the same success shape the local PUT route returns.
- Confirm the route is exempt from the auth middleware the same way `/api/uploads/local/[token]` is (the token IS the auth — check how the local route is matched/excluded; mirror it). Also confirm Next body-size limits (App Router route handlers) allow up to 25 MB (`UPLOAD_MAX_BYTES`) — if there's a `bodyParser`/`sizeLimit` concern for route handlers, note it.

### 3. Token secret
`local.ts` uses `UPLOAD_TOKEN_SECRET` (fallback dev secret). Reuse the **same** `signToken`/`verifyToken` + secret for the GCS token (simplest, one secret for both drivers). Confirm in readback.

### 4. Do NOT change
- The `StorageDriver` interface, `UploadTarget` shape, `UploadTargetInput`, `types.ts` constants.
- `lib/upload.ts` (client) — it already does sign → PUT(uploadUrl, headers) → send; a relative `uploadUrl` (`/api/uploads/gcs/...`) works with its `XMLHttpRequest.open("PUT", url)` exactly like the local driver. **Confirm** the client needs no change (it shouldn't).
- The `local` driver + route (leave the interim local path working).
- CSP/`next.config.js` — with server-side uploads the browser no longer calls `storage.googleapis.com` for PUT; the `connect-src` GCS entry we added is now harmless (downloads via signed-GET still use it — keep it).
- No env changes (Suyash owns `.env.local`).

## What this fixes / why it's better
- **No bucket CORS needed** — the shared `quikit-bucket` needs no policy change; QuikChat matches quiktrack/hrms/crm.
- Bytes flow browser → app → GCS (fine for chat attachments ≤25 MB). Trade-off vs. direct-upload (server bandwidth/memory) is acceptable at this size and matches the platform norm.
- **Stage 2 unaffected**: `objectPath`/`storageKey` handoff, Media message shape, and the runtime document flow are all downstream of the unchanged `UploadTarget.objectPath` — this only changes the byte transport.

## Verification gate (Suyash runs, after "go")
1. `npx tsc --noEmit` → 0.
2. `npx vitest run` → green; state expected count (add a `gcs.write` test + a `/api/uploads/gcs/[token]` route test mirroring the local route's tests; note whether the route test is in the vitest include or the DB-excluded bucket).
3. With `STORAGE_DRIVER=gcs` + creds + server restarted: in the AI chat, attach a document → the browser PUTs to `/api/uploads/gcs/{token}` (NOT `storage.googleapis.com`), returns 2xx, and the object lands in `quikit-bucket` under `quikchat/<orgId>/<channelId>/…`. No CORS error. Download/preview of the uploaded file still works (signed-GET).

## STOP HERE — readback
1. The `gcs.ts` changes: the new `createUploadTarget` return (token-based `uploadUrl`), the new `write()` method, and the `GcsBucket`/`GcsFile` interface extension for `save`.
2. The new route — quote the local route's structure you're mirroring (token verify, size/content-type enforcement, middleware exemption, success shape) and how the GCS route matches it.
3. Token secret decision (reuse `UPLOAD_TOKEN_SECRET`?).
4. Confirm the client (`lib/upload.ts`) needs no change, and the route-handler body-size limit accommodates 25 MB.
5. Tests + expected count.
6. Confirm untouched: `StorageDriver`/`UploadTarget`/`types.ts`, the local driver/route, `createDownloadUrl`, CSP, env.

Wait for **"go"**.
