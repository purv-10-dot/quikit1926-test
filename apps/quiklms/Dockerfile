# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quiklms` Next.js app.
# Pattern: turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm install --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma engines, non-root)
#
# Build (from monorepo root):
#   docker build -f apps/quiklms/Dockerfile -t quiklms:latest .
# Build with custom DATABASE_URL (optional — defaults pass build-time Prisma init):
#   docker build --build-arg DATABASE_URL="postgresql://..." -f apps/quiklms/Dockerfile -t quiklms:latest .

FROM node:20-alpine AS base
# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quiklms` + its workspace deps
# The prune target must match the "name" field in apps/quiklms/package.json.
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quiklms --docker
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
ARG NEXT_PUBLIC_QUIKLMS_URL="https://placeholder.com"
# The /worker's public origin (Socket.IO gateway + TUS upload server, :3021).
# NEXT_PUBLIC_* → baked into the client bundle: `lib/socket.ts` connects the
# browser socket here. QuikLMS-specific (only app with a sidecar worker). When
# unset, `lib/socket.ts` falls back to NEXT_PUBLIC_QUIKLMS_URL, so an env
# without a deployed worker degrades to "no realtime" instead of breaking.
ARG NEXT_PUBLIC_WORKER_URL=""
ARG NEXT_PUBLIC_SENTRY_DSN
ARG QUIKIT_URL="https://dummy-quikit.local"
ARG QUIKIT_CLIENT_ID="dummy-client-id"
ARG QUIKIT_CLIENT_SECRET="dummy-client-secret"

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_QUIKLMS_URL=$NEXT_PUBLIC_QUIKLMS_URL
ENV NEXT_PUBLIC_WORKER_URL=$NEXT_PUBLIC_WORKER_URL
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
# QuikLMS-only: lib/env.ts zod-validates these two at module import, and Next's
# "Collect page data" pass executes every route module — so `next build` throws
# without them even though nothing connects or signs anything at build time.
# Both must be >=16 chars to satisfy the schema. Plain ENV, never ARG: build-args
# are recorded in `docker history`, so a real secret passed that way would leak
# into the image metadata. Real values come from the K8s Secret at runtime, and
# Next's dotenv loader does not override an existing process.env value.
# These names are also declared in turbo.json `tasks.build.env` — turbo runs in
# strict envMode and strips any variable not on that allowlist, so the ENV alone
# would never reach `next build`.
ENV JWT_SECRET="build-time-dummy-not-used-at-runtime"
ENV ENCRYPTION_KEY="build-time-dummy-not-used-at-runtime"
ENV QUIKIT_URL=$QUIKIT_URL
ENV QUIKIT_CLIENT_ID=$QUIKIT_CLIENT_ID
ENV QUIKIT_CLIENT_SECRET=$QUIKIT_CLIENT_SECRET
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Opt `next build` into standalone output (gated in next.config.mjs so local
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
      "QUIKLMS=$NEXT_PUBLIC_QUIKLMS_URL" \
      "WORKER=$NEXT_PUBLIC_WORKER_URL" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

# QuikLMS runs on the single shared central Prisma client (packages/database)
# post-fold, exactly like quikscale/quikcrm/quikchat. The `app_quiklms` tables
# are Postgres schemas inside that one multi-schema datasource, so generating
# the central client is enough — there is no dedicated app-local schema or
# client (the former isolated LMS client is gone).
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
# QuikLMS ships no `public/` directory — create it so the COPY steps in the
# runner stage have a source (and stay identical to the other apps).
RUN mkdir -p apps/quiklms/public
RUN mkdir -p apps/quiklms/.next/static
# Write .env.production from ARG/ENV values so Next.js loadEnv()
# picks them up deterministically. Bypasses turbo's env filtering
# (the previous failure mode: shell ENV was set but didn't reach
# Next's process.env during next build, leaving client bundles
# with undefined NEXT_PUBLIC_* values).
RUN printf '%s\n' \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_QUIKLMS_URL=$NEXT_PUBLIC_QUIKLMS_URL" \
  "NEXT_PUBLIC_WORKER_URL=$NEXT_PUBLIC_WORKER_URL" \
  "NEXTAUTH_URL=$NEXTAUTH_URL" \
  > apps/quiklms/.env.production && cat apps/quiklms/.env.production

RUN npx turbo build --filter=quiklms

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
ENV PORT=3016
ENV HOSTNAME="0.0.0.0"

# Standalone server (Next 14 monorepo output: apps/quiklms/server.js)
COPY --from=installer --chown=nextjs:nodejs /app/apps/quiklms/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quiklms/.next/static    ./apps/quiklms/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quiklms/public          ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quiklms/public          ./apps/quiklms/public

# Prisma client (engine + generated bindings); standalone doesn't always trace these
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma  ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma  ./node_modules/.prisma

USER nextjs
EXPOSE 3016

# This image is the Next.js app ONLY. The `/worker` sidecar (Socket.IO + TUS +
# cron, apps/quiklms/worker) is a separate process on its own port — it needs
# its own image/deployment. Realtime chat and resumable uploads stay dark until
# that is deployed and NEXT_PUBLIC_WORKER_URL points at it.
#
# The central schema is owned and migrated out-of-band (integration owner /
# Neon), exactly like quikcrm / quikscale / quiktrack / quikinfra / quikchat.
# The container does not run `prisma db push` at startup — pushing the full
# multi-schema datasource from an app container would touch every other app's
# tables and is unsafe in production.
CMD ["node", "apps/quiklms/server.js"]
