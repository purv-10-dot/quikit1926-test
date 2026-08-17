# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikflow` Next.js app (the Builder UI —
# NOT the execution worker; see Dockerfile.worker for that standalone process).
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm ci + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/quikflow/Dockerfile -t quikflow:latest .
# Build with custom DATABASE_URL (optional — defaults pass build-time Prisma init):
#   docker build --build-arg DATABASE_URL="postgresql://..." -f apps/quikflow/Dockerfile -t quikflow:latest .
#
# For UAT/prod the origin-bearing args below MUST be passed — next.config.js
# reads NEXT_PUBLIC_QUIKFLOW_URL at build time to add the deployed host to
# serverActions.allowedOrigins, and an origin that is missing at build time can
# never be added at runtime:
#   --build-arg NEXT_PUBLIC_QUIKFLOW_URL="https://uatflow.quikit.ai"
#   --build-arg QUIKFLOW_URL="https://uatflow.quikit.ai"
#   --build-arg NEXT_PUBLIC_AUTH_URL="https://uatauthn.quikit.ai"
#
# NEXTAUTH_URL is a RUNTIME concern for this app — NextAuth builds its callback
# URLs from it, so the pod's env must set it to this app's own origin
# (https://uatflow.quikit.ai), not the shared IdP host. The build-arg default
# above is only a placeholder that lets `next build` collect page data.

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quikflow` + its workspace deps
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quikflow --docker

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

# Build-time placeholders — `next build` instantiates Prisma / reads these
# at "Collect page data" time. They are never used to connect to anything
# real; the runner stage receives live values via the orchestrator's env.
ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
# packages/database/prisma/schema.prisma declares `directUrl = env("DATABASE_URL_DIRECT")`.
# Prisma resolves it at generate time, so it needs a value here too.
ARG DATABASE_URL_DIRECT="postgresql://x:x@localhost:5432/x"
ARG NEXTAUTH_URL="https://placeholder.com"
ARG NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ARG QUIKIT_URL="https://placeholder.com"
ARG QUIKIT_ISSUER_URL="https://placeholder.com"
ARG QUIKIT_CLIENT_ID="build-time-placeholder"
ARG QUIKIT_CLIENT_SECRET="build-time-placeholder"
ARG QUIKSCALE_URL="https://placeholder.com"
ARG NEXT_PUBLIC_AUTH_URL="https://placeholder.com"
ARG NEXT_PUBLIC_QUIKIT_URL="https://placeholder.com"
# This app's own public origin (UAT: https://uatflow.quikit.ai). MUST be passed
# for UAT/prod: next.config.js reads it at build time to add the deployed host
# to serverActions.allowedOrigins, and an origin missing at build time can never
# be added at runtime — every Server Action would 403 behind the ingress.
ARG NEXT_PUBLIC_QUIKFLOW_URL="https://placeholder.com"
# Server-side twin of the above. Used to build the OAuth connector redirect URIs
# ({QUIKFLOW_URL}/api/connections/{gmail|outlook|teams}/callback), which must
# match what is registered in Google Cloud / Azure AD for the UAT host.
ARG QUIKFLOW_URL="https://placeholder.com"
ARG NEXT_PUBLIC_SENTRY_DSN

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV QUIKIT_URL=$QUIKIT_URL
ENV QUIKIT_ISSUER_URL=$QUIKIT_ISSUER_URL
ENV QUIKIT_CLIENT_ID=$QUIKIT_CLIENT_ID
ENV QUIKIT_CLIENT_SECRET=$QUIKIT_CLIENT_SECRET
ENV QUIKSCALE_URL=$QUIKSCALE_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_QUIKFLOW_URL=$NEXT_PUBLIC_QUIKFLOW_URL
ENV QUIKFLOW_URL=$QUIKFLOW_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Opt `next build` into standalone output (gated in next.config.js so local
# `next build` on Windows is unaffected by the symlink requirement). The runner
# stage below COPYs .next/standalone — without this the build fails there.
ENV NEXT_BUILD_STANDALONE=1

# Cache-bust: embed ARG values into the RUN command string so BuildKit
# invalidates this layer (and the build that follows) whenever the
# NEXT_PUBLIC_* / NEXTAUTH_URL build-args change. Without this line,
# BuildKit reuses the cached `npx turbo build` layer and new ARG values
# never reach `next build`.
RUN echo "[next-env-bake]" \
      "AUTH=$NEXT_PUBLIC_AUTH_URL" \
      "QUIKIT=$NEXT_PUBLIC_QUIKIT_URL" \
      "QUIKFLOW=$NEXT_PUBLIC_QUIKFLOW_URL" \
      "QUIKFLOW_SERVER=$QUIKFLOW_URL" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN mkdir -p apps/quikflow/public
RUN mkdir -p apps/quikflow/.next/static
# Write .env.production from ARG/ENV values so Next.js loadEnv() picks
# them up deterministically (bypasses turbo's env filtering — shell ENV
# set but not reaching Next's process.env during `next build` otherwise
# leaves client bundles with undefined NEXT_PUBLIC_* values).
#
# NEXT_BUILD_STANDALONE is listed here as well as in turbo.json's build.env:
# turbo@2 defaults to strict env mode, and next.config.js reads this flag while
# evaluating the config, before any task-level env would apply.
RUN printf '%s\n' \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_QUIKFLOW_URL=$NEXT_PUBLIC_QUIKFLOW_URL" \
  "QUIKFLOW_URL=$QUIKFLOW_URL" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  "NEXT_BUILD_STANDALONE=1" \
  > apps/quikflow/.env.production && cat apps/quikflow/.env.production

RUN npx turbo build --filter=quikflow

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
ENV PORT=3014
ENV HOSTNAME="0.0.0.0"

# Standalone server (Next 14 monorepo output: apps/quikflow/server.js)
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikflow/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikflow/.next/static    ./apps/quikflow/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikflow/public          ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikflow/public          ./apps/quikflow/public

# Prisma client (engine + generated bindings); standalone doesn't always trace these
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma

USER nextjs
EXPOSE 3014

CMD ["node", "apps/quikflow/server.js"]
