# App-Level Claude Rules

These rules are STRICTER than the root `/CLAUDE.md`. They apply only inside this app's directory and override anything more permissive at the root.

The integration owner (architect) reviews every PR. Code that violates these rules will be rejected.

## Hard "do not" list

You may NOT do any of the following without the integration owner's explicit written approval in the PR:

1. **Create new packages** under `packages/`. You depend on existing `@quikit/*` packages — you do not extend them.
2. **Modify any file under `packages/`**. They are submodules / shared code owned by the integration team. If you need a feature in `@quikit/ui`, file a request in your PR description and use a local copy as a temporary workaround marked with `// TODO(integration): replace with @quikit/ui when X is added`.
3. **Add new top-level dependencies** to `package.json` beyond what the template ships with. Justify any addition in the PR description with: (a) the problem, (b) why an existing dep can't solve it, (c) maintenance status of the new dep.
4. **Bypass `requireApiUser`** (`lib/auth/require.ts`) on any DB-touching API route. Exceptions are narrow and deliberate: `/api/health`, `/api/health/ready`, `/api/auth/*`, `/api/session/validate` (returns a 200 verdict body by design), the customer quote portal under `/api/public/*` (signed-token auth), and the telephony/LeadSquared webhooks (shared-secret auth).
5. **Write Prisma queries without an `orgId` filter**. The scoping column is `orgId` — the legacy `tenantId` was renamed org-wide. The only legitimate cross-org query is on the super-admin app — and you are not building that.
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

## Dashboard module notes

The dashboard at `app/(dashboard)/dashboard` is feature-rich and depends on
schema + workspace settings that aren't auto-discoverable from a casual read.
Keep these notes in sync when changing dashboard code.

- **Schema additions owned by this module:** `CrmOpportunity.currency`
  (default `"INR"`), `CrmActivity.ownerId` (nullable, indexed alongside
  `occurredAt`), and `CrmDashboardPin` (server-side replacement for the
  legacy localStorage `qcrm.dashboard.pinnedTel.v1` / `quikcrm.pinnedTelephonyReports`
  keys — the band migrates them on first load).
- **CrmCallLog ownership:** The schema uses `agentUserId` (not `ownerId`)
  for the call-log owner FK. The dashboard treats `agentUserId` as the
  ownerId equivalent everywhere; we do not duplicate the column.
- **Permission key:** `"dashboard"` action `"view"`. Added to
  `permissions.ts#ALL_MODULES`. Page-level redirect happens server-side
  via `hasPermission`; the API also calls `assertModule` so direct API
  hits return 403.
- **Workspace settings consumed:** `CrmOrgWorkspaceSettings.settings.dashboard`:
  ```ts
  { qualifiedStages: string[], funnelStages: string[] }
  ```
  Defaults are seeded at first DB read (`lib/services/workspace/dashboard-config.ts`).
  No settings UI in this PR — change the JSON via `setPipelineConfig`-style
  helpers when you need to override.
- **Timezone correctness:** Day buckets are computed in the client's IANA
  zone via `Intl.DateTimeFormat`. The client posts the zone via the
  `X-Client-TZ` header on every dashboard fetch and writes it to a `tz`
  cookie as a fallback for SSR.
- **Auto-refresh:** KPIs refetch every `NEXT_PUBLIC_DASHBOARD_REFRESH_MS`
  ms (default 60000, set to 0 to disable). Funnel + at-risk only refetch
  on filter change.

## Opportunities — stage enum / label mapping

The `CrmOpportunityStage` Prisma enum is the canonical wire format. UI surfaces
render the friendly label via `STAGE_LABEL` from
[`lib/services/opportunities/stage-labels.ts`](lib/services/opportunities/stage-labels.ts).

| Enum value     | UI label       |
|----------------|----------------|
| `Prospecting`  | Prospecting    |
| `Qualification`| Qualification  |
| `Proposal`     | Proposal       |
| `Negotiation`  | Negotiation    |
| `ClosedWon`    | **Won**        |
| `ClosedLost`   | **Lost**       |

Rules:
- DB writes, API request/response bodies, and Zod schemas all use the enum
  value (`ClosedWon`, `ClosedLost`).
- Never hand-render `ClosedWon` / `ClosedLost` in the UI. Use `STAGE_LABEL[stage]`.
- Stage transitions go through `POST /api/opportunities/[id]/transition` —
  PATCH on the resource rejects `stage` in the body.
- Closed states are terminal. Departing them requires an Administrator with
  `?force=true`. See `transition-service.ts::validateTransition`.
- Default stage for newly created opportunities is `Prospecting` (probability 10).

## How Claude Code should work in this repo

- The root `CLAUDE.md` is the source of truth for monorepo-wide rules.
- This file (`apps/<your-app>/CLAUDE.md`) is the source of truth for app-level rules.
- When the two conflict, **this file wins**.
- The exemplar files under `/docs/exemplars/` (added in Batch 2) are canonical patterns. Copy them, don't invent.
- If your Claude is suggesting code that violates any rule above, **reject the suggestion and re-prompt** with the rule cited.
