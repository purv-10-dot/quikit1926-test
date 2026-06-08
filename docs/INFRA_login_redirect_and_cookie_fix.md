# Infra change-spec — `0.0.0.0:3001` login redirect + stale-cookie lockout

This is the **deployment-side** half of the fix for: production login redirecting
to `https://0.0.0.0:3001/login?reason=no_session`, and users having to manually
clear cookies/site data (`apps.quikit.ai`, `authn.quikit.ai`) to log in again.

The application-code half (resilient base-URL resolution + server-driven cookie
eviction) ships in this repo (`packages/auth/public-url.ts`,
`packages/auth/session-cookies.ts`, `packages/auth/middleware.ts`,
`apps/auth/app/api/post-login/route.ts`, all `app/auth-handoff/route.ts`,
`apps/auth/next.config.js`). The two items below live in the **external infra
repo** (GKE manifests / Helm) and must be applied there.

Root cause recap: the Next.js standalone server binds `HOSTNAME=0.0.0.0` /
`PORT=<app port>` (each app's Dockerfile). Redirects were built from
`request.url`; when the ingress doesn't preserve the public `Host` header, the
pod sees `Host: 0.0.0.0:3001` and that bind address leaks into the redirect.
`NEXTAUTH_URL` is only a **build-time** value in the image, so if it isn't
re-injected at **runtime** the app has no authoritative public origin to use
instead.

---

## 1. Runtime environment variables (ConfigMap / Secret per app Deployment)

`NEXTAUTH_URL` and the other server-side vars below are **runtime** values. They
must be present in each app pod's environment (`envFrom` ConfigMap/Secret or
explicit `env:`), NOT only as Docker build args. Set `NEXTAUTH_URL` per app to
**that app's own public origin** (it is each app's canonical self-URL; the
`/auth-handoff` cookie is host-only and must be set on the same host).

| App (pod)        | `NEXTAUTH_URL` (per-app, own origin) | Notes |
|------------------|--------------------------------------|-------|
| auth             | `https://authn.quikit.ai`            | central IdP |
| quikit (launcher)| `https://apps.quikit.ai`             |       |
| admin            | `https://orgadmin.quikit.ai`         |       |
| quikscale        | `https://scale.quikit.ai`            |       |
| quiktrack        | `https://track.quikit.ai`            |       |
| quikinfra        | `https://infra.quikit.ai`            |       |
| quikcrm          | `https://quikcrm.quikit.ai`          |       |
| quiksocial       | `https://social.quikit.ai`           |       |

Identical across **all** apps (same value everywhere):

| Var | Value |
|---|---|
| `NEXT_PUBLIC_AUTH_URL`   | `https://authn.quikit.ai` (the central auth, used to build `centralLoginUrl`) |
| `NEXT_PUBLIC_QUIKIT_URL` | `https://apps.quikit.ai` |
| `NEXTAUTH_SECRET`        | one shared secret, **identical** across every app (JWT signing) |
| `INTERNAL_SECRET`        | one shared secret, **identical** across every app (handoff + `/api/verify-token`) |
| `REDIS_URL`              | the Upstash/Redis URL (session store + soft-revocation) |
| `DATABASE_URL` / `DATABASE_URL_DIRECT` | pooled + direct Postgres URLs |

> `NEXT_PUBLIC_*` are baked into the client bundle at **build** time
> (`.github/workflows/docker-build-ghcr.yml` build-args) and **cannot** be
> overridden at runtime. The values above already match the build args; if any
> change, the image must be **rebuilt**, not just re-deployed.

### Validation after rollout
```sh
kubectl exec deploy/auth -- printenv NEXTAUTH_URL NEXT_PUBLIC_AUTH_URL INTERNAL_SECRET REDIS_URL
# NEXTAUTH_URL must print https://authn.quikit.ai (NOT localhost / empty / 0.0.0.0)
```

---

## 2. Ingress / reverse proxy — preserve the public Host

Configure the ingress so the pod receives the **original** public Host header and
the standard forwarded headers. This makes `request.url` correct at the edge,
before the app-side fallback even matters.

### nginx-ingress (ingress-nginx)
Host is preserved by default (`proxy_set_header Host $host`). Ensure nothing
overrides it, and that forwarded headers are passed (also default):
```
proxy_set_header Host              $host;
proxy_set_header X-Forwarded-Host  $host;
proxy_set_header X-Forwarded-Proto $scheme;
```
Do **not** set `nginx.ingress.kubernetes.io/upstream-vhost` to the service name
(that rewrites Host to the backend address — the exact failure mode here).

### GCE / GKE L7 Ingress (default GKE)
The GCLB preserves the client Host header by default. If a custom backend /
URL-map rewrite is in place, remove any Host rewrite to the backend service.

### App-side defense-in-depth (already shipped)
`packages/auth/public-url.ts` resolves the origin as: `NEXTAUTH_URL` →
`X-Forwarded-Host`(+`X-Forwarded-Proto`) → request Host (only if not a bind
address). So once **either** §1 or §2 is correct, redirects resolve to the public
domain. Doing both is recommended.

---

## 2b. Why "any route (even a 404) → login when the session is invalid" needs `INTERNAL_SECRET`

Next.js middleware runs **before** route resolution, so it fires on
non-existent paths too — when it returns a redirect, the 404 page never
renders. The middleware redirects to login in two cases:

- **No decodable token** (`!token`) → always redirects to login. A logged-out
  user hitting *any* protected or non-existent route lands on login, never 404.
- **Token present but its Redis session is expired/revoked** → caught only by
  the *remote validation* call to `/api/verify-token`, which runs when
  `INTERNAL_SECRET` **and** `centralLoginUrl` (`NEXT_PUBLIC_AUTH_URL`) are set.

The JWE session cookie stays cryptographically valid for its full maxAge, so a
**Redis-expired** session is indistinguishable from a live one *without* the
remote check. If `INTERNAL_SECRET` is missing (e.g. local dev), middleware
trusts the still-valid JWE, passes the request through, and a non-existent path
falls to Next's 404 — which is exactly the `localhost:3003/apps` 404 observed
(quikscale has no `/apps` route, and local dev had no remote validation).

**Action:** set `INTERNAL_SECRET` (identical value) on every app pod so an
expired/revoked Redis session is detected on every non-public route — existing
or 404 — and redirected to login (with cookies evicted). This is already listed
in §1; it is the switch that makes the "invalid session → login everywhere"
behaviour work.

## 3. Already-stuck users on live

After this ships, users currently holding stale cookies recover automatically:
- The app no longer redirects to `0.0.0.0:3001`, so the login page is reachable.
- On the next protected-route navigation, middleware detects the
  invalid/absent session and returns `Set-Cookie … Max-Age=0` for every NextAuth
  cookie (incl. `__Secure-`/`__Host-` with `Secure` set), and the `no_session`
  path on the auth host does the same. No manual "clear site data" needed.

---

## 4. Rollout order
1. Apply §1 runtime env (per-app `NEXTAUTH_URL` + shared secrets/Redis/DB).
2. Apply §2 ingress Host preservation.
3. Deploy the app images carrying the code fix.
4. Smoke test from a fresh profile **and** a profile with stale cookies:
   `https://authn.quikit.ai/login` reachable → login → handoff → dashboard,
   on both — no `0.0.0.0`, no manual cookie clear.
