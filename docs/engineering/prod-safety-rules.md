# Prod-safety rules

**One rule, automated.** No localhost / 127.0.0.1 references in runtime source code outside the allowlist.

This exists because we've been burned by `|| "http://localhost:..."` silent defaults surviving to production. Automation catches what memory doesn't.

---

## The gate

- **Script:** [`scripts/check-prod-urls.mjs`](../../scripts/check-prod-urls.mjs) — pure Node, no dependencies.
- **CI:** [`.github/workflows/prod-safety.yml`](../../.github/workflows/prod-safety.yml) runs on every PR and push to `main` / `uat` / `dev`. Fails the workflow on violation.
- **Local (optional):** `.husky/pre-push` runs the same script before you push to `main`.

Run locally any time:

```bash
node scripts/check-prod-urls.mjs         # exits non-zero on violation
node scripts/check-prod-urls.mjs --list   # print violations, exit 0
```

---

## What counts as a violation

Any source file matches one of:

- `http://localhost`
- `https://localhost`
- `127.0.0.1`
- `localhost:<digits>` (schemeless)

**…outside an allowlisted file type or line pattern.**

---

## What's allowlisted

**By path** (the full list is in `SKIP_DIRS` / `SKIP_FILES` / `SKIP_PATTERNS` at the top of the script):

- Test files (`__tests__/`, `*.test.*`, `*.spec.*`)
- All env variants (`.env`, `.env.local`, `.env.example`, `.env.local.example`)
- Playwright configs (target the dev server on purpose)
- Markdown docs (setup guides show local URLs)
- Prisma schema (column comments contain examples)
- GitHub Actions workflows (use local Postgres in CI)
- `.claude/` (developer-only settings)
- `scripts/load-test.mjs` (deliberately targets localhost)
- Lockfiles, `node_modules/`, `dist/`, `.next/`, `coverage/`, `.turbo/`, `.vercel/`

**By line content** (`LINE_ALLOW`):

- Comment lines (`//`, `/**`, `*`, `#`)
- Next.js `allowedOrigins: ["localhost:XXXX"]` for server actions
- Lines containing the escape-hatch marker `prod-safety-allow`

---

## The right way to handle an env-var-driven URL

Use `requireProdEnv` from `@quikit/shared/env`:

```ts
import { requireProdEnv } from "@quikit/shared/env";

// Throws in production if APP_URL is unset; returns the dev fallback otherwise.
const APP_URL = requireProdEnv("APP_URL", "http://localhost:3001");
```

In production, if the env var is missing, the app fails **loud** instead of silently serving a broken URL. In dev / preview without the env var set, you get the fallback and everything works.

If the value is required at module load but the module might get imported without the env var (e.g., a module that exports multiple functions, only one of which needs the URL), resolve lazily:

```ts
function appUrl(): string {
  return requireProdEnv("APP_URL", "http://localhost:3001");
}

// later
const acceptUrl = `${appUrl()}/invitations/accept?token=${token}`;
```

This way the throw only fires if the code path is actually reached.

---

## The escape hatch — use sparingly

If you have a legitimate reason to ship `localhost` in a source file **and** you've guarded it elsewhere (e.g., inside an `if (NODE_ENV !== 'production')` block, or in a console.log that only prints dev instructions), add `prod-safety-allow` in a comment on that line:

```ts
return "http://localhost:3000"; // prod-safety-allow: guarded by NODE_ENV above
```

The marker is intentionally ugly so it shows up in code review.

**Not allowed escape-hatch uses:**

- ❌ Silencing a legitimate prod bug you don't want to fix yet
- ❌ Marking a line "dev-only" without actually guarding it
- ❌ Using it inside a client component where the fallback ships to the browser

When you use the marker, add a code-review comment explaining why.

---

## How to widen the allowlist (rare)

If you add a new class of legitimate localhost-containing file — e.g., a new kind of config file, or a vendored dev tool — you may need to extend the gate.

1. Open [`scripts/check-prod-urls.mjs`](../../scripts/check-prod-urls.mjs).
2. Add to `SKIP_DIRS` (directory basename) or `SKIP_FILES` (exact relative path) or `SKIP_PATTERNS` (regex on relative path).
3. Run `node scripts/check-prod-urls.mjs` locally to confirm.
4. In the PR description, explain why the new entry is safe.

Every allowlist entry is a place the rule stops protecting. Keep it tight.

---

## How to widen the pattern (even rarer)

If we want to catch more prod-safety violations beyond localhost — e.g., hard-coded internal IPs, dev-only API keys, test-only URLs — extend `PATTERN` in the script. Every addition should come with at least one real bug it would have caught.

For now: **one rule, narrow and reliable** is better than ten rules that people disable.

---

## What this rule does NOT catch (yet)

- Missing env vars at runtime: use `requireProdEnv` to fail fast.
- Cross-origin redirect validation: different concern, tracked separately.
- Secrets in source: use Vercel env vars + `.gitignore` for `.env.local`.
- Dev-only dependencies imported in prod code: out of scope.

---

## What to do if the gate fails your PR

Read the output. Every violation is a file:line:source-line. Three actions:

1. **Real prod bug** → fix it. Use `requireProdEnv` for env-driven URLs; move hard-coded URLs to env vars.
2. **False positive in a file that should be allowlisted** → extend `SKIP_*` in the script, justify in your PR.
3. **False positive on a single line that's genuinely guarded elsewhere** → add `// prod-safety-allow: <why>` to that line.

---

## Historical context

The gate was added on 2026-04-17 after an OAuth-on-Vercel incident: a `|| "http://localhost:3000"` fallback survived through CI, through `/.well-known/openid-configuration`, and into every signed id_token's `iss` claim, breaking SSO for real users. See the OAuth fixes on `main` commits `d3dfc3a` and around it.

Sixteen other localhost fallbacks were found by the initial audit and fixed in the same PR that introduced the gate. The gate now prevents that regression shape from landing again.
