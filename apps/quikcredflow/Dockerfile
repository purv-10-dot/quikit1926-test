# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikcredflow` Next.js app.
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm install --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/quikcredflow/Dockerfile -t quikcredflow:latest .
# Build with custom DATABASE_URL (optional — defaults pass build-time Prisma init):
#   docker build --build-arg DATABASE_URL="postgresql://..." -f apps/quikcredflow/Dockerfile -t quikcredflow:latest .
#
# ─────────────────────────────────────────────────────────────────────────
# RUNTIME CONTRACT (injected by the deploy manifest — NOT baked into this image)
# ─────────────────────────────────────────────────────────────────────────
# The deploy manifest (managed in DevOps' own repo; image tag + deploy are
# manual) is responsible for supplying the REAL runtime environment. The build
# ARGs below are dummy placeholders used ONLY for build-time Prisma init and
# NEXT_PUBLIC_* inlining — none of them are real config.
#
# The deploy manifest MUST inject at runtime:
#   • DATABASE_URL          — pooled connection (from k8s secrets)
#   • DATABASE_URL_DIRECT   — direct (non-pooled) connection, for Prisma
#                             migrations/DDL/advisory locks. Prisma needs BOTH;
#                             a pooled-only setup can break migrations/locks.
#   • NEXTAUTH_SECRET, INTERNAL_SECRET, JWT_SECRET, NEXTAUTH_URL (quikcredflow's own origin)
#   • QUIKIT_URL / QUIKIT_CLIENT_ID / QUIKIT_CLIENT_SECRET (SSO)
#   • REDIS_URL (queues + SSO handoff replay guard — fails open if unset)
#   • RP_DIGITAL_WEBHOOK_SECRET (+ telephony/email/LeadSquared secrets as used)
#   • App port: 3076 (see ENV PORT in the runner stage below)
# The four NEXT_PUBLIC_* vars are inlined at BUILD time (see ARGs below), so they
# must ALSO be present as build-args in CI, not only at runtime.
# See apps/quikcredflow/.env.local.example for the full, authoritative variable list.

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quikcredflow` + its workspace deps
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quikcredflow --docker

# ─────────────────────────────────────────────────────────────────────────
# Stage 2 — installer: install pruned deps + generate Prisma + build
# --ignore-scripts skips packages/database's postinstall (we run prisma
# generate explicitly below so it picks up the right schema path).
# ─────────────────────────────────────────────────────────────────────────
FROM base AS installer
RUN apk update && apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=builder /app/out/json/ .
COPY --from=builder /app/out/package-lock.json ./package-lock.json
RUN npm ci --ignore-scripts

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
ARG NEXT_PUBLIC_APP_URL="https://placeholder.com"
ARG NEXT_PUBLIC_DASHBOARD_REFRESH_MS="60000"
ARG NEXT_PUBLIC_SENTRY_DSN
ARG QUIKIT_URL="https://dummy-quikit.local"
ARG QUIKIT_CLIENT_ID="dummy-client-id"
ARG QUIKIT_CLIENT_SECRET="dummy-client-secret"

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_DASHBOARD_REFRESH_MS=$NEXT_PUBLIC_DASHBOARD_REFRESH_MS
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ENV QUIKIT_URL=$QUIKIT_URL
ENV QUIKIT_CLIENT_ID=$QUIKIT_CLIENT_ID
ENV QUIKIT_CLIENT_SECRET=$QUIKIT_CLIENT_SECRET
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
      "APP=$NEXT_PUBLIC_APP_URL" \
      "DASHREFRESH=$NEXT_PUBLIC_DASHBOARD_REFRESH_MS" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

# quikcredflow runs on the single shared central Prisma client (packages/database).
# The `app_quikcredflow` tables are Postgres schemas inside that one multi-schema
# datasource, so generating the central client is enough — there is no
# dedicated app-local schema or client.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN mkdir -p apps/quikcredflow/public
RUN mkdir -p apps/quikcredflow/.next/static
# Write .env.production from ARG/ENV values so Next.js loadEnv()
# picks them up deterministically. Bypasses turbo's env filtering
# (the previous failure mode: shell ENV was set but didn't reach
# Next's process.env during next build, leaving client bundles
# with undefined NEXT_PUBLIC_* values).
RUN printf '%s\n' \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL" \
  "NEXT_PUBLIC_DASHBOARD_REFRESH_MS=$NEXT_PUBLIC_DASHBOARD_REFRESH_MS" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  > apps/quikcredflow/.env.production && cat apps/quikcredflow/.env.production

RUN npx turbo build --filter=quikcredflow

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
ENV PORT=3076
ENV HOSTNAME="0.0.0.0"

# Standalone server (Next 14 monorepo output: apps/quikcredflow/server.js)
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikcredflow/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikcredflow/.next/static    ./apps/quikcredflow/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikcredflow/public          ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikcredflow/public          ./apps/quikcredflow/public

# Prisma client (engine + generated bindings); standalone doesn't always trace these
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma

# sharp: required by Next.js image optimization in standalone/production mode.
# It is NOT a quikcredflow dependency, so Next's file tracer never copies it into
# .next/standalone — install the linux-musl build explicitly into the runner's
# node_modules so `next/image` optimization works at runtime.
# (musl because the base image is node:20-alpine.)
#
# Install in an ISOLATED dir with a throwaway package.json: running `npm install`
# at /app re-reads the standalone monorepo package.json, enumerates the
# workspace deps, and tries to resolve the unpublished `@quikit/*` packages from
# the public registry (E404: '@quikit/ui@*' is not in this registry). Installing
# under an empty package.json avoids reading any workspace manifest, then we copy
# just sharp + its @img platform binaries into the runner's node_modules.
RUN mkdir -p /tmp/sharp-install \
 && cd /tmp/sharp-install \
 && echo '{"name":"sharp-install","private":true}' > package.json \
 && npm install --no-save --os=linux --libc=musl --cpu=x64 sharp@0.33.5 \
 && mkdir -p /app/node_modules \
 && cp -R /tmp/sharp-install/node_modules/sharp /app/node_modules/sharp \
 && cp -R /tmp/sharp-install/node_modules/@img  /app/node_modules/@img \
 && rm -rf /tmp/sharp-install \
 && chown -R nextjs:nodejs /app/node_modules/sharp /app/node_modules/@img

USER nextjs
EXPOSE 3076

# The central schema is owned and migrated out-of-band (integration owner /
# Neon), exactly like quikcrm / quikscale / quiktrack. The container does not
# run `prisma db push` at startup — pushing the full multi-schema datasource
# from an app container would touch every other app's tables and is unsafe in
# production.
CMD ["node", "apps/quikcredflow/server.js"]
