# Getting Started — Day One

Welcome. This guide gets you from "I have my repo URL" to "my app runs locally + I've submitted my first PR" in about 60 minutes.

## What you need before you start

- macOS, Linux, or WSL2 on Windows.
- Node.js 20+ (`node --version` should print `v20.x` or higher).
- npm 11+ (ships with Node 20).
- PostgreSQL 14+ running locally (Postgres.app on macOS, or Docker — both fine).
- Git.
- A GitHub account that has been added to the integration owner's org.
- Claude Code (recommended for this codebase) or your editor of choice.

## 1. Clone your per-dev repo

The integration owner has created a repo for you under the org. The URL looks like:

```
https://github.com/<org>/<your-app>-dev-<your-name>
```

Clone it:

```bash
git clone <your-repo-url> ~/Code/<your-app>
cd ~/Code/<your-app>
```

Your repo is a slimmed-down copy of the master monorepo. You can see:

- `apps/<your-app>/` — your app (initially the `_template` renamed to your app id).
- `packages/` — read-only shared code (`@quikit/ui`, `@quikit/database`, `@quikit/auth`, `@quikit/shared`). **Do not modify these.**
- `docs/` — this directory.
- `CLAUDE.md` — root-level conventions.

You do **not** see other apps (quikscale, quikit, admin). That's by design.

## 2. Install dependencies

```bash
npm install
```

This installs npm workspaces. The first run takes 2–3 minutes.

## 3. Set up your local Postgres

Create a database for your app:

```bash
createdb quikit_dev
```

(If `createdb` isn't on your PATH, use `psql -U postgres -c "CREATE DATABASE quikit_dev;"`.)

## 4. Configure environment variables

```bash
cp apps/<your-app>/.env.example apps/<your-app>/.env.local
```

Open `apps/<your-app>/.env.local` and set:

- `DATABASE_URL` — your local Postgres URL. Example: `postgresql://postgres:postgres@localhost:5432/quikit_dev`.
- `MIGRATION_DATABASE_URL` — same value.
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`.
- `NEXTAUTH_URL` — `http://localhost:<your-port>` (default `3010`, or whatever you set in `package.json`).
- `QUIKIT_CLIENT_ID` / `QUIKIT_CLIENT_SECRET` / `QUIKIT_ISSUER_URL` — leave the placeholder values. The integration owner provides real credentials at integration time.

**Never commit `.env.local`.** It's in `.gitignore`.

## 5. Apply the database schema

```bash
npm run db:push
```

This pushes the existing Prisma schema (from `packages/database/prisma/schema.prisma`) into your local Postgres. You haven't added any models yet — that's covered in `04-db-patterns.md`.

## 6. Run the dev server

```bash
cd apps/<your-app>
npm run dev
```

Open `http://localhost:<your-port>`. You should see the placeholder home page from the template. If middleware redirects you to `/login`, that's expected — the SSO flow won't work locally without real OAuth credentials. For now, you can:

- Skip auth in dev by temporarily commenting out the middleware (re-enable before commit), or
- Set up a local NextAuth dev session using credentials provider (see `08-claude-code-setup.md` Batch 3).

## 7. Run the tests

```bash
cd apps/<your-app>
npm run test
npm run typecheck
npm run lint
```

All three must pass before you commit. CI will run them on every PR — failing locally first wastes everyone's time.

## 8. Make your first change

Open `apps/<your-app>/app/(dashboard)/page.tsx`. Change the welcome heading. Save.

The dev server hot-reloads. Verify your change in the browser.

## 9. Commit and push

```bash
git checkout -b feature/<short-description>
git add apps/<your-app>/app/\(dashboard\)/page.tsx
git commit -m "feat(<your-app>): change welcome heading"
git push -u origin feature/<short-description>
```

**Branch naming**: `feature/*`, `fix/*`, `chore/*`, or `refactor/*`. Anything else gets rejected by CI.

## 10. Open your first PR

GitHub will show a "Compare & pull request" prompt after the push. Click it. The PR should be:

- **From**: `feature/<your-branch>` on your repo
- **To**: `dev` on the master monorepo

Fill out the PR template (auto-loaded). Submit.

CI runs (lint + typecheck + test + coverage ratchet). If any fail, fix locally and push again.

When CI is green, the integration owner reviews. They merge to `dev` when ready. From there it goes to `uat` then `main` on a periodic promotion cycle (you don't drive these promotions).

## What to read next

- `01-architecture.md` — what the monorepo looks like + what you own.
- `02-integration-protocol.md` — full submission flow + what gets rejected.
- `apps/<your-app>/CLAUDE.md` — the must-not-do list for this specific app.
- `apps/<your-app>/app/api/example/route.ts` — copy this when adding API routes.

## When you get stuck

- **Build errors mentioning `@quikit/*`**: run `npm run db:generate` then `npm install` again.
- **TypeScript errors about missing models**: the example route references a `widget` model that doesn't exist. Either add it to the Prisma schema (with the integration owner's approval) or delete the example route.
- **Auth redirect loop**: clear localStorage + cookies for `localhost`. Check `NEXTAUTH_URL` matches your port.
- **Anything else**: ask in the team channel. Don't sit stuck for more than 30 minutes.

## What NOT to do

- Don't create your own GitHub repo and push there. Your repo is provisioned for you.
- Don't add commits directly to `dev`, `uat`, or `main` — those branches are off-limits.
- Don't modify `packages/`. They're owned by the integration team.
- Don't commit `.env.local`, secrets, or anything from `node_modules`.
- Don't run `npm install <package>` without checking with the integration owner. Each new top-level dep needs a justification.
