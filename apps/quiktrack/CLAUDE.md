# App-Level Claude Rules

These rules are STRICTER than the root `/CLAUDE.md`. They apply only inside this app's directory and override anything more permissive at the root.

The integration owner (architect) reviews every PR. Code that violates these rules will be rejected.

## Hard "do not" list

You may NOT do any of the following without the integration owner's explicit written approval in the PR:

1. **Create new packages** under `packages/`. You depend on existing `@quikit/*` packages — you do not extend them.
2. **Modify any file under `packages/`**. They are submodules / shared code owned by the integration team. If you need a feature in `@quikit/ui`, file a request in your PR description and use a local copy as a temporary workaround marked with `// TODO(integration): replace with @quikit/ui when X is added`.
3. **Add new top-level dependencies** to `package.json` beyond what the template ships with. Justify any addition in the PR description with: (a) the problem, (b) why an existing dep can't solve it, (c) maintenance status of the new dep.
4. **Bypass `withOrgAuth`** (this app's `lib/api/` wrapper over the `@quikit/auth` guard factories) on any DB-touching API route. There are no exceptions outside `/api/health` and `/api/auth/*`.
5. **Write Prisma queries without an `orgId` filter**. The scoping column is `orgId` (the legacy `tenantId` was renamed org-wide). The only legitimate cross-org query is on the super-admin app — and you are not building that.
6. **Use `as any`** anywhere. ESLint flags this as an error; don't disable the rule. If you genuinely need an escape hatch, use `as unknown as <NarrowType>` and write a comment explaining why.
7. **Create files in non-canonical locations**. Routes go in `app/`. Reusable components go in `components/`. Server-only utilities go in `lib/`. Tests go in `__tests__/`. Don't invent new top-level directories.
8. **Reorder providers** in `components/providers.tsx`. The order `SessionProvider → QueryClientProvider → ThemeProvider` is fixed across all apps.
9. **Modify `manifest.ts`** after the integration owner has approved your initial manifest. Permissions, route prefix, and appId are part of the platform contract.
10. **Commit `.env`, `.env.local`, secrets, OAuth credentials, or DATABASE_URLs**. The repo's `.gitignore` blocks most of this — don't fight it.

## Hard "must do" list

1. **Use `@quikit/ui` components** for buttons, inputs, modals, tables, cards. Don't reinvent. If a component is missing, copy the closest analog from `@quikit/ui`'s source as inspiration but rebuild it inside this app's `components/` (clearly marked `// TODO(integration): upstream to @quikit/ui`).
2. **Use accent-* Tailwind classes** for branded interactive elements (buttons, focus rings, active tabs). Use hardcoded colors (`bg-blue-500`, `bg-red-500`, etc.) only for semantic states (success/warning/error/data). See root `CLAUDE.md` "Accent Color System" for the full rule.
3. **Match file naming**: directories `lowercase`, component files `lowercase.tsx`, exports `PascalCase`. The CLAUDE.md root file lists this — don't deviate.
4. **Catch `(error: unknown)`** in every try/catch — never `(e: any)`. Cast through `instanceof Error` to access `.message`.
5. **Return `{ success: true, data }` or `{ success: false, error }`** from every API route. Same shape, every time.
6. **Write tests for every new API route**: 401 unauthenticated, org-isolation (cross-org rejected), happy path. See `/docs/07-testing.md`.
7. **Run `npm run typecheck && npm run lint && npm run test`** before every commit. CI runs these too — don't make CI tell you what local tools could.
8. **Keep components under 300 lines.** When a `.tsx` (or any single-component file) crosses 300 LOC, split it: extract sub-components into sibling files under the same `_components/` (or `components/`) folder, lift purely-static config to a sibling `*-meta.ts`, and put non-trivial pickers/popovers in their own files. The 300 line ceiling is the *whole file*, including imports — readability wins over clever consolidation.

## When in doubt

Read `/docs/02-integration-protocol.md` for how to ask for an exception. Don't guess. Don't ship a "creative" solution that breaks platform invariants.

## Things you can freely do

- Add routes under `app/` following the `(dashboard)/...` pattern.
- Add components under `components/` following the existing examples.
- Add domain types under `types/` (create the directory if needed).
- Add tests under `__tests__/` matching the existing structure.
- Add Prisma models — but **discuss the schema with the integration owner first** in your PR description. Migrations land separately from app code.
- Use any free, well-maintained npm package that is not duplicating existing functionality (still requires PR justification).

## Your dev environment is local-only

You're using local Postgres + a local NextAuth dev session. The integration owner moves your app to Neon during integration. Don't try to wire your app to a cloud DB yourself — your access tokens won't work, and the integration owner won't be amused.

## How Claude Code should work in this repo

- The root `CLAUDE.md` is the source of truth for monorepo-wide rules.
- This file (`apps/<your-app>/CLAUDE.md`) is the source of truth for app-level rules.
- When the two conflict, **this file wins**.
- The exemplar files under `/docs/exemplars/` (added in Batch 2) are canonical patterns. Copy them, don't invent.
- If your Claude is suggesting code that violates any rule above, **reject the suggestion and re-prompt** with the rule cited.

---

## AI Runtime Integration (Quikverse AI Team)

> Added by Suyash (AI team lead). QuikPMS is not yet integrated with the AI Runtime. This section tells Kanishka what to expect and what rules apply when AI integration work begins. No immediate action required — discuss with Suyash in `#ai-integration` before starting any AI work.

### Must do — AI

8. **Use `@quikit/ai-sdk` for every AI call** — `npm install @quikit/ai-sdk`. Never call Gemini, OpenAI, Anthropic, or Mistral SDKs directly. Never use raw `fetch()` to the AI Runtime URL. This is the same class of rule as "use `@quikit/ui` for components" — the SDK is the only sanctioned path.

9. **Implement `withFallback()` on every AI-powered screen** — QuikPMS must function when AI is down. No exceptions.

10. **Pass `useCase` on every `execute()` call** — required for cost tracking, audit, and routing. A call without a `useCase` will be rejected.

11. **Use `MockAI` from `@quikit/ai-sdk` in all tests** — no real AI calls in tests. Same rule as "use mocked Prisma in API tests".

### Must not — AI

11. **Do not call any LLM provider SDK directly** from QuikPMS. No `import { GoogleGenerativeAI } from '@google/generative-ai'`, no `import OpenAI from 'openai'`, no `import Anthropic from '@anthropic-ai/sdk'`.

12. **Do not store raw LLM response text in the QuikPMS database** — structured outputs only. If AI produces a text summary, store it in the appropriate structured field, not a raw blob.

13. **Do not log prompt text** in app logs — prompts may contain user data.

14. **Do not hardcode model names** — the AI Runtime selects the model based on the use case.

15. **Do not modify `manifest.ts` to add AI permissions without integration owner approval** — AI permission strings are part of the platform contract and must go through the same approval gate as everything else in `manifest.ts`.

### The canonical AI call pattern

```typescript
import { QuikitAI } from '@quikit/ai-sdk';

const ai = new QuikitAI({ appId: 'quikpms' });

const response = await ai
  .withFallback(() => showManualFallback())   // required
  .execute({
    useCase: 'project.milestone_summary',    // required — agree with AI team first
    userPrompt: 'Summarize this milestone.',
    expectedOutputType: 'text',
    entityId: milestone.id,
    entityType: 'milestone',
  });

if (response.gracefulFallback) return;
// response.normalizedText / response.structuredJson / response.proposedActions
```

### What QuikPMS must expose before AI agents can call in

These are gated the same way as any structural change — integration owner approval required before building:

1. `GET /api/internal/manifest` — returns app capabilities. Auth: `INTERNAL_AI_RUNTIME_SECRET` header.
2. Populated `manifest.permissions[]` — all enforced permission strings.
3. Summary endpoints for primary entities (projects, milestones, tasks) — compact shapes for AI context assembly.
4. `withOrgAuth` updated to accept `actingAs: "ai_agent"` service JWT alongside normal session. Pravin mints the JWT — QuikPMS validates it.
5. New env vars (get values from Suyash): `INTERNAL_AI_RUNTIME_SECRET`, `INTERNAL_AI_RUNTIME_URL`.

### Suggested use cases (to be agreed with AI team)

| useCase | What it would do |
|---|---|
| `project.milestone_summary` | Summarise milestone progress and risk |
| `project.delay_analysis` | Explain delay causes and recommend recovery |
| `task.overdue_brief` | Summary of overdue tasks with owner context |
| `report.executive_summary` | Plain-English project health for leadership |

Contact Suyash in `#ai-integration` before building UI for any of these — the use case strings must be registered in the AI Runtime before they work.

### Compatibility doc needed from Kanishka

Before the AI team can wire a QuikPMS module, Kanishka needs to produce a compatibility doc covering all Prisma models, API routes, permission strings, and primary entity shapes. See the QuikCRM and QuikScale compatibility docs as examples. Raise in `#ai-integration` when ready.

### Contact

Questions: `#ai-integration` Slack or Suyash (AI team lead) directly.
Integration owner approval is still required for all structural changes even when driven by AI requirements — the approval gate does not change.
