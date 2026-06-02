# QuikTrack — Vercel Deployment Guide

This document describes how to deploy **only the `quiktrack` app** to Vercel as a preview (non-prod) deployment, the same way it was done previously.

> Scope: deploys a single app from the monorepo (no full-monorepo deploy, no production promotion).

---

## 1. Prerequisites

| Item | Check |
|---|---|
| Vercel CLI installed | `vercel --version` (current: `54.3.0`) |
| Logged into Vercel | `vercel whoami` — must return the team account that owns `quikit-quiktrack` |
| Project link present | [.vercel/project.json](.vercel/project.json) exists and points at: <br/>`projectId: prj_GPgvjAiBjNsQNgl1jjrvkEqChL0E` <br/>`orgId: team_NfFbI6n4pOZ88CXKkJsrBmeN` <br/>`projectName: quikit-quiktrack` |
| Working directory | `d:\Quikit_Core_12_5_26\QuikIT\apps\quiktrack` |
| `vercel.json` present | [vercel.json](vercel.json) — controls install + build from monorepo root |

If `.vercel/project.json` is missing, re-link first (see §6).

---

## 2. What gets deployed

Only the `quiktrack` app. The [vercel.json](vercel.json) does:

```json
{
  "framework": "nextjs",
  "installCommand": "cd ../.. && npm install",
  "buildCommand": "cd ../.. && npx turbo build --filter=quiktrack",
  "outputDirectory": ".next"
}
```

- `installCommand` hops to the monorepo root so the workspace install picks up `@quikit/ui`, `@quikit/auth`, `@quikit/database`, `@quikit/shared`.
- `buildCommand` uses Turbo's `--filter=quiktrack` so **only this app and its deps** are built — sibling apps (admin, quikscale, quiksocial, quikvc, quikconstruction, quikit, auth) are skipped.
- `outputDirectory: .next` matches `next build` output for the quiktrack workspace.

---

## 3. Deploy commands

Run from the **quiktrack app directory**, not the repo root.

### Preview deploy (recommended — non-prod)

```powershell
cd d:\Quikit_Core_12_5_26\QuikIT\apps\quiktrack
vercel
```

Add `--yes` to skip the link/confirm prompt:

```powershell
vercel --yes
```

This creates a unique preview URL (e.g. `quikit-quiktrack-<hash>-<team>.vercel.app`) and does **not** touch the production alias.

### Production deploy (only when explicitly requested)

```powershell
vercel --prod
```

> ❗ Do **not** run `--prod` unless explicitly asked. The root `CLAUDE.md` reserves prod for `main`-branch CI auto-deploys.

---

## 4. Environment variables

Vercel reads env vars from the project dashboard, **not** from your local `.env.local`. Before the first deploy, the following must be configured in the Vercel project (Settings → Environment Variables) for the `Preview` environment:

| Variable | Source / Notes |
|---|---|
| `DATABASE_URL` | Neon (or whichever cloud Postgres the integration owner provisioned for quiktrack preview). **Must NOT be a local `localhost` URL.** |
| `MIGRATION_DATABASE_URL` | Same value as `DATABASE_URL` for Prisma. |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` — generate once, reuse across redeploys. |
| `NEXTAUTH_URL` | The preview URL, e.g. `https://quikit-quiktrack-<hash>.vercel.app`. For a stable alias, set to the production alias and override per-deploy if needed. |
| `QUIKIT_CLIENT_ID` | OAuth client ID for SSO (from QuikIT launcher). |
| `QUIKIT_CLIENT_SECRET` | OAuth client secret. |
| `QUIKIT_ISSUER_URL` | Issuer URL of the QuikIT launcher (the auth app). |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional. Leave unset to skip Sentry. |
| `SENTRY_AUTH_TOKEN` | Optional. Only required if uploading source maps. |

### Secrets I (Claude) will need from you

