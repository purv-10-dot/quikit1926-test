<!--
Thanks for contributing. Fill out every section below.
PRs without a real description get rejected without review.
See docs/02-integration-protocol.md for the full submission protocol.
-->

## Summary

<!-- One paragraph: what does this PR do? Why? Don't paste the diff. -->

## Type of change

<!-- Check exactly one. -->

- [ ] feat — new functionality
- [ ] fix — bug fix
- [ ] chore — maintenance, dependency, docs, formatting
- [ ] refactor — code restructure with no behavior change

## Affected app

<!-- Which app does this change? feature branches almost always touch one app. -->

App: `apps/<your-app>/`

## Test plan

<!-- Bulleted list of how YOU verified this works. Mention browser steps for UI, curl commands for API, edge cases tested, etc. The reviewer should be able to reproduce. -->

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run test` passes
- [ ] Tested manually in browser at: <!-- e.g. localhost:3010/<route> -->
- [ ] Edge cases verified:
  - <!-- e.g. empty list, expired session, validation error -->

## Database / schema changes

<!-- Did you propose any new Prisma models or columns? -->

- [ ] No schema changes
- [ ] Schema changes proposed (describe below) — integration owner must approve before merge
  - <!-- e.g. add WidgetPost model with tenantId, name, status, createdAt, createdBy -->

## New dependencies

<!-- List any new top-level npm packages. Each one needs justification. -->

- [ ] No new dependencies
- [ ] New dependencies (justify):
  - `<package-name>@<version>` — <!-- why? what existing dep can't do this? maintenance status? -->

## Cross-app impact

<!-- Did you change anything in /packages/ or another app's directory? If yes, this is a cross-cutting change and needs extra scrutiny. -->

- [ ] No — change is fully contained inside `apps/<your-app>/`
- [ ] Yes — explain:
  - <!-- which package(s)? what changed? why couldn't it stay in your app? -->

## Tenant isolation checklist

<!-- For PRs that touch DB queries. -->

- [ ] N/A — no DB queries in this PR
- [ ] Every Prisma query filters by `tenantId`
- [ ] All API routes use `withTenantAuth` (or `requireAdmin` / `requireSuperAdmin`)
- [ ] No raw SQL with user input
- [ ] Sensitive fields (passwords, tokens) are not included in `select`/`include`

## Convention checklist

- [ ] No `as any` casts (or each one has a comment explaining why)
- [ ] `catch (error: unknown)` — not `catch (e: any)`
- [ ] API responses follow `{ success: true, data }` / `{ success: false, error }` shape
- [ ] Files named `lowercase.tsx` with `PascalCase` exports
- [ ] Provider order in `components/providers.tsx` unchanged (Session → Query → Theme)
- [ ] No commits to `dev`/`uat`/`main` directly
- [ ] No secrets, `.env.local`, OAuth credentials, or `DATABASE_URL` committed

## Screenshots / recordings

<!-- For UI changes, paste screenshots or screen recordings here. Required for any visible change. -->

## Anything else the reviewer should know?

<!-- Edge cases skipped for follow-up, design decisions you're unsure about, related PRs, etc. -->

---

🧙 Built with [Claude Code](https://claude.com/claude-code)
