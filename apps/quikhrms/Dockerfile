# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikit-hrms` Next.js app.
# Pattern (identical to apps/quikscale, apps/quiktrack, apps/quikinfra):
#   turbo prune --docker (slices monorepo to just this app's deps)
#   → installer (npm ci --ignore-scripts + prisma generate + next build)
#   → runner (standalone output + Prisma client, non-root)
#
# QuikHRMS has no background worker — BullMQ/Pub-Sub were removed; email and
# heavy ops run in-process in the standalone server. So this is a single
# web-server image, same shape as the other product apps.
#
# Build (from monorepo root):
#   docker build -f apps/quikhrms/Dockerfile -t quikhrms:latest .
# Build with the real public URLs baked into the client bundle:
#   docker build -f apps/quikhrms/Dockerfile -t quikhrms:latest \
#     --build-arg NEXT_PUBLIC_QUIKIT_URL=https://apps.quikit.ai \
#     --build-arg NEXT_PUBLIC_AUTH_URL=https://authn.quikit.ai \
#     --build-arg NEXT_PUBLIC_QUIKHRMS_URL=https://hrms.quikit.ai \
#     --build-arg NEXT_PUBLIC_APP_URL=https://apps.quikit.ai .
#
# Run (inject secrets at runtime — never bake them into the image):
#   docker run -p 3009:3009 --env-file apps/quikhrms/.env.local quikhrms:latest
#
# Required runtime env: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, INTERNAL_SECRET,
#   QUIKIT_URL, QUIKIT_CLIENT_ID, QUIKIT_CLIENT_SECRET, REDIS_URL, plus S3/SMTP as used.

FROM node:20-alpine AS base

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — builder: prune monorepo down to just `quikit-hrms` + workspace deps
# ─────────────────────────────────────────────────────────────────────────
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune quikit-hrms --docker

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
# Public env is compiled into the client bundle at build time (see grep of
# process.env.NEXT_PUBLIC_* across apps/quikhrms).
ARG NEXT_PUBLIC_QUIKIT_URL="https://placeholder.com"
ARG NEXT_PUBLIC_AUTH_URL="https://placeholder.com"
ARG NEXT_PUBLIC_QUIKHRMS_URL="https://placeholder.com"
ARG NEXT_PUBLIC_APP_URL="https://placeholder.com"
# basePath / assetPrefix (e.g. "/core" behind a path-routed gateway). Empty = root.
ARG NEXT_PUBLIC_BASE_PATH=""

ENV DATABASE_URL=$DATABASE_URL
ENV DATABASE_URL_DIRECT=$DATABASE_URL_DIRECT
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL
ENV NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL
ENV NEXT_PUBLIC_QUIKHRMS_URL=$NEXT_PUBLIC_QUIKHRMS_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXTAUTH_SECRET="build-time-dummy-not-used-at-runtime"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Cache-bust: embed ARG values into the RUN command string so BuildKit
# invalidates this layer (and the build that follows) whenever the
# NEXT_PUBLIC_* / NEXTAUTH_URL build-args change. Without this line,
# BuildKit reuses the cached `turbo build` layer and the new ARG values
# never reach `next build`.
RUN echo "[next-env-bake]" \
      "QUIKIT=$NEXT_PUBLIC_QUIKIT_URL" \
      "AUTH=$NEXT_PUBLIC_AUTH_URL" \
      "QUIKHRMS=$NEXT_PUBLIC_QUIKHRMS_URL" \
      "APP=$NEXT_PUBLIC_APP_URL" \
      "BASE_PATH=$NEXT_PUBLIC_BASE_PATH" \
      "NEXTAUTH=$NEXTAUTH_URL" \
      > /tmp/.next-env-bake.txt && cat /tmp/.next-env-bake.txt

# Shared Prisma client (postinstall was skipped). HRMS uses @quikit/database —
# its models live in the app_quikhrms schema of the shared schema.prisma.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN mkdir -p apps/quikhrms/public
RUN mkdir -p apps/quikhrms/.next/static

# Write .env.production from ARG/ENV values so Next.js loadEnv() picks them up
# deterministically. Bypasses turbo's env filtering (the failure mode: shell
# ENV was set but didn't reach Next's process.env during next build, leaving
# client bundles with undefined NEXT_PUBLIC_* values).
RUN printf '%s\n' \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_QUIKHRMS_URL=$NEXT_PUBLIC_QUIKHRMS_URL" \
  "NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL" \
  "NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH" \
  > apps/quikhrms/.env.production && cat apps/quikhrms/.env.production

# Bump Node's heap — the full HRMS build exceeds the ~2 GB default and OOMs.
RUN NODE_OPTIONS="--max-old-space-size=4096" npx turbo build --filter=quikit-hrms

# ─────────────────────────────────────────────────────────────────────────
# Stage 3 — runner: minimal image, standalone server + Prisma client, non-root
# ─────────────────────────────────────────────────────────────────────────
FROM base AS runner
RUN apk add --no-cache openssl
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3009
ENV HOSTNAME="0.0.0.0"

# Standalone server (Next 14 monorepo output: apps/quikhrms/server.js + root node_modules)
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/.next/static     ./apps/quikhrms/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/public           ./public
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/public           ./apps/quikhrms/public

# Prisma client (engine + generated bindings); standalone doesn't always trace these.
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3009

CMD ["node", "apps/quikhrms/server.js"]
