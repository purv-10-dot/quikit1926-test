# QuikChat — Claude Code Session: GCS split-credential support (match platform convention)

**You are Claude Code, in the QuikIT monorepo** `C:\Users\user\Desktop\quikit-platform\quikit1926`, `apps/quikchat`, branch `feature/quikchat-port`. Read this whole prompt, then **STOP and reply with a readback/plan** (final section). **Do NOT write code or run commands until Suyash replies "go".** Suyash runs all git/terminal; you never run git.

## Problem
QuikChat's GCS storage driver only accepts credentials as inline JSON (`GCS_CREDENTIALS_JSON`) or a keyfile path (`GOOGLE_APPLICATION_CREDENTIALS`). But the rest of the QuikIT apps configure GCS with the **split form**: `GCS_CLIENT_EMAIL` + `GCS_PRIVATE_KEY` (plus `GCS_BUCKET`, `GCS_PROJECT_ID`). So QuikChat can't use the same env/service-account the other apps use — uploads silently fall back to the local driver. Fix: make QuikChat accept the split form too, **matching exactly how the other apps do it.**

## Step 0 — match the existing platform pattern (do this first)
Grep the repo for how another app builds its GCS `Storage` client from `GCS_CLIENT_EMAIL` / `GCS_PRIVATE_KEY` — e.g. `grep -rn "GCS_CLIENT_EMAIL" apps/` and `grep -rn "GCS_PRIVATE_KEY" apps/`. Find a real example (quikinfra / quikscale / quikcrm / quiksocial likely have one). **Copy its exact credential handling**, especially:
- the **private-key newline un-escaping** (almost certainly `privateKey.replace(/\\n/g, "\n")`, sometimes also stripping surrounding quotes) — replicate it verbatim so QuikChat behaves identically;
- the `projectId` handling;
- any precedence order between credential forms.
Quote what you found in the readback. If no other app uses it, say so and fall back to the standard shape below.

## The change (2 files + tests)

### 1. `apps/quikchat/lib/server/storage/gcs.ts` — add the split-credential branch
In the `bucket()` method where `opts.credentials` / `opts.keyFilename` is assembled, add a branch for the split form. Keep the existing two forms; decide precedence to **match the other apps** (typically: inline JSON → split client_email/private_key → keyfile → ADC). Standard shape if you need it:
```js
} else if (process.env.GCS_CLIENT_EMAIL && process.env.GCS_PRIVATE_KEY) {
  opts.credentials = {
    client_email: process.env.GCS_CLIENT_EMAIL,
    private_key: process.env.GCS_PRIVATE_KEY.replace(/\\n/g, "\n"),
  };
}
```
(Use the **exact** newline/quote handling you found in step 0.) Update the file's doc-comment header to list the third credential form.

### 2. `apps/quikchat/lib/server/storage/index.ts` — teach `selectDriverName` the new form
`hasCreds` currently only checks `GCS_CREDENTIALS_JSON || GOOGLE_APPLICATION_CREDENTIALS`. Extend it so the split form also counts:
```js
const hasCreds = !!(
  env.GCS_CREDENTIALS_JSON ||
  env.GOOGLE_APPLICATION_CREDENTIALS ||
  (env.GCS_CLIENT_EMAIL && env.GCS_PRIVATE_KEY)
);
```
So `STORAGE_DRIVER` unset + `GCS_BUCKET` + split creds → auto-selects `gcs` (matching the other apps' zero-config-by-env behavior). `STORAGE_DRIVER=gcs`/`local` explicit override still wins.

### 3. Tests
- `lib/server/storage/gcs.test.ts` mocks `@google-cloud/storage` — ensure the new branch is covered (a case where only `GCS_CLIENT_EMAIL`/`GCS_PRIVATE_KEY` are set → `Storage` constructed with `credentials: { client_email, private_key }` and the `\n` un-escaped). Add the case if not present.
- `lib/server/storage/storage.test.ts` tests `selectDriverName` — add a case: `GCS_BUCKET` + `GCS_CLIENT_EMAIL` + `GCS_PRIVATE_KEY` (no `STORAGE_DRIVER`) → `"gcs"`.
- Keep all existing tests green.

## Constraints
- No new deps. `@google-cloud/storage` is already a dep (dynamic-imported in `gcs.ts`).
- Do NOT change the `StorageDriver` interface, the upload/download flow, `local.ts`, or `types.ts`.
- Do NOT touch `.env.local` (Suyash sets env). Do NOT change any other app.
- Pure additive change to credential resolution.

## Verification gate (Suyash runs, after "go")
1. `cd apps/quikchat && npx tsc --noEmit` → 0.
2. `npx vitest run` → previously 80 files / 492 tests; must stay green (test count may rise by the 1–2 cases you add — state the new expected number in your readback).
3. Suyash sets in `apps/quikchat/.env.local`: `STORAGE_DRIVER=gcs`, `GCS_BUCKET`, `GCS_PROJECT_ID`, `GCS_CLIENT_EMAIL`, `GCS_PRIVATE_KEY` (same values as another app), restarts quikchat, uploads a file in chat → object lands in the bucket under `quikchat/<orgId>/<channelId>/…`; the storage-driver log line reads `driver: gcs`.

## STOP HERE — readback required
Reply with:
1. What step-0 grep found — which app, and its **exact** `GCS_PRIVATE_KEY` handling (newline/quote), so QuikChat matches it verbatim. If nothing found, say so.
2. The precise `gcs.ts` branch you'll add + where in the precedence order, and the doc-comment update.
3. The `index.ts` `hasCreds` change.
4. The test case(s) you'll add and the new expected total test count.
5. Confirm no interface/flow/other-app/`.env` changes.

Wait for **"go"** before implementing.
