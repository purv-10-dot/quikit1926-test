# Landing Page Architecture & Merge — Technical Documentation

> **Status:** Reference document. Describes the public **marketing/landing page**
> system shared across the QuikIT monorepo after the multi-app *landing page
> merge* (May 2026).
>
> **Audience:** Engineers maintaining or extending any app's landing page, and
> contributors onboarding a new app into the platform.
>
> **Scope note:** This document covers the *public, unauthenticated* landing
> surface (`/`) and how it bridges into authentication. The authenticated
> dashboard, RBAC, feature-gating, and accent theming are referenced only where
> they touch the landing flow.

---

## Table of contents

1. [Overview & merge strategy](#1-overview--merge-strategy)
2. [End-to-end architecture](#2-end-to-end-architecture)
3. [Route-group convention & URL mapping](#3-route-group-convention--url-mapping)
4. [How the landing page binds to each app](#4-how-the-landing-page-binds-to-each-app)
5. [Where & how a landing page is registered](#5-where--how-a-landing-page-is-registered)
6. [Request flow walkthrough](#6-request-flow-walkthrough)
7. [Layout hierarchy & CSS cascade](#7-layout-hierarchy--css-cascade)
8. [Shared vs app-specific components](#8-shared-vs-app-specific-components)
9. [Theme handling (light / dark)](#9-theme-handling-light--dark)
10. [Cross-app login & the merge mechanics](#10-cross-app-login--the-merge-mechanics)
11. [Environment variables](#11-environment-variables)
12. [Middleware, feature flags & config files](#12-middleware-feature-flags--config-files)
13. [App-specific configuration (branding)](#13-app-specific-configuration-branding)
14. [Adding a new landing page](#14-adding-a-new-landing-page)
15. [Build & deployment](#15-build--deployment)
16. [Dependencies between landing & app modules](#16-dependencies-between-landing--app-modules)
17. [Folder structure & file responsibilities](#17-folder-structure--file-responsibilities)
18. [Troubleshooting & debugging](#18-troubleshooting--debugging)
19. [Best practices & recommendations](#19-best-practices--recommendations)

---

## 1. Overview & merge strategy

### What the merge did

The monorepo hosts **9 Next.js (App Router) applications** under
[QuikIT_New/apps/](QuikIT_New/apps/). Historically each app was an independent
Next.js project with its own marketing site, its own login page, and its own
notion of "where do I send the user after sign-in". The **landing page merge**
unified three things across all apps **without merging the apps themselves**:

1. **A uniform landing-page convention** — every product app exposes its public
   marketing page at `/` via a Next.js `(marketing)` route group, nested under a
   shared root layout. Same shape, different content.
2. **A single cross-app login bridge** — one shared helper,
   [`buildLoginUrl()`](QuikIT_New/packages/shared/lib/login-url.ts), is the
   *only* coupling between a landing page and the rest of the platform. Every
   "Login" CTA on every landing page routes through the central auth app and a
   cross-domain cookie bridge.
3. **A unified entry/invitation flow** — the launcher (QuikIT) became the
   platform "front door": invitation emails, the `/apps` switcher, and the
   marketing-styled `/invitations/accept` page all live there.

### The strategy in one sentence

> **Shared convention + one shared login helper, but per-app content and
> styling.** The platform standardises the *contract* (route group, session
> gate, login bridge, provider stack, CSS-token base) and leaves each team free
> to own its landing page's content, sections, fonts, and animation style.

This is deliberately **not** a shared "landing page package." There is no
`@quikit/landing`. Each app's marketing sections (`Hero`, `Nav`, `Features`,
etc.) live inside that app and are not reused across apps. The merge unified the
*plumbing*, not the *pixels*.

### Impact analysis

| Area | Impact |
|---|---|
| **Existing dashboards** | None. Marketing lives in a separate route group; dashboard route groups never import marketing CSS, fonts, or components. |
| **Auth** | Centralised. All sign-in flows funnel through `NEXT_PUBLIC_AUTH_URL`. Standalone per-app `/login` pages are retired (kept only as self-host fallbacks). |
| **Routing** | `/` changed meaning: it is now public marketing for logged-out users and a server redirect (to `/dashboard` or `/apps`) for logged-in users. |
| **Deploys** | Each app still deploys independently; only `main` triggers a Vercel build. A change to `packages/shared` (where `buildLoginUrl` lives) redeploys **all** apps. |
| **Ports** | Swapped (May 2026): launcher → 3000, auth → 3001. See [§11](#11-environment-variables). |

---

## 2. End-to-end architecture

```
                            ┌──────────────────────────────────────────────┐
                            │                  Browser                      │
                            │   GET https://scale.quikit.ai/                │
                            └───────────────────────┬──────────────────────┘
                                                    │
                                                    ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │  middleware.ts  (createMiddleware factory from @quikit/auth/middleware) │
        │   • "/" ∈ publicRoutes  →  NOT auth-gated, request passes through       │
        │   • protected paths     →  bounce to ${NEXT_PUBLIC_AUTH_URL}/login      │
        └───────────────────────────────────────┬───────────────────────────────┘
                                                 │  (public "/" passes)
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │  app/layout.tsx  (ROOT layout — one per app)                            │
        │   <html><body class="font-sans">                                        │
        │     <SentryInit/>                                                       │
        │     <Providers>  SessionProvider → QueryClientProvider → ThemeProvider  │
        │        {children}                                                       │
        └───────────────────────────────────────┬───────────────────────────────┘
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │  app/(marketing)/layout.tsx   (route-group layout — no URL segment)     │
        │   • imports ./marketing.css  (loads AFTER globals.css → overrides win)  │
        │   • scopes landing fonts via CSS vars on a wrapper <div>                │
        │   • injects JSON-LD <script> tags + page <metadata>                     │
        └───────────────────────────────────────┬───────────────────────────────┘
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │  app/(marketing)/page.tsx   (server component)                          │
        │   const session = await getServerSession(authOptions)                   │
        │   if (session?.user?.id) redirect("/dashboard")   ← authed users leave  │
        │   return <main><Nav/><Hero/>…<FooterCTA/></main>  ← logged-out render   │
        └───────────────────────────────────────┬───────────────────────────────┘
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │  _components/*   (Nav, Hero, Features, …  — app-owned)                   │
        │   Nav's "Login" CTA  →  buildLoginUrl({ appUrl: NEXT_PUBLIC_<APP>_URL }) │
        └───────────────────────────────────────┬───────────────────────────────┘
                                                 ▼
        ┌───────────────────────────────────────────────────────────────────────┐
        │  Cross-app login bridge  (packages/shared/lib/login-url.ts)             │
        │   ${AUTH_URL}/login?callbackUrl=                                        │
        │      ${AUTH_URL}/api/post-login?callbackUrl=${APP_URL}/dashboard        │
        │   → sign-in → /api/post-login mints 120s HS256 token (INTERNAL_SECRET)  │
        │   → ${APP_URL}/auth-handoff?token=…  → app plants its own cookie        │
        │   → final redirect to ${APP_URL}/dashboard                              │
        └───────────────────────────────────────────────────────────────────────┘
```

The two load-bearing files in this whole picture are the **marketing
`page.tsx`** (the session gate) and **`buildLoginUrl`** (the cross-app bridge).
Everything else is per-app presentation.

---

## 3. Route-group convention & URL mapping

### The `(marketing)` route group

Next.js [route groups](https://nextjs.org/docs/app/building-your-application/routing/route-groups)
— folders wrapped in parentheses — organise files **without** adding a URL
segment. So `app/(marketing)/page.tsx` renders at `/`, *not* `/marketing`.

Each product app uses three sibling route groups:

| Route group | URL prefix | Purpose | Auth |
|---|---|---|---|
| `app/(marketing)/` | `/` | Public landing page | Public (page self-redirects authed users) |
| `app/(dashboard)/` | `/` (e.g. `/dashboard`, `/kpi`) | Authenticated app | Gated by middleware |
| `app/(auth)/` *(launcher only)* | `/login` | Legacy/self-host login | Public |

Because route groups don't nest in the URL, both `(marketing)/page.tsx` and the
dashboard tree can coexist; Next.js resolves the concrete route. The session
gate in the marketing page is what keeps the two audiences separated at `/`.

### URL mapping per app

| App | Landing URL | Extra marketing routes |
|---|---|---|
| **quikit** (launcher) | `/` | `/[slug]` (platform, products, pricing, contact, quikcrm, quikinfra, quikscale, quiksocial, quiktrack), `/blog`, `/blog/[postSlug]` |
| **quikscale** | `/` | — |
| **quiktrack** | `/` | — |
| **Quikcrm** | `/` | — |
| **quiksocial** | `/` | — |
| **quikinfra** | `/` | — |
| **admin** | *(none)* | root `page.tsx` redirects to `/dashboard` |
| **auth** | *(none)* | root `page.tsx` redirects to `/login` |
| **quikvc** | *(none)* | root `page.tsx` redirects by role |

Only the **launcher** has a multi-page marketing site (it doubles as the public
quikit.ai website). The other five product apps have a **single** landing page
at `/`.

---

## 4. How the landing page binds to each app

Every product app implements the same **`(marketing)/` contract**:

```
app/(marketing)/
├── layout.tsx          # fonts + metadata + JSON-LD + imports marketing.css
├── page.tsx            # session gate + renders the page
├── marketing.css       # app-scoped overrides (quiksocial/Quikcrm include large files)
└── _components/        # app-owned sections: Nav, Hero, …  (underscore = private, not routable)
```

The binding to the host app is intentionally **minimal** — only two touch points:

1. **The session gate** uses the app's *own* NextAuth config:
   `import { authOptions } from "@/lib/auth"`. This is what makes the landing
   page "belong" to the app — it reads that app's session cookie.
2. **The login CTA** uses the app's *own* base-URL env var when calling the
   shared `buildLoginUrl()`, e.g. `NEXT_PUBLIC_QUIKSCALE_URL`.

Everything else (sections, styling, animation) is private to the app under
`_components/`.

### Per-app implementation variation

All six follow the same contract but differ in *how they produce the markup*:

| App | Dev port | Content strategy | Notable files |
|---|---|---|---|
| **quikit** | 3000 | **Data-driven**: static JSON → HTML | [`_lib/load-page.ts`](QuikIT_New/apps/quikit/app/(marketing)/_lib/load-page.ts), `_data/*.json`, [`_components/static-page.tsx`](QuikIT_New/apps/quikit/app/(marketing)/_components/static-page.tsx) |
| **quikscale** | 3003 | **React sections** (17 components) | [`page.tsx`](QuikIT_New/apps/quikscale/app/(marketing)/page.tsx), `_components/Hero.tsx`, … |
| **quiktrack** | 3004 | **React sections** (~14, mirrors quikscale) | `_components/*` |
| **Quikcrm** | 3008 | **Ported HTML string** + vanilla-JS scroll effects | [`_components/landing-html.ts`](QuikIT_New/apps/Quikcrm/app/(marketing)/_components/landing-html.ts), [`landing-client.tsx`](QuikIT_New/apps/Quikcrm/app/(marketing)/_components/landing-client.tsx) |
| **quiksocial** | — | **Cinematic dark**, Lenis smooth-scroll, CSS-module `.js` components | [`layout.tsx`](QuikIT_New/apps/quiksocial/app/(marketing)/layout.tsx), `_components/*.js` + `*.module.css` |
| **quikinfra** | 3006 | **React sections** + inline content arrays in `page.tsx` | `_components/*`, `page.tsx` |

> **Why so varied?** Each landing page was authored from a different design and
> ported in by a different team. The merge standardised the *contract* (route
> group + session gate + login bridge), not the authoring style — see
> [§19](#19-best-practices--recommendations) for the recommended convergence.

---

## 5. Where & how a landing page is registered

There is **no central registry of landing pages**. "Registration" is purely a
matter of the App-Router file-system convention plus, for the launcher, two
allowlists.

### A. Filesystem registration (all apps)

A landing page exists simply because these files exist:

- `app/(marketing)/page.tsx` → Next.js routes `/` to it.
- `app/(marketing)/layout.tsx` → wraps it.

No import statement, manifest entry, or config flag "turns on" a landing page.

### B. Middleware public-route registration (all apps)

For the landing to be reachable while logged out, `/` must be in the app's
middleware `publicRoutes`. Example
([apps/quikscale/middleware.ts:48](QuikIT_New/apps/quikscale/middleware.ts#L48)):

```ts
const factory = createMiddleware({
  loginRoute: "/login",
  publicRoutes: ["/", "/login", "/invitations", "/auth-handoff", "/api/health"],
  centralLoginUrl: AUTH_URL ? `${AUTH_URL}/login` : undefined,
  centralSelectOrgUrl: QUIKIT_URL ? `${QUIKIT_URL}/apps` : undefined,
});
```

### C. Launcher slug registration (quikit only)

The launcher serves a multi-page marketing site. New sub-pages register in
**two** places:

1. **Content map + slug whitelist** in
   [`_lib/load-page.ts`](QuikIT_New/apps/quikit/app/(marketing)/_lib/load-page.ts) —
   the `MAP` (slug → imported JSON) and `MARKETING_SLUGS` (the `/[slug]`
   whitelist):

   ```ts
   const MAP: Record<string, unknown> = { index, platform, products, pricing,
     contact, quikcrm, quikinfra, quikscale, quiksocial, quiktrack, blog,
     "blog-post": blogPost };

   export const MARKETING_SLUGS = ["platform", "products", "pricing", "contact",
     "quikcrm", "quikinfra", "quikscale", "quiksocial", "quiktrack"] as const;
   ```

   The dynamic route [`(marketing)/[slug]/page.tsx`](QuikIT_New/apps/quikit/app/(marketing)/[slug]/page.tsx#L13-L17)
   pre-renders only those slugs (`generateStaticParams` + `dynamicParams = false`)
   and `notFound()`s anything else — so the dynamic segment can never shadow a
   real launcher route.

2. **Middleware marketing allowlist** in
   [`apps/quikit/middleware.ts:82-96`](QuikIT_New/apps/quikit/middleware.ts#L82-L96) —
   the `MARKETING_EXACT` set tells the launcher middleware these exact paths are
   marketing (never auth-gated):

   ```ts
   const MARKETING_EXACT = new Set(["/", "/blog", "/sitemap.xml", "/robots.txt",
     "/platform", "/products", "/pricing", "/contact",
     "/quikcrm", "/quikinfra", "/quikscale", "/quiksocial", "/quiktrack"]);
   ```

> **Gotcha:** A new launcher marketing slug needs an entry in **both** `MAP`/
> `MARKETING_SLUGS` *and* `MARKETING_EXACT`, or it either 404s or gets
> auth-bounced. See [§18](#18-troubleshooting--debugging).

---

## 6. Request flow walkthrough

Concrete trace for a visitor hitting **`https://scale.quikit.ai/`** (QuikScale):

**Case A — logged-out visitor**

1. Browser `GET /`.
2. [`middleware.ts`](QuikIT_New/apps/quikscale/middleware.ts) → factory sees `/`
   in `publicRoutes` → `NextResponse.next()`. No auth bounce.
3. Root [`app/layout.tsx`](QuikIT_New/apps/quikscale/app/layout.tsx) renders
   `<html class="--font-jakarta"><body class="font-sans"><SentryInit/><Providers>…`.
4. [`(marketing)/layout.tsx`](QuikIT_New/apps/quikscale/app/(marketing)/layout.tsx)
   wraps children in `<div class="${fraunces.variable} ${inter.variable}">`,
   imports `marketing.css`, injects software + FAQ JSON-LD.
5. [`(marketing)/page.tsx`](QuikIT_New/apps/quikscale/app/(marketing)/page.tsx#L30-L34):
   `getServerSession()` → no session → render
   `<main class="stage"><Nav/><Hero/>…<FooterCTA/><ScrollReveal/></main>`.
6. `Nav` computes `LOGIN_HREF = buildLoginUrl({ appUrl: NEXT_PUBLIC_QUIKSCALE_URL, postLoginPath: "/dashboard" })`
   at module load (build-time env inlining).
7. HTML streams to the browser. The user sees the brochure.

**Case B — logged-in visitor** (valid QuikScale session cookie)

1–4. Same as above (middleware lets `/` through; layouts mount).
5. `page.tsx`: `getServerSession()` returns a session →
   `redirect("/dashboard")`. The brochure is never rendered.

**Case C — clicking "Login"**

1. `<a href={LOGIN_HREF}>` navigates to
   `${AUTH_URL}/login?callbackUrl=${AUTH_URL}/api/post-login?callbackUrl=${QUIKSCALE_URL}/dashboard`.
2. User authenticates on the **central auth host** (cookie set on auth origin).
3. `/api/post-login` (auth host) mints a 120s HS256 token signed with
   `INTERNAL_SECRET` and redirects to `${QUIKSCALE_URL}/auth-handoff?token=…`.
4. QuikScale's `/auth-handoff` (public route) exchanges the token for a
   host-scoped NextAuth cookie, then redirects to `/dashboard`.

> **Launcher difference:** quikit's `page.tsx` redirects authed users to
> `/apps` (the app switcher), not `/dashboard`, and sets
> `export const dynamic = "force-dynamic"` because it reads the session cookie
> per request. See [apps/quikit/app/(marketing)/page.tsx:19-27](QuikIT_New/apps/quikit/app/(marketing)/page.tsx#L19-L27).

---

## 7. Layout hierarchy & CSS cascade

```
app/layout.tsx                     ROOT  (every request in the app)
   ├─ <html className={jakarta.variable}>          ← Plus Jakarta Sans (default UI font)
   ├─ <body className="font-sans antialiased">
   ├─ <SentryInit/>
   └─ <Providers> SessionProvider → QueryClientProvider → ThemeProvider </Providers>
   └─ imports "./globals.css"                       ← base tokens (@quikit/ui/styles)
        │
        ├─ app/(marketing)/layout.tsx               MARKETING zone only
        │     ├─ <div className="--font-serif --font-sans …">   ← landing fonts via CSS vars
        │     ├─ injects JSON-LD <script>
        │     └─ imports "./marketing.css"          ← loads AFTER globals.css → wins
        │           └─ app/(marketing)/page.tsx → _components/*
        │
        └─ app/(dashboard)/layout.tsx               DASHBOARD zone only
              └─ keeps Plus Jakarta Sans; never imports marketing.css
```

### Key cascade rules

- **Root owns the shell.** `<html>`, `<body>`, providers, and `globals.css`
  (which imports `@quikit/ui/styles`) are mounted once at the root. Marketing
  and dashboard layouts **never re-mount** providers — see the explicit comment
  in [apps/quikscale/app/(marketing)/layout.tsx:5-16](QuikIT_New/apps/quikscale/app/(marketing)/layout.tsx#L5-L16).
- **`marketing.css` ships after `globals.css`,** so its rules for
  `.nav`, `.btn`, `.hero-*`, `.stage` win by source order. Dashboard route
  groups never import it, so the marketing look never bleeds into the app.
- **Fonts are scoped via CSS variables on a wrapper `<div>`,** not on `<body>`.
  QuikScale exposes Fraunces (`--font-serif`) + Inter (`--font-sans`); the root's
  Plus Jakarta Sans (`--font-jakarta`) stays the dashboard font. QuikSocial goes
  further and sets an inline `fontFamily: "var(--font-sans), …"` on the wrapper
  ([layout.tsx:86-89](QuikIT_New/apps/quiksocial/app/(marketing)/layout.tsx#L86-L89)).

---

## 8. Shared vs app-specific components

| Layer | Where | Shared? | Used by landing? |
|---|---|---|---|
| **Cross-app login helper** | [`packages/shared/lib/login-url.ts`](QuikIT_New/packages/shared/lib/login-url.ts) | ✅ shared | ✅ — the one real dependency |
| **UI primitives** (`Button`, `Modal`, `DataTable`, `AppSwitcher`, …) | `@quikit/ui` ([packages/ui](QuikIT_New/packages/ui)) | ✅ shared | ❌ — these are dashboard chrome; landing sections don't use them |
| **CSS token base** | [`packages/ui/styles/globals.css`](QuikIT_New/packages/ui/styles/globals.css) | ✅ shared | ✅ — imported via each app's `globals.css` |
| **Tailwind preset** | [`packages/ui/tailwind.config.ts`](QuikIT_New/packages/ui/tailwind.config.ts) | ✅ shared | ✅ — each app's tailwind config extends it |
| **Landing sections** (`Hero`, `Nav`, `Features`, `FooterCTA`, …) | `apps/<app>/app/(marketing)/_components/` | ❌ per-app | ✅ |
| **`marketing.css`** | `apps/<app>/app/(marketing)/marketing.css` | ❌ per-app | ✅ |

**Takeaway:** The only thing a landing page *shares* at the component level is
`buildLoginUrl`. There is intentionally **no shared `Hero`/`Nav`/section
library** — each app re-implements them. (`@quikit/ui` components like
`AppSwitcher`, `UserMenu`, `AppSidebar` are for the authenticated dashboard, not
the landing surface.)

---

## 9. Theme handling (light / dark)

### Where theme state lives

`next-themes` `ThemeProvider` sits inside each app's root `Providers`, fixed last
in the provider order (`SessionProvider → QueryClientProvider → ThemeProvider`,
enforced by both root and app `CLAUDE.md`). Example
([apps/quikscale/components/providers.tsx:35](QuikIT_New/apps/quikscale/components/providers.tsx#L35)):

```tsx
<ThemeProvider attribute="class" defaultTheme="light" enableSystem>
  <ConfirmProvider>{children}</ConfirmProvider>
</ThemeProvider>
```

- `attribute="class"` → next-themes toggles a `dark`/`light` class on `<html>`.
- `defaultTheme="light"` → light is the platform default.
- `enableSystem` varies by app (QuikScale enables it; some apps disable it). The
  theme choice is persisted to `localStorage` by next-themes.
- `<html suppressHydrationWarning>` ([root layout](QuikIT_New/apps/quikscale/app/layout.tsx#L31))
  prevents the class-injection hydration warning.

### Theme tokens

Color/spacing/typography tokens are CSS custom properties defined once in
[`packages/ui/styles/globals.css`](QuikIT_New/packages/ui/styles/globals.css)
(light `:root` block + a `html.dark` override block) and pulled in through each
app's `app/globals.css`. The Tailwind preset maps utilities to these variables,
so `bg-[var(--color-bg-secondary)]` reacts to the theme automatically.

### Landing pages and theme — important nuances

- **Most landing pages are visually light by design.** They lean on
  `marketing.css` (which defines its own palette like QuikScale's `--primary:
  #5b4181`) rather than the global dark/light token swap. They don't ship a
  theme toggle in the nav.
- **QuikSocial is intentionally dark.** Its marketing layout sets
  `viewport.colorScheme = "dark"` and `themeColor = "#050507"`
  ([layout.tsx:67-70](QuikIT_New/apps/quiksocial/app/(marketing)/layout.tsx#L67-L70)).
  The dark look is baked into `marketing.css`, scoped to the route group so it
  never leaks into the (light) dashboard.
- **Accent-color theming (`accent-*` classes + `ThemeApplier`) is a
  dashboard-only concern.** It is per-tenant branding for the authenticated app
  and is *not* part of the landing surface. See root `CLAUDE.md` → "Accent Color
  System".

---

## 10. Cross-app login & the merge mechanics

This is the heart of the merge — read
[`packages/shared/lib/login-url.ts`](QuikIT_New/packages/shared/lib/login-url.ts)
alongside this section.

### `buildLoginUrl()`

```ts
buildLoginUrl({ appUrl, postLoginPath = "/dashboard", authUrl })
```

- Resolves the auth host: `authUrl` arg → `process.env.NEXT_PUBLIC_AUTH_URL` →
  `http://localhost:3001` (dev fallback).
- If `appUrl` is falsy → returns bare `${authUrl}/login`.
- If `appUrl` **same-origin** as auth → `${authUrl}/login?callbackUrl=<finalCallback>`
  (no bridge needed).
- If `appUrl` **cross-origin** → routes through the cookie bridge:
  ```
  ${authUrl}/login?callbackUrl=${authUrl}/api/post-login?callbackUrl=${appUrl}${postLoginPath}
  ```

### Why the cookie bridge exists

NextAuth sets a **host-only** session cookie on the auth app's origin. Cookies
do not cross distinct `*.vercel.app` subdomains, so a direct
`window.location.assign(targetOrigin/dashboard)` would land the user on a host
with no session — bouncing them right back to the landing page.

```
 Sequence (cross-origin sign-in)
 ────────────────────────────────────────────────────────────────────
 Landing (scale.quikit.ai)
   └─► AUTH host /login?callbackUrl=AUTH/api/post-login?callbackUrl=scale/dashboard
         user signs in  →  cookie set on AUTH origin
         AUTH /api/post-login  reads session, mints 120s HS256 token (INTERNAL_SECRET)
           └─► scale.quikit.ai/auth-handoff?token=…
                 verifies token, plants host-scoped NextAuth cookie on scale origin
                   └─► scale.quikit.ai/dashboard   ✅ now authenticated here
 ────────────────────────────────────────────────────────────────────
```

The auth app's `callbacks.redirect` allow-list (in `packages/auth/index.ts`)
permits the sub-app origins; otherwise NextAuth strips cross-origin
`callbackUrl`s and the user would land back on the auth origin. The allow-list
is driven by `AUTH_ALLOWED_RETURN_ORIGINS`.

### The merge events

- **2026-05-19** ([`CHANGES_2026-05-19.md`](QuikIT_New/CHANGES_2026-05-19.md),
  [`ENV_CHANGES_2026-05-19.md`](QuikIT_New/ENV_CHANGES_2026-05-19.md)):
  - Invitation emails now point at the launcher's marketing-styled
    `/invitations/accept` page (and `/api/invitations`), both added to the
    launcher's `publicRoutes`.
  - Email renderers switched their base URL from `NEXT_PUBLIC_AUTH_URL` →
    `QUIKIT_URL` so invite links land on the launcher.
  - Eager per-app RBAC provisioning when a super-admin grants app access.
  - Google / Microsoft SSO on the marketing login modal.
- **2026-05-29** ([`PORT_CONFIG_CHANGES.md`](QuikIT_New/PORT_CONFIG_CHANGES.md)):
  port swap — launcher → **3000** (the front door), auth → **3001**. Env-file +
  `package.json` only; no code changes.

> ⚠️ Some in-code comments still reference old ports (e.g. quikit middleware
> mentions auth on `:3004`/`:3001` in stale comments). Trust
> `PORT_CONFIG_CHANGES.md` and the `.env.local` files over comments.

---

## 11. Environment variables

### Variables in the landing/login flow

| Variable | Scope | Role | Dev default |
|---|---|---|---|
| `NEXT_PUBLIC_AUTH_URL` | client (inlined) | Central auth host that `buildLoginUrl` targets | `http://localhost:3001` |
| `NEXT_PUBLIC_QUIKSCALE_URL` / `NEXT_PUBLIC_QUIKCRM_URL` / `NEXT_PUBLIC_<APP>_URL` | client (inlined) | The app's own origin, used as `appUrl` for the callback | per app (e.g. `:3003`, `:3008`) |
| `NEXT_PUBLIC_QUIKIT_URL` | client (inlined) | Launcher origin (org-select handoff target) | `http://localhost:3000` |
| `QUIKIT_URL` | server | Launcher base URL for invitation email links | `http://localhost:3000` |
| `<APP>_URL` (`QUIKSCALE_URL`, `QUIKINFRA_URL`, `ADMIN_URL`, …) | server | App switcher base-URL overrides ([launcher route](QuikIT_New/apps/quikit/app/api/apps/launcher/route.ts)) | localhost fallbacks |
| `INTERNAL_SECRET` | server | Signs the 120s HS256 handoff token | — |
| `AUTH_ALLOWED_RETURN_ORIGINS` | server (auth app) | Comma-list of origins the auth redirect callback may return to | localhost list |
| `NEXTAUTH_URL` / `NEXTAUTH_SECRET` | server | NextAuth core | per app |

### The literal-access rule (critical)

`NEXT_PUBLIC_*` vars are inlined into the **client bundle at build time** by
webpack's DefinePlugin, which can only statically replace **literal** accesses
like `process.env.NEXT_PUBLIC_AUTH_URL`. **Dynamic** access
(`process.env[name]`) is *not* replaced and reads as `undefined` in the browser.

This is why `buildLoginUrl` and every `Nav`/`login-href` read the var literally,
e.g. [apps/Quikcrm/app/(marketing)/_components/login-href.ts:11-14](QuikIT_New/apps/Quikcrm/app/(marketing)/_components/login-href.ts#L11-L14):

```ts
export const LOGIN_HREF = buildLoginUrl({
  appUrl: process.env.NEXT_PUBLIC_QUIKCRM_URL ?? "http://localhost:3008",
  postLoginPath: "/dashboard",
});
```

See [`packages/shared/lib/env.ts`](QuikIT_New/packages/shared/lib/env.ts) for the
shared helper and rationale.

### Build-time env list

[`turbo.json`](QuikIT_New/turbo.json#L8-L40) declares the build-task `env` keys
(so Turbo's cache invalidates when they change), and each app's Dockerfile bakes
them into a `.env.production` so `next build` inlines the `NEXT_PUBLIC_*` ones.

### Port map (post-swap)

| Port | App |
|---|---|
| 3000 | quikit (launcher / front door) |
| 3001 | auth (central credentials) |
| 3002 | admin |
| 3003 | quikscale |
| 3004 | quiktrack |
| 3005 | quikvc |
| 3006 | quikinfra |
| 3008 | Quikcrm *(dev fallback in `login-href.ts`)* |

---

## 12. Middleware, feature flags & config files

### Middleware

All apps use the **`createMiddleware()` factory** from `@quikit/auth/middleware`
(root `CLAUDE.md`: *"no custom middleware logic"*). The per-app `middleware.ts`
configures it and wraps its responses.

- **QuikScale-style sub-app** ([middleware.ts](QuikIT_New/apps/quikscale/middleware.ts)):
  `publicRoutes` includes `/`; the wrapper rewrites the factory's bounce to the
  central auth login, evicts stale cookies on `reason=session_expired`, and
  rewrites no-org users to the launcher handoff (`/apps?handoff=quikscale&to=…`).
- **Launcher** ([middleware.ts](QuikIT_New/apps/quikit/middleware.ts)): in
  addition to `publicRoutes`, it short-circuits the whole `MARKETING_EXACT` set
  (and `/blog/*`, `/assets/*`) with `NextResponse.next()` *before* the factory
  runs ([line 142](QuikIT_New/apps/quikit/middleware.ts#L142)), and rewrites
  every `/login` hit to the external auth app. Its `matcher` also excludes
  `app-icons/` and `auth/` public assets.

> The launcher middleware comments note marketing paths may also be *"proxied
> via next.config rewrites"* — the marketing zone is owned by the `(marketing)`
> route group and is never auth-gated either way.

### Feature flags

Feature gating ([`packages/auth/feature-gate.ts`](QuikIT_New/packages/auth/feature-gate.ts))
— sparse default-off storage (absent flag row = enabled), globally-off modules
(Cash, Survey), 30s Redis-cached lookups, and three gate shapes
(`getDisabledModules`, `gateModuleRoute`, `gateModuleApi`) — applies to the
**authenticated dashboard**, not the landing page. The landing page has no
feature flags; it's all-or-nothing public content.

### Config files touching the landing flow

| File | Role |
|---|---|
| `apps/<app>/middleware.ts` | public-route allowlist + login bounce |
| `apps/<app>/next.config.js` | `output: "standalone"`, `transpilePackages: [@quikit/*]`, CSP headers |
| `apps/<app>/Dockerfile` | bakes `NEXT_PUBLIC_*` into `.env.production` at build |
| `apps/<app>/vercel.json` | `deploymentEnabled: {main: true}` + `ignoreCommand` (main-only deploys) |
| `turbo.json` | build pipeline + build-time env keys |

---

## 13. App-specific configuration (branding)

Branding is **not centralised** — each app configures its own landing identity
in two places:

1. **`(marketing)/layout.tsx`** — page `metadata` (title, description,
   keywords, OpenGraph) and JSON-LD structured data. Examples:
   - QuikScale: SoftwareApplication + FAQ JSON-LD, ₹499/user/month pricing
     ([layout.tsx:33-126](QuikIT_New/apps/quikscale/app/(marketing)/layout.tsx#L33-L126)).
   - QuikSocial: dark `viewport`, Organization JSON-LD
     ([layout.tsx:43-78](QuikIT_New/apps/quiksocial/app/(marketing)/layout.tsx#L43-L78)).

2. **`(marketing)/marketing.css`** — the app's color palette and fonts
   (QuikScale/QuikTrack purple `--primary: #5b4181`; QuikCRM navy; QuikSocial
   dark). Fonts are loaded via `next/font/google` in the layout and exposed as
   CSS variables consumed by `marketing.css`.

3. **Static assets** — logos and hero media live in each app's
   `public/marketing/` (e.g. QuikScale `/marketing/logo.png`, referenced in
   [Nav.tsx:26](QuikIT_New/apps/quikscale/app/(marketing)/_components/Nav.tsx#L26)).

The launcher additionally drives **content** from
`app/(marketing)/_data/*.json` (hero copy, features, testimonials per page) —
the only app where landing content is data, not code.

---

## 14. Adding a new landing page

### Adding a landing page to a **new product app**

1. **Create the route group:** `apps/<app>/app/(marketing)/`.
2. **`layout.tsx`** — load fonts via `next/font/google` as CSS variables, set
   `metadata` + JSON-LD, `import "./marketing.css"`. Wrap children in a
   `<div className={...fontVars}>`. **Do not** mount providers (the root layout
   owns them).
3. **`page.tsx`** — copy the session-gate pattern verbatim:
   ```tsx
   import { redirect } from "next/navigation";
   import { getServerSession } from "next-auth";
   import { authOptions } from "@/lib/auth";

   export default async function MarketingPage() {
     const session = await getServerSession(authOptions);
     if (session?.user?.id) redirect("/dashboard");
     return ( /* <Nav/> <Hero/> … */ );
   }
   ```
4. **`_components/Nav.tsx`** — the Login CTA must use the shared helper with the
   app's own URL var (literal access!):
   ```tsx
   import { buildLoginUrl } from "@quikit/shared/login-url";
   const LOGIN_HREF = buildLoginUrl({
     appUrl: process.env.NEXT_PUBLIC_<APP>_URL ?? "http://localhost:<port>",
     postLoginPath: "/dashboard",
   });
   ```
5. **`marketing.css`** — app palette + fonts; keep selectors scoped to landing
   classes so nothing leaks into the dashboard.
6. **Middleware** — add `/` to `publicRoutes` and ensure `/auth-handoff` is
   public.
7. **Env** — define `NEXT_PUBLIC_<APP>_URL` (+ `<APP>_URL` server var), add the
   origin to the auth app's `AUTH_ALLOWED_RETURN_ORIGINS`, and register the app
   in the launcher's switcher base-URL map.
8. **Don't import app modules** into landing components (see [§16](#16-dependencies-between-landing--app-modules)).

### Adding a marketing **sub-page to the launcher**

1. Add the page's JSON to `apps/quikit/app/(marketing)/_data/<slug>.json`.
2. Register it in [`_lib/load-page.ts`](QuikIT_New/apps/quikit/app/(marketing)/_lib/load-page.ts):
   add to `MAP` and (if reachable at `/<slug>`) to `MARKETING_SLUGS`.
3. Add the path to `MARKETING_EXACT` in
   [`apps/quikit/middleware.ts`](QuikIT_New/apps/quikit/middleware.ts#L82-L96).
4. Add SEO via `buildMetadata(slug)` (`_lib/seo.ts`).

---

## 15. Build & deployment

- **Turbo pipeline** ([turbo.json](QuikIT_New/turbo.json)): `build` depends on
  `^build` (build shared packages first), outputs `.next/**` (minus cache) +
  `dist/**`, and lists all build-time `env` keys so the cache busts on env
  changes. `dev` is uncached + persistent.
- **Standalone output:** each app's `next.config.js` sets `output: "standalone"`
  and `transpilePackages: [@quikit/ui, @quikit/auth, @quikit/shared, …]` so the
  monorepo packages compile into the app bundle.
- **Docker:** multi-stage (`turbo prune` → `npm ci` + `prisma generate` +
  `next build` → minimal runner). `NEXT_PUBLIC_*` build ARGs are written into a
  `.env.production` so `next build` inlines them into the **client** bundle. Any
  `NEXT_PUBLIC_*` change therefore requires a **rebuild**, not just a restart.
- **Deploy gating:** only the `main` branch deploys (per-app `vercel.json`
  `deploymentEnabled: {main: true}` + `ignoreCommand`, plus the dashboard
  Production Branch setting). See root `CLAUDE.md` → "Git Workflow".
- **Shared-package blast radius:** `buildLoginUrl` lives in `packages/shared`.
  Every app depends on it, so a change there redeploys **all** apps on `main`.
  Use `scripts/affected-apps.mjs` before pushing.

> Memory note: production runs on **GKE/k8s** (Cloud SQL + Upstash) for the
> live `*.quikit.ai` hosts in addition to Vercel; `NEXT_PUBLIC_*` are baked at
> image-build time there too.

---

## 16. Dependencies between landing & app modules

**What a landing page depends on:**

- `@quikit/shared/login-url` → `buildLoginUrl` (the only hard cross-package dep).
- The app's own `@/lib/auth` `authOptions` (for the session gate).
- `next/font/google`, `next/navigation`, `next-auth` (framework).
- App-local `_components/*` and `marketing.css`.
- (quiksocial only) `lenis` for smooth scroll.

**What a landing page must NOT depend on:**

- App business modules (leads, KPIs, opportunities, accounts, …).
- Prisma / `@quikit/database` models or API clients.
- `@quikit/ui` dashboard components (`AppSwitcher`, `DataTable`, …).
- Auth context/hooks beyond the server-side `getServerSession` gate.

This isolation is what lets the landing page render for **unauthenticated**
visitors (no tenant, no DB row, no session) and keeps marketing iteration from
destabilising the app. Treat it as an invariant.

---

## 17. Folder structure & file responsibilities

### A product app with a single landing page (QuikScale)

```
apps/quikscale/
├── app/
│   ├── layout.tsx                 # ROOT: <html>/<body>, Providers, globals.css, Jakarta font
│   ├── globals.css                # imports @quikit/ui/styles + app utilities
│   ├── (marketing)/               # PUBLIC landing zone  (URL: /)
│   │   ├── layout.tsx             # fonts (Fraunces+Inter) + metadata + JSON-LD + marketing.css
│   │   ├── page.tsx               # session gate → renders sections
│   │   ├── marketing.css          # purple palette, .stage/.nav/.hero overrides
│   │   └── _components/           # Nav, Hero, FourPillars, Features, …, FooterCTA, ScrollReveal
│   └── (dashboard)/               # AUTHENTICATED zone  (URL: /dashboard, /kpi, …)
│       └── layout.tsx             # never imports marketing.css
├── components/providers.tsx       # SessionProvider → QueryClientProvider → ThemeProvider
├── middleware.ts                  # createMiddleware factory + bounce rewrites
├── next.config.js                 # standalone output, transpilePackages, CSP
├── vercel.json                    # main-only deploy gating
└── public/marketing/              # logo.png, hero media
```

### The launcher (QuikIT) — data-driven, multi-page

```
apps/quikit/app/(marketing)/
├── layout.tsx                     # marketing fonts + shell
├── page.tsx                       # "/" — session gate → loadPage("index") → <StaticPage>
├── [slug]/page.tsx                # "/platform", "/pricing", … (whitelisted via MARKETING_SLUGS)
├── blog/page.tsx, blog/[postSlug]/page.tsx
├── _components/
│   ├── static-page.tsx            # renders JSON page: <style> + dangerouslySetInnerHTML + <Script>
│   ├── static-shell.tsx
│   └── watercolor-intro.tsx
├── _lib/
│   ├── load-page.ts               # MAP (slug→json) + MARKETING_SLUGS whitelist
│   ├── seo.ts                     # buildMetadata(slug)
│   └── schema.ts
└── _data/                         # index/platform/products/pricing/contact/quik*/blog*.json
```

| File | Responsibility |
|---|---|
| `(marketing)/page.tsx` | Session gate; the only place that decides logged-in vs out at `/` |
| `(marketing)/layout.tsx` | Landing fonts, metadata, JSON-LD; imports `marketing.css` |
| `(marketing)/marketing.css` | App palette + landing-class overrides (loads after globals.css) |
| `_components/Nav.tsx` (or `login-href.ts`) | Builds the cross-app `LOGIN_HREF` via `buildLoginUrl` |
| `_lib/load-page.ts` (launcher) | Static content map + slug whitelist |
| `middleware.ts` | Public-route allowlist + login bounce rewriting |

---

## 18. Troubleshooting & debugging

| Symptom | Likely cause | Fix / where to look |
|---|---|---|
| After login, user bounces back to the landing page | Target origin not in the auth redirect allow-list, or cookie bridge skipped | Add origin to `AUTH_ALLOWED_RETURN_ORIGINS`; confirm `buildLoginUrl` chose the `/api/post-login` bridge (cross-origin path) — [login-url.ts:94-107](QuikIT_New/packages/shared/lib/login-url.ts#L94-L107) |
| Logged-in user sees the brochure at `/` | Session gate not hit / wrong `authOptions` | Verify `getServerSession(authOptions)` in `(marketing)/page.tsx`; confirm middleware lets `/` through (it should — gate is in the page, not middleware) |
| `LOGIN_HREF` points at `localhost` / `undefined` in prod | `NEXT_PUBLIC_<APP>_URL` not baked at build, or accessed dynamically | Ensure literal `process.env.NEXT_PUBLIC_*` access (DefinePlugin), and that the Dockerfile wrote it to `.env.production`; rebuild (not restart) — see [§11](#11-environment-variables) |
| Landing fonts/styles wrong, or marketing styles leak into dashboard | CSS source order, or `marketing.css` imported outside the route group | `marketing.css` must be imported only in `(marketing)/layout.tsx`, after `globals.css`; fonts must be on the wrapper `<div>`, not `<body>` |
| New launcher slug 404s | Missing from `MARKETING_SLUGS` / `MAP` | Add to [`_lib/load-page.ts`](QuikIT_New/apps/quikit/app/(marketing)/_lib/load-page.ts) (and `_data/<slug>.json`) |
| New launcher slug redirects to login | Missing from `MARKETING_EXACT` | Add to [`apps/quikit/middleware.ts`](QuikIT_New/apps/quikit/middleware.ts#L82-L96) |
| Invitation email link lands on the wrong host | Email renderer using `NEXT_PUBLIC_AUTH_URL` instead of `QUIKIT_URL` | Post-merge renderers use `QUIKIT_URL`; see `CHANGES_2026-05-19.md` |
| Auth bounces loop / dashboard nav bounces every click | `loginRoute: "/"` makes `isLoginRoute` match everything | Keep `loginRoute` a unique sentinel (`/login`) and rewrite in the wrapper — see [quikscale middleware comment](QuikIT_New/apps/quikscale/middleware.ts#L27-L33) |
| Port confusion in code comments | Stale comments predate the 2026-05-29 swap | Trust `PORT_CONFIG_CHANGES.md` + `.env.local`, not comments |

**General debugging steps:** (1) check the rendered `<a href>` of the Login
button; (2) trace the redirect chain in browser devtools Network (preserve log);
(3) confirm env vars are inlined by grepping the built client bundle for the
expected URL; (4) verify `/auth-handoff` is in `publicRoutes`.

---

## 19. Best practices & recommendations

1. **Keep the `(marketing)/` contract uniform.** Every app: route group +
   session-gated `page.tsx` + `buildLoginUrl` CTA + scoped `marketing.css`.
   Reviewers should reject landing PRs that diverge from this shape.
2. **Never import app/business modules into landing components.** The landing
   page must render with no session and no DB. This is an invariant
   ([§16](#16-dependencies-between-landing--app-modules)).
3. **Always access `NEXT_PUBLIC_*` literally.** Dynamic access silently breaks
   in the client bundle. Prefer the shared helpers.
4. **Centralise the login CTA through `buildLoginUrl`.** Don't hand-roll auth
   URLs in a `Nav` — that's exactly the drift the merge eliminated.
5. **Consider converging the authoring style.** Today the six landing pages span
   data-driven JSON (launcher), React sections (quikscale/quiktrack/quikinfra),
   a ported HTML string (Quikcrm), and CSS-module `.js` (quiksocial). A future
   `@quikit/marketing` package with a shared `MarketingLayout`, `Nav`, and
   section primitives would cut duplication and guarantee the session-gate +
   login-bridge wiring is identical everywhere. Until then, **copy an existing
   app's `(marketing)/` as the template** (quikscale is the cleanest reference).
6. **Treat shared-package changes as platform-wide deploys.** Editing
   `packages/shared/lib/login-url.ts` redeploys every app on `main` — coordinate
   and run `scripts/affected-apps.mjs`.
7. **Keep dark/light scoped.** If a landing page is dark (quiksocial), keep the
   darkness inside `marketing.css` + the route-group wrapper so the dashboard
   stays on the global token system.

---

### Source references (verified)

- Marketing session gate: [apps/quikscale/app/(marketing)/page.tsx](QuikIT_New/apps/quikscale/app/(marketing)/page.tsx), [apps/Quikcrm/app/(marketing)/page.tsx](QuikIT_New/apps/Quikcrm/app/(marketing)/page.tsx), [apps/quikit/app/(marketing)/page.tsx](QuikIT_New/apps/quikit/app/(marketing)/page.tsx)
- Marketing layout / fonts / JSON-LD: [apps/quikscale/app/(marketing)/layout.tsx](QuikIT_New/apps/quikscale/app/(marketing)/layout.tsx), [apps/quiksocial/app/(marketing)/layout.tsx](QuikIT_New/apps/quiksocial/app/(marketing)/layout.tsx)
- Cross-app login bridge: [packages/shared/lib/login-url.ts](QuikIT_New/packages/shared/lib/login-url.ts)
- Login CTA usage: [apps/quikscale/app/(marketing)/_components/Nav.tsx](QuikIT_New/apps/quikscale/app/(marketing)/_components/Nav.tsx), [apps/Quikcrm/app/(marketing)/_components/login-href.ts](QuikIT_New/apps/Quikcrm/app/(marketing)/_components/login-href.ts)
- Launcher static content + slug whitelist: [apps/quikit/app/(marketing)/_lib/load-page.ts](QuikIT_New/apps/quikit/app/(marketing)/_lib/load-page.ts), [apps/quikit/app/(marketing)/[slug]/page.tsx](QuikIT_New/apps/quikit/app/(marketing)/[slug]/page.tsx)
- Middleware: [apps/quikit/middleware.ts](QuikIT_New/apps/quikit/middleware.ts), [apps/quikscale/middleware.ts](QuikIT_New/apps/quikscale/middleware.ts)
- Providers / theme: [apps/quikscale/components/providers.tsx](QuikIT_New/apps/quikscale/components/providers.tsx), [apps/quikscale/app/layout.tsx](QuikIT_New/apps/quikscale/app/layout.tsx)
- Build/env: [turbo.json](QuikIT_New/turbo.json), [packages/shared/lib/env.ts](QuikIT_New/packages/shared/lib/env.ts)
- Merge changelogs: [CHANGES_2026-05-19.md](QuikIT_New/CHANGES_2026-05-19.md), [ENV_CHANGES_2026-05-19.md](QuikIT_New/ENV_CHANGES_2026-05-19.md), [PORT_CONFIG_CHANGES.md](QuikIT_New/PORT_CONFIG_CHANGES.md)
