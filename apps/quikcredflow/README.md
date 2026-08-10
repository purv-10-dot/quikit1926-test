# QuikCRM

Sales-execution app: leads, accounts, contacts, opportunities, activities, automations (workflows + SLA), imports (XLSX/CSV), and telephony. Multi-tenant via Prisma (`User` + `OrgMember` for tenant and role).

## Authentication

Standalone **NextAuth** with a **Credentials** provider: email/password checked against Prisma `User.password` (bcrypt). Users must have an **active `OrgMember`** row so the session receives `orgId` (tenant).

Demo users (after `npm run seed:demo`): same org `quikcrm-demo`, password **`admin123`** — `admin@quikcrm.com`, `adarsh.jain@quikit.ai`, `rishab.dedora@moreyeahsa.com`, `alok.emossy@emossy.com`.

## Worker process

QuikCRM uses BullMQ for imports and SLA processing. Run the worker alongside the web server:

```bash
npm run dev          # web (see package.json for port, e.g. 3076)
npm run seed:demo    # optional: demo org + seeded dev users (same password)
npm run worker       # BullMQ consumer (separate process)
```

The worker is NOT deployed to Vercel — it runs as a separate container/PM2 process in production.

## What's inside

```
apps/quikcrm/
├── app/
│   ├── (dashboard)/         # auth-gated routes (route group, hidden from URL)
│   │   ├── layout.tsx       # wraps every dashboard page
│   │   └── page.tsx         # default home
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # NextAuth handler — DO NOT customize
│   │   ├── example/route.ts              # canonical API route (read this first)
│   │   └── health/route.ts               # public liveness probe
│   ├── login/page.tsx       # email/password sign-in (NextAuth credentials)
│   ├── globals.css          # imports @quikit/ui/styles
│   └── layout.tsx           # root layout, fonts, providers
├── components/
│   └── providers.tsx        # SessionProvider → QueryClient → ThemeProvider
├── lib/
│   ├── api/withTenantAuth.ts  # thin wrapper around the shared factory
│   ├── db.ts                  # re-exports @quikit/database client
│   └── utils.ts               # cn() helper for Tailwind class merging
├── __tests__/
│   ├── setup.ts             # global test setup
│   └── unit/utils.test.ts   # sample unit test
├── manifest.ts              # YOUR APP'S CONTRACT — keep static, don't drift
├── middleware.ts            # JWT cookie gate → /login when logged out
├── next.config.js           # CSP + transpile @quikit/* packages
├── tailwind.config.ts       # extends @quikit/ui/tailwind-config
├── tsconfig.json            # path aliases for @quikit/*
├── vercel.json              # only main branch deploys
├── vitest.config.ts         # Vitest aliases match tsconfig
├── .env.example             # copy to .env.local
├── .eslintrc.json           # bans `any`, requires named-args
├── CLAUDE.md                # ⚠ MUST-READ rules for Claude / contributors
└── README.md                # this file
```

## Where to read first

1. `/docs/00-getting-started.md` — clone, env, first commit.
2. This app's `CLAUDE.md` — the must-not-do list.
3. `app/api/example/route.ts` — copy this when adding API endpoints.
4. `/docs/02-integration-protocol.md` — how to submit your code.

## What to rename

Before your first run:

- `package.json` → set `"name"` to your app id (e.g. `"quiksocial"`), pick a unique `dev` port (3010, 3011, …).
- `next.config.js` → update `allowedOrigins` port.
- `manifest.ts` → set `appId`, `name`, `routePrefix`, `icon`, `permissions`, `navigation`.
- `app/layout.tsx` → set `metadata.title` + description.
- `README.md` → describe your app.
