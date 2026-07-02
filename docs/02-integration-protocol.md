# Integration Protocol

How code goes from your laptop to production. Read this before opening your first PR.

## The chain of custody

```
your branch → CI in your repo → PR to master monorepo dev → CI in master → integration owner review → merge to dev → uat → main → Vercel
```

You drive everything up to "PR to master monorepo dev". The integration owner drives everything after the merge to dev.

## Step-by-step submission

### 1. Branch from `main` (or your repo's default branch)

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-description>
```

Branch name MUST start with `feature/`, `fix/`, `chore/`, or `refactor/`. CI rejects everything else.

### 2. Develop, commit, push

Standard git flow. Commit messages should be Conventional Commits format:

```
<type>(<scope>): <subject>

<optional body>
```

Examples:
- `feat(quiksocial): add campaign builder UI`
- `fix(quiksocial): debounce search input to avoid race`
- `chore(quiksocial): remove unused lodash dependency`
- `refactor(quiksocial): extract Modal into shared component`

### 3. Run the gate locally before pushing

```bash
cd apps/<your-app>
npm run lint
npm run typecheck
npm run test
```

If anything fails, fix it. The CI gates run the same commands; fixing locally is faster.

### 4. Push and open a PR

```bash
git push -u origin feature/<short-description>
```

GitHub will offer a "Compare & pull request" link. Use it. The PR target should be:

- **Base repository**: `<org>/QuikIT` (the master monorepo)
- **Base branch**: `dev`
- **Head repository**: your per-dev repo
- **Head branch**: `feature/<short-description>`

The PR template will be auto-loaded. Fill it out completely.

### 5. CI runs in the master monorepo

These checks run automatically on every PR:

| Check | What it does | Required to pass? |
|---|---|---|
| `lint` | ESLint on changed files | Yes |
| `typecheck` | `tsc --noEmit` on touched workspaces | Yes |
| `test` | Vitest in changed apps | Yes |
| `coverage-ratchet` | New coverage ≥ baseline | Yes |
| `build` | Next.js build of your app | Yes |
| `affected-apps` | Lists which apps will redeploy | Informational |
| `branch-name` | Validates `feature/`/`fix/`/etc | Yes |
| `commit-format` | Conventional Commits format | Yes |

If any required check fails, fix locally, push again. The PR auto-updates.

### 6. CODEOWNERS auto-requests review

The `.github/CODEOWNERS` file routes the PR to the integration owner. You don't need to manually request review.

### 7. Integration owner reviews

The integration owner reads:
- The PR description (yes, you have to write one — vague PRs get rejected).
- The diff (looking for: tenant isolation, conventions, scope creep, tests).
- CI status (must be green).
- Whether you actually solved the problem you said you'd solve.

Common reasons for rejection:
- New top-level dependency added without justification.
- Files in `packages/` modified.
- Prisma queries without `orgId` filter.
- `as any` cast without comment.
- `manifest.ts` changed after initial signoff.
- Missing tests for new API routes.
- Provider order changed.
- Breaking change to a shared package.

### 8. Iterate on review feedback

Push fixes to the same branch. The PR updates automatically. Don't open a new PR for review revisions.

### 9. Integration owner merges to `dev`

Squash-merge or merge-commit, depending on the integration owner's call. From here, it's out of your hands.

The PR can sit in `dev` for hours or days before promotion to `uat`. Don't ping every 4 hours; the integration owner runs the cycle.

### 10. You confirm production after deploy

When the integration owner promotes to `main`, Vercel deploys. The integration owner pings you. You run a smoke test on production:

- Sign in.
- Navigate to your app's main route.
- Try one create + one read.
- Confirm in a comment on the original PR.

## What gets rejected, immediately

- Direct push attempts to `dev`/`uat`/`main` (branch protection blocks them anyway).
- PRs with no description, or `Lorem ipsum` description.
- Touching `packages/` without prior agreement.
- Touching another app's directory.
- Skipping tests for new API routes.
- Skipping `orgId` filter on Prisma queries.
- Committing `.env.local`, secrets, OAuth credentials, or DATABASE_URLs.
- Bypassing pre-commit hooks (`--no-verify` flag).
- Disabling ESLint rules with `// eslint-disable-next-line` without a comment explaining why.

## What gets escalated

- Architectural questions ("should this be a new package?") — comment in your PR, integration owner responds.
- New dependency requests — same.
- Schema changes — same.
- Cross-app concerns ("my app needs data from quikscale") — same.

The escalation path is: PR comment → integration owner → if needed, the integration owner pulls in the architect (you, in this codebase, the same person).

## Async expectations

| What | When you should expect a response |
|---|---|
| Initial PR review | Within 1 working day |
| Re-review after changes | Within 1 working day |
| Architectural question | 1–3 working days |
| Schema change request | 2–5 working days |
| Production smoke-test ping | 0–2 working days after merge to main |

If you don't get a response in twice the expected time, ping in the team channel.

## What to do while you wait

While your PR is in review, **start your next feature on a fresh branch**. Don't sit idle — your next PR can be ready by the time the first lands.

Don't stack PRs (open PR-B that depends on PR-A still in review) unless the integration owner explicitly OKs it. Stacked PRs make review messy.

## Help, I'm stuck

If your PR has been open >5 working days with no movement and no rejection, ping in the team channel. The integration owner may have missed it. PRs get reordered when stale.

## Why this protocol exists

- **Quality**: junior devs ship more reliably with a strict gate.
- **Consistency**: 10 contractors writing 10 different code styles becomes a refactoring nightmare in month 6. The gate prevents that.
- **Security**: contractor exit doesn't compromise the platform — your access ends, your code stays clean.
- **Audit**: every change has a name, a reviewer, a timestamp.

It's not bureaucracy for its own sake. It's the price of working at scale with mixed teams.
