# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikinfra` Next.js app.
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm install --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/quikinfra/Dockerfile -t quikinfra:latest .
# Build with custom DATABASE_URL (optional — defaults pass build-time Prisma init):
#   docker build --build-arg DATABASE_URL="postgresql://..." -f apps/quikinfra/Dockerfile -t quikinfra:latest .

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quikinfra` + its workspace deps
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quikinfra --docker

# ─────────────────────────────────────────────────────────────────────────
# Stage 2 — installer: install pruned deps + generate Prisma + build
# --ignore-scripts skips packages/database's postinstall (we run prisma
# generate explicitly below so it picks up the right schema paths).
# ─────────────────────────────────────────────────────────────────────────
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm install --ignore-scripts

COPY --from=builder /app/out/full/ .
COPY turbo.json turbo.json
COPY tsconfig.base.json tsconfig.base.json

# Build-time placeholders — `next build` instantiates Prisma at "Collect
# page data" time. They are never used to connect to a real DB.
ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
ARG DATABASE_URL_DIRECT="postgresql://x:x@localhost:5432/x"
ARG NEXTAUTH_URL="https://placeholder.com"
ARG NEXT_PUBLIC_AUTH_URL="https://placeholder.com"
ARG NEXT_PUBLIC_QUIKIT_URL="https://placeholder.com"
ARG NEXT_PUBLIC_QUIKINFRA_URL="https://placeholder.com"
ARG NEXT_PUBLIC_SENTRY_DSN
# Server-side OAuth client config. lib/auth.ts throws at *import* time when
# these are unset, and `next build` evaluates the NextAuth route module while
# collecting page data — so non-empty placeholders are required for the build
# to pass. Real values are injected at container runtime (see docker-compose).
ARG QUIKIT_URL="https://placeholder.com"
ARG QUIKIT_CLIENT_ID="build-time-dummy"
ARG QUIKIT_CLIENT_SECRET="build-time-dummy"

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_QUIKINFRA_URL=$NEXT_PUBLIC_QUIKINFRA_URL
ENV QUIKIT_URL=$QUIKIT_URL
ENV QUIKIT_CLIENT_ID=$QUIKIT_CLIENT_ID
ENV QUIKIT_CLIENT_SECRET=$QUIKIT_CLIENT_SECRET
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Opt `next build` into standalone output (gated in next.config.js so local
# `next build` on Windows is unaffected by the symlink requirement).
ENV NEXT_BUILD_STANDALONE=1

# Cache-bust: embed ARG values into the RUN command string so BuildKit
# invalidates this layer (and the build that follows) whenever the
# NEXT_PUBLIC_* / NEXTAUTH_URL build-args change. Without this line,
# BuildKit reuses the cached `npx turbo build` layer and the new ARG
# values never reach `next build`.
RUN echo "[next-env-bake]" \
      "AUTH=$NEXT_PUBLIC_AUTH_URL" \
      "QUIKIT=$NEXT_PUBLIC_QUIKIT_URL" \
      "QUIKINFRA=$NEXT_PUBLIC_QUIKINFRA_URL" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

# QuikInfra has TWO Prisma schemas: the shared platform schema
# (packages/database) and its own dedicated `app_quikinfra` schema, which
# generates to a custom output (node_modules/.prisma-qc2) to avoid clobbering
# the shared client. Both must be generated before the build.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npx prisma generate --schema=apps/quikinfra/prisma/schema.prisma
# Generate app-tables.sql from the app-local datamodel (no DB introspection,
# so it never trips P4002). The entrypoint applies this at runtime to create
# the app's tables (Companies, Vendors, ...). Make CREATE TABLE/INDEX
# idempotent so a re-apply is harmless even outside the entrypoint guard.
RUN npx prisma migrate diff \
      --from-empty \
      --to-schema-datamodel apps/quikinfra/prisma/schema.prisma \
      --script > app-tables.raw.sql \
 && sed -E \
      -e 's/^CREATE TABLE /CREATE TABLE IF NOT EXISTS /' \
      -e 's/^CREATE UNIQUE INDEX /CREATE UNIQUE INDEX IF NOT EXISTS /' \
      -e 's/^CREATE INDEX /CREATE INDEX IF NOT EXISTS /' \
      app-tables.raw.sql > app-tables.sql \
 && rm app-tables.raw.sql \
 && test -s app-tables.sql
RUN mkdir -p apps/quikinfra/public
RUN mkdir -p apps/quikinfra/.next/static
# Write .env.production from ARG/ENV values so Next.js loadEnv()
# picks them up deterministically. Bypasses turbo's env filtering
# (the previous failure mode: shell ENV was set but didn't reach
# Next's process.env during next build, leaving client bundles
# with undefined NEXT_PUBLIC_* values).
RUN printf '%s\n' \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_QUIKINFRA_URL=$NEXT_PUBLIC_QUIKINFRA_URL" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  > apps/quikinfra/.env.production && cat apps/quikinfra/.env.production

RUN npx turbo build --filter=quikinfra

# ─────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal image, standalone server + Prisma engines
# ─────────────────────────────────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3006
ENV HOSTNAME="0.0.0.0"
# Root for document/asset uploads (see docker-compose volume mount).
ENV QC_DOCS_ROOT=/app/uploads

# Standalone server (Next 14 monorepo output: apps/quikinfra/server.js)
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/.next/static    ./apps/quikinfra/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/public          ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/public          ./apps/quikinfra/public

# Prisma clients (engine + generated bindings); standalone doesn't always trace
# these. Two clients: the shared platform client (@prisma/.prisma) and the
# dedicated app_quikinfra client (.prisma-qc2, custom output path).
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma                       ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma                       ./node_modules/.prisma
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/node_modules/.prisma-qc2    ./apps/quikinfra/node_modules/.prisma-qc2

# Prisma CLI + both schemas — needed so docker-entrypoint.sh can run
# `prisma db push` against the live DB at startup (the image build only
# generated the client; it never created the tables). db push is history-free,
# so it works on a dump-restored DB where `migrate deploy` would fail (P3005).
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/prisma                         ./node_modules/prisma
COPY --from=installer --chown=nextjs:nodejs /app/packages/database/prisma/schema.prisma      ./packages/database/prisma/schema.prisma
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikinfra/prisma/schema.prisma         ./apps/quikinfra/prisma/schema.prisma
COPY --from=installer --chown=nextjs:nodejs /app/app-tables.sql                              ./app-tables.sql
# Entrypoint is inlined here (single-file) via a heredoc. It reconciles the DB
# before serving: (1) `prisma db push` the shared platform schema, then
# (2) create the app-local tables from app-tables.sql — but only if they're
# missing (guarded by probing app_quikinfra."Companies"). app-tables.sql is
# generated at build via `migrate diff --from-empty`, so it has no cross-schema
# FKs and never trips P4002. Creating all 73 app tables in one apply means every
# masters/purchase/store API works. Bypass the whole sync with QC_SKIP_DB_SYNC=1.
# (Quoted delimiter 'EOSH' => no build-time expansion; $VARS resolve at runtime.)
COPY --chmod=0755 --chown=nextjs:nodejs <<'EOSH' ./docker-entrypoint.sh
#!/bin/sh
set -e

PRISMA="node node_modules/prisma/build/index.js"

if [ "${QC_SKIP_DB_SYNC}" = "1" ]; then
  echo "[entrypoint] QC_SKIP_DB_SYNC=1 — skipping schema sync"
else
  echo "[entrypoint] syncing shared platform schema (packages/database)…"
  $PRISMA db push \
    --schema=packages/database/prisma/schema.prisma \
    --skip-generate

  echo "[entrypoint] checking app-local tables (apps/quikinfra)…"
  # Probe for app_quikinfra."Companies" via the app's own .prisma-qc2 client.
  # "present" => skip; anything else (incl. failure) => attempt creation.
  # The heredoc body / closing APPCHECK must stay at column 0 (sh heredoc rule).
APP_TABLES=$(node <<'APPCHECK'
const { PrismaClient } = require("./apps/quikinfra/node_modules/.prisma-qc2/client");
const db = new PrismaClient();
db.$queryRawUnsafe('SELECT to_regclass(\'app_quikinfra."Companies"\') AS t')
  .then((r) => process.stdout.write(r && r[0] && r[0].t != null ? "present" : "missing"))
  .catch(() => process.stdout.write("missing"))
  .finally(() => db.$disconnect());
APPCHECK
)

  case "$APP_TABLES" in
    *present*)
      echo "[entrypoint] app-local tables already present — skipping"
      ;;
    *)
      echo "[entrypoint] creating app-local tables (Companies, Vendors, Projects, Departments, Items, …) from app-tables.sql…"
      $PRISMA db execute \
        --schema=apps/quikinfra/prisma/schema.prisma \
        --file app-tables.sql
      echo "[entrypoint] app-local tables created"
      ;;
  esac

  echo "[entrypoint] schema sync complete"
fi

echo "[entrypoint] starting server on :${PORT:-3006}"
exec node apps/quikinfra/server.js
EOSH

RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3006

# Entrypoint reconciles the DB schema (db push, both schemas) before serving.
# Set QC_SKIP_DB_SYNC=1 to bypass when schema is managed out-of-band.
CMD ["sh", "docker-entrypoint.sh"]
