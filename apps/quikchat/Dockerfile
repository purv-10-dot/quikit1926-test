# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikchat` Next.js app.
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm install --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/quikchat/Dockerfile -t quikchat:latest .
# Build with custom DATABASE_URL (optional — defaults pass build-time Prisma init):
#   docker build --build-arg DATABASE_URL="postgresql://..." -f apps/quikchat/Dockerfile -t quikchat:latest .

FROM node:20-alpine AS base
# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quikchat` + its workspace deps
# The prune target must match the "name" field in apps/quikchat/package.json.
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quikchat --docker
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
ARG NEXT_PUBLIC_QUIKCHAT_URL="https://placeholder.com"
# The realtime gateway's public WebSocket origin. NEXT_PUBLIC_* → baked into the
# client bundle AND read by next.config.js to whitelist the origin in the CSP
# connect-src at build time. MUST be passed for UAT/prod or the browser socket
# fails to connect and the CSP blocks it. QuikChat-specific (only app with a
# realtime gateway).
ARG NEXT_PUBLIC_REALTIME_WS_URL="wss://placeholder.com"
ARG NEXT_PUBLIC_SENTRY_DSN
ARG QUIKIT_URL="https://dummy-quikit.local"
ARG QUIKIT_CLIENT_ID="dummy-client-id"
ARG QUIKIT_CLIENT_SECRET="dummy-client-secret"

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_QUIKCHAT_URL=$NEXT_PUBLIC_QUIKCHAT_URL
ENV NEXT_PUBLIC_REALTIME_WS_URL=$NEXT_PUBLIC_REALTIME_WS_URL
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
      "QUIKCHAT=$NEXT_PUBLIC_QUIKCHAT_URL" \
      "REALTIME=$NEXT_PUBLIC_REALTIME_WS_URL" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

# QuikChat runs on the single shared central Prisma client (packages/database).
# Any `app_quikchat` tables are Postgres schemas inside that one multi-schema
# datasource, so generating the central client is enough — there is no
# dedicated app-local schema or client.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN mkdir -p apps/quikchat/public
RUN mkdir -p apps/quikchat/.next/static
# Write .env.production from ARG/ENV values so Next.js loadEnv()
# picks them up deterministically. Bypasses turbo's env filtering
# (the previous failure mode: shell ENV was set but didn't reach
# Next's process.env during next build, leaving client bundles
# with undefined NEXT_PUBLIC_* values).
RUN printf '%s\n' \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_QUIKCHAT_URL=$NEXT_PUBLIC_QUIKCHAT_URL" \
  "NEXT_PUBLIC_REALTIME_WS_URL=$NEXT_PUBLIC_REALTIME_WS_URL" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  > apps/quikchat/.env.production && cat apps/quikchat/.env.production

RUN npx turbo build --filter=quikchat

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
ENV PORT=3011
ENV HOSTNAME="0.0.0.0"

# Standalone server (Next 14 monorepo output: apps/quikchat/server.js)
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikchat/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikchat/.next/static    ./apps/quikchat/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikchat/public          ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikchat/public          ./apps/quikchat/public

# Prisma client (engine + generated bindings); standalone doesn't always trace these
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma

USER nextjs
EXPOSE 3011

# The central schema is owned and migrated out-of-band (integration owner /
# Neon), exactly like quikcrm / quikscale / quiktrack / quikinfra. The container
# does not run `prisma db push` at startup — pushing the full multi-schema
# datasource from an app container would touch every other app's tables and is
# unsafe in production.
CMD ["node", "apps/quikchat/server.js"]
