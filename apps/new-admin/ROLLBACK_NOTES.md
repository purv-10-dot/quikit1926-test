# Port-Swap Rollback Notes

A temporary port swap was applied so admin-next now serves the routes
previously served by `apps/admin` on port `3002`. **`apps/admin/` is
intact** — its source files were not modified except for two lines in
`apps/admin/package.json` that wrap its `dev` and `start` scripts in a
"DISABLED" stub.

To return everything to the pre-swap state, follow the **four reversal
edits** below. Each is a single one-line swap.

---

## What was changed

| # | File | Field | Old | New |
|---|------|-------|-----|-----|
| 1 | `apps/admin/package.json` | `scripts.dev` | `"next dev -p 3002"` | `"node -e \"console.log('[admin] SKIPPED ...')\""` (exits 0 so turbo dev keeps going) |
| 1 | `apps/admin/package.json` | `scripts.dev:original` | (didn't exist) | `"next dev -p 3002"` |
| 2 | `apps/admin/package.json` | `scripts.start` | `"next start -p 3005"` | `"node -e \"console.log('[admin] SKIPPED ...')\""` (exits 0) |
| 2 | `apps/admin/package.json` | `scripts.start:original` | (didn't exist) | `"next start -p 3005"` |
| 3 | `apps/new-admin/package.json` | `scripts.dev` | `"next dev -p 3007"` | `"next dev -p 3002"` |
| 3 | `apps/new-admin/package.json` | `scripts.start` | `"next start -p 3007"` | `"next start -p 3005"` |
| 4 | `apps/new-admin/.env.local` | `NEXTAUTH_URL` | `http://localhost:3007` | `http://localhost:3002` |
| 4 | `apps/new-admin/.env.local` | `APP_URL` | `http://localhost:3007` | `http://localhost:3002` |
| 5 | `apps/new-admin/next.config.js` | `serverActions.allowedOrigins` | `["localhost:3007"]` | `["localhost:3002", "localhost:3005"]` |

---

## Reversal procedure

### Step 1 — `apps/admin/package.json`

In the `scripts` block:

- Delete the `dev` entry that contains `DISABLED`.
- Rename `dev:original` → `dev`.
- Delete the `start` entry that contains `DISABLED`.
- Rename `start:original` → `start`.

After reversal the `scripts` block should look like (matching the original):
```json
"scripts": {
  "dev": "next dev -p 3002",
  "prebuild": "prisma generate --schema=../../packages/database/prisma/schema.prisma",
  "build": "next build",
  "start": "next start -p 3005",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
},
```

### Step 2 — `apps/new-admin/package.json`

Restore the dev/start ports:
```json
"dev": "next dev -p 3007",
"start": "next start -p 3007",
```

### Step 3 — `apps/new-admin/.env.local`

Change both occurrences of `3002` back to `3007`:
```env
NEXTAUTH_URL="http://localhost:3007"
APP_URL=http://localhost:3007
```

### Step 4 — `apps/new-admin/next.config.js`

Change `allowedOrigins`:
```js
allowedOrigins: ["localhost:3007"],
```

### Step 5 — verify

```bash
npm install               # only needed if you changed deps
cd apps/admin    && npx tsc --noEmit
cd apps/new-admin && npx tsc --noEmit
# both should exit 0
```

After reversal, `apps/admin` returns to serving `:3002` (dev) / `:3005`
(start), and `apps/new-admin` returns to `:3007`.

---

## Background — why this works

OAuth callbacks: the QuikIT IdP registers `apps/admin`'s client (`client_id:
"admin"`) with the callback URL `http://localhost:3002/api/auth/callback/quikit`.
While the port swap is active, admin-next runs on `:3002` using the **same
`QUIKIT_CLIENT_ID="admin"`** — so the OAuth round-trip succeeds without any
IdP-side change.

Both `apps/admin/.env.local` and `apps/new-admin/.env.local` point at the
same Postgres database (`quikit_dev`) and the same QuikIT IdP, so admin-next
sees the same orgs/members that `apps/admin` did.
