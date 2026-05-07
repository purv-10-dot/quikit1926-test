# QuikTrack

Jira-clone PMS app inside the QuikIT monorepo. Spaces, Sprints, Kanban, Task Table, Timeline, Pages, Timesheet, Reports.

## Run locally

```bash
cp .env.example .env.local            # then fill in DATABASE_URL + secrets
npm install                           # from monorepo root
npm run dev --workspace apps/quiktrack
```

App boots at `http://localhost:3004`. Unauth visits redirect to `/login` which triggers QuikIT SSO.

## Stack

- Next.js 14 (app router)
- NextAuth via `@quikit/auth`
- Prisma multi-schema — QuikTrack tables live in the `app_quiktrack` schema; users/orgs/tenants/memberships are reused from `public`
- Tailwind via `@quikit/ui/tailwind-config`
- Vitest + Testing Library

## Layout

```
apps/quiktrack/
├── app/
│   ├── (dashboard)/        # auth-gated routes
│   ├── api/                # route handlers (every project route uses withProjectAccess)
│   ├── login/              # SSO redirect
│   └── layout.tsx
├── components/
│   ├── shell/              # Sidebar, Header, layout chrome
│   └── session-guard.tsx
├── lib/
│   ├── api/                # withTenantAuth, withProjectAccess, helpers
│   ├── auth.ts             # authOptions
│   ├── db.ts               # re-exports @quikit/database
│   ├── services/           # rollup, sprintLifecycle, boardOrdering
│   └── validation/         # Zod schemas
├── docs/visual-checklists/ # per-screen pixel-fidelity checklists
├── __tests__/
└── manifest.ts             # appId/permissions/nav — registered with the launcher
```

## See also

- `plan.md` — full multi-phase implementation plan
- root `CLAUDE.md` — monorepo standards (override anything more permissive in this app's CLAUDE.md)
- `apps/quiktrack/CLAUDE.md` — app-level rules (stricter)
