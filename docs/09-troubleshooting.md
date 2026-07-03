# Troubleshooting

Decision tree for the most common problems. Skim section headings first; jump to the matching one.

---

## Build / setup

### `npm install` fails with workspace errors

```
npm error code ERESOLVE
npm error ERESOLVE could not resolve
```

**Cause**: stale lockfile from a different Node version.

**Fix**:
```bash
rm -rf node_modules package-lock.json
nvm use 20
npm install
```

If still failing, check `node --version` is `v20.x` or higher.

### `npm run db:generate` fails with `EACCES` or `permission denied`

**Cause**: Prisma generates client into `node_modules/.prisma/client`. If you ran `npm` with `sudo` once, ownership got messed up.

**Fix**:
```bash
sudo chown -R $(whoami) node_modules
rm -rf node_modules/.prisma
npm run db:generate
```

### Build fails with `Cannot resolve '@quikit/ui'` (or any @quikit/*)

**Cause**: workspace symlinks broke. Usually after switching branches.

**Fix**:
```bash
rm -rf node_modules
npm install
npm run db:generate
```

If still broken: `cd packages/ui && npm run build` (or whichever package is missing).

### `dev` server starts but page is blank

**Cause**: probably a CSP violation or a runtime error caught by Next.js error boundary.

**Fix**:
1. Open browser DevTools → Console tab. Read the error.
2. If CSP-related ("Refused to load…"), check `apps/<your-app>/next.config.js` `Content-Security-Policy` header. Compare against `apps/admin/next.config.js`.
3. If it's a 500 from your app, check the dev-server terminal output for the stack trace.

---

## Authentication / session

### Sign-in redirects in a loop

**Cause**: `NEXTAUTH_URL` doesn't match the actual host:port.

**Fix**:
1. In `apps/<your-app>/.env.local`, set `NEXTAUTH_URL=http://localhost:<port>` matching your dev port.
2. Clear cookies for `localhost`.
3. Restart dev server.

### `useSession()` returns `undefined` forever

**Cause**: `<SessionProvider>` is missing from the provider tree, OR the route is rendering before hydration.

**Fix**:
1. Check `components/providers.tsx` exports `SessionProvider` wrapping the children.
2. If you're using `useSession` in a Server Component — you can't. Use `getServerSession()` from `next-auth/next` instead.

### `getServerSession` returns null in dev despite being signed in

**Cause**: NextAuth needs the JWT secret to verify the cookie. Different secret in `.env.local` means previously-signed cookies don't validate.

**Fix**:
1. Generate a stable secret: `openssl rand -base64 32`.
2. Set in `.env.local` and **don't change it** during dev.
3. Sign out + sign back in.

### "Invalid session token" or 500 from auth endpoint

**Cause**: usually a Prisma client mismatch. The auth flow reads from the `User` / `OrgMember` tables; if your local schema is out of date, the lookup fails. (Redis-backed session soft-revocation can also invalidate a session — see `docs/cache-management.md`.)

**Fix**:
```bash
npm run db:push    # syncs your local DB to current schema
npm run db:generate
```

---

## Database

### `Cannot find module '@prisma/client'` at runtime

**Cause**: Prisma client wasn't generated.

**Fix**:
```bash
npm run db:generate
```

### Migration error on first run: "database does not exist"

**Cause**: you skipped step 3 of getting-started.

**Fix**:
```bash
createdb quikit_dev
# or
psql -U postgres -c "CREATE DATABASE quikit_dev;"
```

### `connection refused` to Postgres on port 5432

**Cause**: Postgres isn't running.

