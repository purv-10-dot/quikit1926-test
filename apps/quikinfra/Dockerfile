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
ARG NEXT_PUBLIC_QUIKINFRA_URL="https://placeholder.com"
ARG NEXT_PUBLIC_SENTRY_DSN
ARG QUIKIT_URL="https://dummy-quikit.local"
ARG QUIKIT_CLIENT_ID="dummy-client-id"
ARG QUIKIT_CLIENT_SECRET="dummy-client-secret"

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_QUIKINFRA_URL=$NEXT_PUBLIC_QUIKINFRA_URL
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
      "QUIKINFRA=$NEXT_PUBLIC_QUIKINFRA_URL" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

# QuikInfra now runs on the single shared central Prisma client
# (packages/database). The `app_quikinfra` tables are Postgres schemas inside
# that one multi-schema datasource, so generating the central client is enough —
# there is no longer a dedicated app-local schema or `.prisma-qc2` client.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
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

# Prisma client (engine + generated bindings); standalone doesn't always trace
# these. Single shared central client only (@prisma/.prisma) — the former
# dedicated `.prisma-qc2` app client no longer exists.
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma

RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3006

# The central schema is owned and migrated out-of-band (integration owner /
# Neon), exactly like quiktrack and quikscale. The container no longer runs
# `prisma db push` at startup — pushing the full multi-schema datasource from
# an app container would touch every other app's tables (app_quikscale,
# app_quiktrack, auth, public, …) and is unsafe in production.
CMD ["node", "apps/quikinfra/server.js"]
