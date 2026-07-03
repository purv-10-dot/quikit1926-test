# Claude Code Setup

How to use Claude Code (or any LLM coding assistant) effectively on this codebase. The repo is heavily annotated for LLMs — this page tells you how to wire it up.

## The hierarchy of rules

Claude Code reads these files automatically when you open a project:

```
1. /CLAUDE.md                          ← repo-wide rules (most permissive)
2. /apps/<your-app>/CLAUDE.md          ← app-specific (stricter, overrides root)
3. /docs/                              ← reference content (loaded on demand)
4. /docs/exemplars/                    ← canonical example code to copy
```

**Rule of conflict**: the more specific file wins. If your app's CLAUDE.md says "no new packages" and the root CLAUDE.md is silent on the topic, your app's rule wins.

If Claude is suggesting code that violates a rule in any of these files, **stop and re-prompt** with the rule cited. Don't accept the suggestion.

## First-time setup in your repo

When you clone your per-dev repo, do this once:

### 1. Confirm Claude reads `CLAUDE.md`

Claude Code auto-loads `CLAUDE.md` at the repo root and any `CLAUDE.md` in the working directory. After cloning:

```bash
cd ~/Code/<your-app>
claude  # or open Claude Code from your editor
```

Ask Claude:
> "Show me the rules from this repo's CLAUDE.md and from apps/<your-app>/CLAUDE.md."

It should respond with both. If it doesn't, the files aren't loading correctly — check that they exist (they should; the template ships them).

### 2. Bootstrap your `.claude/` directory

Optional but recommended. Create:

```
.claude/
├── settings.json
└── skills/
    └── (custom skills you build later)
```

A starter `settings.json` for this repo:

```json
{
  "tools": {
    "allowed": [
      "Bash(npm run *)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(git branch *)",
      "Bash(git checkout *)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(npx tsc *)",
      "Bash(npx vitest *)",
      "Read",
      "Edit",
      "Write",
      "Grep",
      "Glob"
    ],
    "blocked": [
      "Bash(git push *)",
      "Bash(git push origin main *)",
      "Bash(git push origin uat *)",
      "Bash(git push origin dev *)"
    ]
  }
}
```

The `blocked` list prevents your local Claude from pushing to `main`/`uat`/`dev`. Branch protection on the master monorepo will block this anyway, but local-blocking saves a confusing error.

## Effective prompting on this codebase

Claude is good at this codebase **if** you give it the right anchors. Bad prompts produce generic code that fails review. Good prompts cite the rules.

### Bad prompt (generic, gets rejected)

> Add an API route for creating a campaign.

What Claude might produce: a route with no auth wrapper, no Zod, no `orgId` filter, raw `req.body` parse, no audit log. Rejected at PR.

### Good prompt (cites the rules)