If any of the below are not already set in the Vercel dashboard, please provide them so I can either (a) tell you exactly what to paste in the dashboard, or (b) set them via `vercel env add` if you authorize that:

1. **`DATABASE_URL`** for the quiktrack preview DB (Neon connection string).
2. **`MIGRATION_DATABASE_URL`** (usually identical to #1).
3. **`NEXTAUTH_SECRET`** (or say "generate one" and I'll produce one).
4. **`QUIKIT_CLIENT_ID`** + **`QUIKIT_CLIENT_SECRET`** for the OAuth client registered on the QuikIT launcher for this preview URL.
5. **`QUIKIT_ISSUER_URL`** (the launcher origin, e.g. `https://quikit.vercel.app`).

> Do **not** paste these into the chat as plain text if you'd rather set them yourself — just confirm they're already in the Vercel dashboard for the `Preview` environment.

### Setting env vars via CLI (optional)

```powershell
cd d:\Quikit_Core_12_5_26\QuikIT\apps\quiktrack
vercel env add DATABASE_URL preview
vercel env add NEXTAUTH_SECRET preview
# ...repeat per variable
```

---

## 5. Step-by-step deploy (preview)

```powershell
# 1. Make sure you're in the quiktrack app directory
cd d:\Quikit_Core_12_5_26\QuikIT\apps\quiktrack

# 2. Confirm Vercel link
type .vercel\project.json
# expect: projectName "quikit-quiktrack"

# 3. Confirm you're logged into the right Vercel account
vercel whoami

# 4. (Optional) pull the latest env config locally to verify
vercel env pull .env.vercel.preview --environment=preview

# 5. Deploy preview
vercel --yes
```

Output ends with a URL like:

```
✅  Production: https://quikit-quiktrack-<hash>-<team>.vercel.app [copied to clipboard]
```

(Despite the word "Production" in the CLI output for some versions, this is a preview deploy unless `--prod` is passed.)

---

## 6. Re-linking the project (only if `.vercel/` is missing)

```powershell
cd d:\Quikit_Core_12_5_26\QuikIT\apps\quiktrack
vercel link
# Choose the team that owns quikit-quiktrack
# Select existing project → quikit-quiktrack
```

This recreates `.vercel/project.json` with the IDs above.

---

## 7. Troubleshooting

| Symptom | Likely cause / Fix |
|---|---|
| `Error: Project not found` | Wrong Vercel team. Run `vercel switch` and pick the team matching `orgId: team_NfFbI6n4pOZ88CXKkJsrBmeN`. |
| Build fails on `prisma generate` | `MIGRATION_DATABASE_URL` not set. Add it in Vercel env vars (Preview scope). |
| Build fails on `@quikit/*` import not found | Vercel ran install in app dir instead of repo root. Verify [vercel.json](vercel.json) `installCommand` is `cd ../.. && npm install`. |
| Build runs other apps too | Verify `buildCommand` uses `--filter=quiktrack` — not just `turbo build`. |
| `NEXTAUTH_URL` mismatch / OAuth callback fails | The preview URL must be registered as an allowed redirect in the QuikIT OAuth client. Either use the stable preview alias or register the new preview URL. |
| `Module not found: @prisma/client` | The `prebuild` script (`prisma generate --schema=../../packages/database/prisma/schema.prisma`) didn't run. Vercel runs `npm run build`, which triggers `prebuild` automatically — verify the schema path resolves from the workspace. |

---

## 8. What's intentionally NOT in this guide

- **Production promotion** — handled by `main`-branch auto-deploy via Vercel's GitHub integration, not by this CLI flow.
- **Custom domains** — managed in the Vercel dashboard for the `quikit-quiktrack` project.
- **Database migrations** — run separately by the integration owner; this guide does not run `prisma migrate deploy`.
- **Other apps** (admin, quikscale, etc.) — each has its own `vercel.json` and its own Vercel project; deploy them from their own app directory the same way.

---

_Last updated: 2026-05-28_
