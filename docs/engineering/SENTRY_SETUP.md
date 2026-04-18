# Sentry Integration

**Status**: Wired across all 3 apps as of commit `<TBD>`.

## Architecture

```
apps/<app>/
  ├── sentry.client.config.ts   ← runs in browser
  ├── sentry.server.config.ts   ← runs in Node.js (API routes, SSR)
  ├── sentry.edge.config.ts     ← runs at the edge (middleware)
  ├── instrumentation.ts        ← entry for server/edge configs
  └── app/sentry-init.tsx       ← entry for client config, mounted in layout
```

`instrumentation.ts` is Next.js 14's built-in hook for server/edge startup.
`app/sentry-init.tsx` is a `"use client"` component rendering `null` — its
side-effect import of `sentry.client.config` is what triggers `Sentry.init()`
on first client render.

Both mounting points are **no-ops when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`
are unset**. So the code ships safely even before Sentry is configured.

## Required Vercel env vars (per app)

For each app (`quik-it`, `quikscale`, `quik-it-admin`), add:

| Var | Value source | Required? | Public/Private |
|---|---|---|---|
| `SENTRY_DSN` | `sentry.io → Project → Settings → Client Keys` | For server errors | Private (server-only) |
| `NEXT_PUBLIC_SENTRY_DSN` | same DSN as above | For client errors | Public (bundled) |

**Note**: `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` typically hold the SAME
value. The split exists only because Next.js exposes `NEXT_PUBLIC_*` vars
to the browser bundle automatically.

**Optional** (enables source map upload for better stack traces):

| Var | Value | Notes |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | `sentry.io → Settings → Auth Tokens` | Only needed if using `withSentryConfig()` wrapper — we don't today |
| `SENTRY_ORG` | your Sentry org slug | Same |
| `SENTRY_PROJECT` | project slug (one per app) | Same |

## Sample rates

Defaults in the config files:

| Metric | Production | Dev |
|---|---|---|
| `tracesSampleRate` | 0.1 (10%) | 1.0 (100%) |
| `replaysSessionSampleRate` | 0 (off) | 0 |
| `replaysOnErrorSampleRate` | 0 (off) | 0 |

Session replay is off by default — it's expensive and heavy. Turn it on
later if a specific bug is hard to reproduce from logs alone.

## Verifying it works

Once DSN is set + Vercel redeployed:

1. Visit any app on prod
2. In browser console, run: `throw new Error("sentry smoke test")`
3. Check Sentry dashboard — error should appear within ~30s with full stack trace

For server-side, trigger an intentional error:
```bash
curl https://<app>.vercel.app/api/this-route-does-not-exist
```
Sentry should capture the 500.

## Cost / volume

Sentry free tier:
- 5,000 errors/month
- 10,000 performance events/month

With `tracesSampleRate: 0.1` and expected volume (<1k tenants), we'll stay
well under the free limits for the next 12 months. Bump to paid when you
have 20+ active paying customers.

## Troubleshooting

**No errors showing up in Sentry**:
- Verify env vars are set in Vercel Production (not just Preview)
- Verify `NODE_ENV !== "development"` — we suppress dev errors by design
- Check Vercel function logs for `[sentry]` warnings
- DSN in URL format: `https://<key>@o0000.ingest.sentry.io/<projectid>`

**Errors show up but stack traces are useless (minified)**:
- Upgrade to `withSentryConfig()` wrapper in next.config.js — this enables
  source map upload
- See https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/