> Add a POST /api/campaigns route in apps/quiksocial that creates a Campaign.
>
> Follow the canonical pattern from docs/exemplars/api-route.example.ts:
> - Wrap with withOrgAuth (the app's lib/api wrapper) and scope every query by orgId
> - Validate body with Zod (fields: name string min 1 max 200, scheduledFor optional ISO date, channels array of "twitter" | "linkedin" | "facebook")
> - Use a transaction for create + auditLog write
> - Return 201 on success
>
> The Campaign Prisma model already exists.
> Write the route + a test file at __tests__/api/campaigns.test.ts following docs/07-testing.md.

What Claude produces: a route that passes review on the first try.

### Even better — paste the rule fragment

If Claude is making the same mistake repeatedly, paste the relevant rule directly:

> From apps/quiksocial/CLAUDE.md:
> > Use `as any` is BANNED. ESLint flags this as an error.
>
> Rewrite this without `as any`. Use `as unknown as <NarrowType>` only as a last resort with a comment explaining why.

## What Claude is good at on this repo

- Adding new API routes following the exemplar.
- Writing Prisma queries with the right `orgId` filter.
- Building React components from `@quikit/ui` primitives.
- Writing Vitest tests following the existing pattern.
- Refactoring existing files when given clear constraints.
- Fixing TypeScript errors.

## What Claude is NOT good at (without help)

- **Schema changes**: don't let Claude edit `packages/database/prisma/schema.prisma`. Always file a request via PR description and wait for the integration owner.
- **Cross-app patterns**: Claude can't see other apps from your per-dev repo. If you ask "how does quikscale handle this?", it doesn't know. Use docs/exemplars/.
- **Org isolation reasoning**: Claude follows the pattern when shown but doesn't always derive the rule from first principles. **Always review queries for the `orgId` filter yourself.**
- **Branch protection**: Claude will try to push to main if you ask it to. Branch protection blocks it; the blocked-tools list in `settings.json` blocks it earlier. Belt + braces.

## Useful prompts to keep around

Save these as snippets in your editor:

### "Add a new API route"
> Add an API route at apps/<your-app>/app/api/<resource>/route.ts following docs/exemplars/api-route.example.ts. Methods: <GET, POST, PATCH, DELETE>. Schema: <…>. Add a test file at __tests__/api/<resource>.test.ts covering 401 + tenant isolation + happy path per docs/07-testing.md.

### "Add a new component"
> Add a <ComponentName /> at apps/<your-app>/components/<filename>.tsx using @quikit/ui primitives only. Follow docs/05-frontend-patterns.md. Use `cn()` for class merging. No inline styles. Use accent-* classes for branded interactive elements; hardcoded colors only for semantic states.

### "Review this for review"
> Before I open a PR, review my changes against:
> - apps/<your-app>/CLAUDE.md hard "do not" list
> - docs/03-api-patterns.md (if I touched API routes)
> - docs/04-db-patterns.md (if I touched Prisma queries)
> - docs/05-frontend-patterns.md (if I touched UI)
>
> Flag anything that would get rejected at review.

### "Why is this build failing?"
> The CI build is failing on <step>. Here's the error:
> <paste error>
>
> Check docs/09-troubleshooting.md for known issues. If it's not there, diagnose from the codebase.

## What to do when Claude is wrong

If Claude suggests something that violates a rule:

1. **Don't accept the suggestion.** Even small "trivial" rule violations stack up across 10 contributors.
2. **Re-prompt with the rule.** Cite the file + section.
3. **Tell the integration owner if Claude is consistently wrong** about something — it usually means CLAUDE.md needs an explicit rule.

The CLAUDE.md files in this repo are living documents. When you find an LLM blind spot, the integration owner adds a rule.

## Skills you'll commonly want

The repo doesn't ship custom skills (yet). If you build helpful workflows for your domain — e.g., "scaffold a campaign template" — drop them in `.claude/skills/` and propose upstreaming via PR.

## Common mistakes Claude makes (watch for these)

| Pattern Claude defaults to | What you should say |
|---|---|
| `db.widget.findMany({ where: { id } })` | "Add orgId to every where clause." |
| `try { ... } catch (e: any)` | "Use `catch (error: unknown)` per CLAUDE.md." |
| `// @ts-ignore` to silence errors | "Don't suppress errors. Fix the underlying type." |
| Hand-rolled `<Modal>` instead of @quikit/ui | "Use Modal from @quikit/ui." |
| `useEffect(() => fetch(...))` | "Use React Query (`useQuery` from @tanstack/react-query)." |
| Inline brand colors `bg-blue-500` for buttons | "Use accent-* classes for branded UI; blue is for semantic data states only." |
| Adding new top-level deps without justification | "Don't add deps without justification — the PR template requires it." |

## See also

- `/CLAUDE.md` — repo-wide rules.
- `/apps/<your-app>/CLAUDE.md` — app-specific rules (override root).
- `/docs/02-integration-protocol.md` — what gets rejected at PR review.
- `/docs/exemplars/` — annotated reference code.
