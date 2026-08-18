# QuikChat — Claude Code Session: add GCS to CSP `connect-src` (unblock uploads)

**You are Claude Code**, monorepo `C:\Users\user\Desktop\quikit-platform\quikit1926`, `apps/quikchat`, branch `feature/quikchat-port`. Read this, then **STOP and reply with a readback** before writing. **Do NOT write code or run git until Suyash says "go".** Suyash runs all git/terminal.

## Problem (confirmed from a browser console trace)
Browser-direct signed-URL uploads to GCS are blocked by QuikChat's own CSP:
```
Connecting to 'https://storage.googleapis.com/quikit-bucket/quikchat/…' violates the
Content Security Policy directive: "connect-src 'self' http://localhost:3000 wss://…".
The action has been blocked.
```
`lib/upload.ts` does sign → `XMLHttpRequest` PUT to the signed URL; that PUT is a `connect-src` action, but `connect-src` in `next.config.js` has no GCS entry, so the browser refuses the request (it never hits the network — Network tab is empty). Sign route returns 200; the failure is purely the client CSP.

## The change — ONE line in `apps/quikchat/next.config.js`
In `headers()`, `connectSrc` is currently:
```js
const connectSrc = ["'self'", quikitConnectOrigin, realtimeConnectOrigin]
  .filter(Boolean)
  .join(" ");
```
Add the GCS origin so signed-URL PUT/GET is permitted:
```js
const connectSrc = ["'self'", quikitConnectOrigin, realtimeConnectOrigin, "https://storage.googleapis.com"]
  .filter(Boolean)
  .join(" ");
```
Rationale: uploads use `storage.googleapis.com/<bucket>/<object>` (path-style). `img-src` already allows `https:` (media display works); `connect-src` was simply never given the GCS entry for XHR uploads. This closes that gap.

## Constraints
- ONLY this `connect-src` array in `next.config.js`. Do not touch other directives, other files, or env.
- Keep `.filter(Boolean)` (harmless for the literal, keeps the pattern).
- Consider whether to make it env-driven (e.g. a `GCS_CONNECT_ORIGIN`) vs. the hardcoded literal. Recommend the **literal `https://storage.googleapis.com`** — it's the fixed Google host for signed URLs, not per-deploy; simpler and matches the `img-src 'self' … https:` precedent. Flag if you think otherwise, but default to the literal.

## Verification gate (Suyash runs, after "go")
1. Restart `npm run dev --workspace=quikchat` (CSP is a build/config header — needs a restart), hard-reload.
2. In the AI chat, attach a document → the `PUT` to `storage.googleapis.com` now succeeds (200/204 in the Network tab); no CSP violation in the console; the object lands in the bucket under `quikchat/<orgId>/<channelId>/…`.
3. `npx tsc --noEmit` → 0 (config change shouldn't affect it, but confirm). No test count change expected.

## Not in scope (Suyash handles via env, not you)
- `NEXT_PUBLIC_REALTIME_WS_URL` still points at a dead dev tunnel (`wss://…devtunnels.ms`) → the socket.io 404 flood + the stale WS entry in the CSP. Suyash fixes that in `.env.local` (`ws://localhost:3012`) + restart. Not a code change — do NOT touch it.

## STOP HERE — readback
1. The exact one-line edit + confirmation it's the only change.
2. Literal vs env-driven decision (default literal).
3. Confirm no other directive/file/env touched.

Wait for **"go"**.