**Fix on macOS** (Postgres.app): open Postgres.app, click "Start".
**Fix on Linux**: `sudo systemctl start postgresql`
**Fix on Docker**: `docker-compose up -d postgres` (if you've set up a compose file).

### "too many clients already"

**Cause**: connection pool exhausted. Common in dev when multiple test runs leak connections.

**Fix**:
1. Restart Postgres (kills all connections).
2. Long-term: lower Prisma's connection limit:
   ```
   DATABASE_URL="postgresql://user:pass@localhost:5432/quikit_dev?connection_limit=5"
   ```

### Prisma query returns rows from another org

**Cause**: you forgot the `orgId` filter. This is a critical security bug.

**Fix**:
1. Add `orgId` to every `where` clause.
2. Add a regression test (see `docs/07-testing.md` cross-org isolation pattern).
3. Audit every other query in the same route.

---

## Tests

### Vitest can't find `@/` imports

**Cause**: missing path alias in `vitest.config.ts`.

**Fix**: copy the `resolve.alias` block from `apps/_template/vitest.config.ts`.

### `document is not defined` in component test

**Cause**: missing jsdom environment directive.

**Fix**: add this as the first line of your test file:
```ts
// @vitest-environment jsdom
```

### Tests pass locally but fail in CI

**Common causes**:
1. **Timezone differences**: lock a timezone in `__tests__/setup.ts`:
   ```ts
   process.env.TZ = "Asia/Kolkata";
   ```
2. **Node version mismatch**: confirm CI uses Node 20 (it does, per `.github/workflows/ci.yml`).
3. **Test depends on order**: don't rely on test order. Use `beforeEach` to reset state.
4. **Test uses real fetch**: stub `global.fetch` in setup (already done in template).

### Coverage ratchet rejects PR

**Output**:
```
❌ Lines coverage dropped 0.42% (from 78.20% to 77.78%)
```

**Fix**:
- Add tests for the code you added (most common cause).
- Or, if the drop is genuine and intentional (deleted tested code), update the baseline:
  ```bash
  npm run test -- --coverage
  node scripts/coverage-ratchet.mjs apps/<your-app>/coverage/coverage-summary.json --update
  git add coverage-baseline.json && git commit -m "chore: ratchet coverage baseline"
  ```

---

## Linting / typecheck

### ESLint: `'any' is banned` (`@typescript-eslint/no-explicit-any`)

**Fix**: use a proper type. If genuinely unknown:
```ts
function handle(value: unknown) {
  if (typeof value === "string") return value.toUpperCase();
  // ...
}
```

If you absolutely need to cast (type system can't express it):
```ts
const data = result as unknown as MyType;
// Comment why a narrower path isn't possible.
```

### TS: `Property 'orgId' does not exist on type 'User'`

**Cause**: TypeScript doesn't see the augmented session type.

**Fix**: ensure `packages/auth/types.ts` is included in your `tsconfig.json`:
```json
"include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", "../../packages/auth/types.ts"]
```

(Already in `apps/_template/tsconfig.json` — verify it's still there in your app.)

### `tsc` runs forever / hangs

**Cause**: incremental cache corruption.

**Fix**:
```bash
rm -rf apps/<your-app>/tsconfig.tsbuildinfo
rm -rf apps/<your-app>/.next
npm run typecheck
```

---

## Git / PR

### Push rejected: `protected branch hook declined`

**Cause**: you tried to push to `main`, `uat`, or `dev`. Not allowed.

**Fix**: branch off and push to `feature/*`:
```bash
git checkout -b feature/<short-description>
git push -u origin feature/<short-description>
```

### `Branch name 'feature/X' invalid` from CI

**Cause**: probably a typo or unsupported prefix.

**Fix**: use exactly one of: `feature/`, `fix/`, `chore/`, `refactor/`. Lowercase. No special characters in the suffix beyond `-`.

### Commit message rejected by CI

**Cause**: not Conventional Commits.

**Fix**: amend the commit:
```bash
git commit --amend -m "feat(<your-app>): proper subject line"
git push --force-with-lease
```

---

## When to ask for help

If you've spent **30+ minutes** stuck on something not covered above:

1. **Search the codebase first**: `grep -r "<error message>" apps/quikscale apps/admin packages/`. The same error has often been seen before.
2. **Check `docs/`**: especially `02-integration-protocol.md` and `08-claude-code-setup.md`.
3. **Ask in the team channel** with: the error message, what you tried, and the relevant file paths.

Don't sit stuck for hours. The integration owner would rather field one question now than receive a broken PR tomorrow.

---

## See also

- `/docs/00-getting-started.md` — initial setup steps.
- `/docs/02-integration-protocol.md` — what gets rejected at PR review.
- `/docs/07-testing.md` — test conventions.
- `/CLAUDE.md` — repo-wide rules.
