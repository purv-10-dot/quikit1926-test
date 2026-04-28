# QuikIT Documentation

Reference + onboarding for the QuikIT monorepo. Read in the order below if you're new; jump to specific docs as questions come up.

## Reading order

### Day 1 — get running
1. [00-getting-started.md](./00-getting-started.md) — clone → env → first PR (60 min)
2. [01-architecture.md](./01-architecture.md) — repo layout + multi-tenancy + branch flow
3. [02-integration-protocol.md](./02-integration-protocol.md) — submission protocol + CI gates + rejection criteria

### Day 2 — start writing code
4. [03-api-patterns.md](./03-api-patterns.md) — canonical route shape + auth + Zod + audit
5. [04-db-patterns.md](./04-db-patterns.md) — Prisma rules + tenant isolation + schema-change request format
6. [05-frontend-patterns.md](./05-frontend-patterns.md) — `@quikit/ui`, accent theming, server vs client, forms

### Reference (load when needed)
7. [06-shared-packages.md](./06-shared-packages.md) — `@quikit/auth`/`/database`/`/ui`/`/shared` import map
8. [07-testing.md](./07-testing.md) — Vitest + Playwright + coverage ratchet
9. [08-claude-code-setup.md](./08-claude-code-setup.md) — using Claude Code on this codebase
10. [09-troubleshooting.md](./09-troubleshooting.md) — symptom → cause → fix decision tree
11. [10-glossary.md](./10-glossary.md) — domain language (OPSP, KPI, Rocks, etc.)

### Annotated reference code
- [exemplars/api-route.example.ts](./exemplars/api-route.example.ts) — full GET/POST + audit + transaction
- [exemplars/prisma-list-query.example.ts](./exemplars/prisma-list-query.example.ts) — 4 list patterns + anti-patterns
- [exemplars/prisma-detail-query.example.ts](./exemplars/prisma-detail-query.example.ts) — find/update/soft-delete + audit
- [exemplars/component-with-auth.example.tsx](./exemplars/component-with-auth.example.tsx) — server + client split + React Query + `@quikit/ui`

## By role

### "I'm a new dev starting today"
Read in this order: 00 → 01 → 02 → app's `CLAUDE.md` → 03 → 04 → 05.
Bookmark: 09 (troubleshooting) for when you get stuck.

### "I'm using Claude Code on this repo"
Start at: 08 (Claude setup) → root `CLAUDE.md` → app's `CLAUDE.md` → exemplars.
The exemplars exist precisely so Claude has canonical patterns to copy.

### "I'm the integration owner reviewing PRs"
Use: 02 (rejection criteria) + `scripts/integrate-app.sh` for the automated parts.
Update: when you spot a recurring blind spot, add a rule to `CLAUDE.md` so the next 10 PRs don't repeat it.

### "I just need to understand a term"
[10-glossary.md](./10-glossary.md). Add new terms via PR.

## Updating these docs

The docs live in the master monorepo. Updates require:
1. PR from a feature branch to `dev`.
2. CODEOWNERS routes the review to the integration owner.
3. Standard merge train: `feature/* → dev → uat → main`.

Doc changes don't trigger Vercel deploys — they're free to ship frequently. When a rule is unclear, fix the doc; don't repeat the explanation in 10 PR comments.

## What's NOT in `/docs/`

| What | Where instead |
|---|---|
| Repo-wide LLM rules | `/CLAUDE.md` |
| App-specific LLM rules | `/apps/<app>/CLAUDE.md` |
| Prisma schema | `/packages/database/prisma/schema.prisma` |
| Sample app | `/apps/_template/` |
| Onboarding script | `/scripts/onboard-dev.sh` |
| Integration script | `/scripts/integrate-app.sh` |
| CI workflows | `/.github/workflows/` |
| PR template | `/.github/PULL_REQUEST_TEMPLATE.md` |
| CODEOWNERS | `/.github/CODEOWNERS` |
