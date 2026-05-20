# syntax=docker/dockerfile:1.6
#
# Multi-stage Docker build for the `quikit` Next.js launcher.
# Pattern: deps → builder → runner (production-minimal standalone output).
#
# Build (from monorepo root):
#   docker build -f apps/quikit/Dockerfile -t quikit:latest .
#
# Run:
#   docker run --rm -p 8080:8080 \
#     --env-file /tmp/vercel-quik-it.env \
#     quikit:latest
#
# Target: Google Cloud Run (auto-injects PORT, terminates TLS, scales to 0).

# ─────────────────────────────────────────────────────────────────────────
# Stage 1 — deps
# Install workspace deps once; cached as long as package.jsons + lockfile
# don't change.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfile + every workspace's package.json. Layer cache busts only
# when one of these changes — source edits keep the install layer.
COPY package.json package-lock.json turbo.json ./
COPY apps/quikit/package.json apps/quikit/
COPY apps/auth/package.json apps/auth/
COPY apps/admin/package.json apps/admin/
COPY apps/quikscale/package.json apps/quikscale/
COPY apps/quiktrack/package.json apps/quiktrack/
COPY apps/quikvc/package.json apps/quikvc/
COPY apps/quiksocial/package.json apps/quiksocial/
COPY apps/quikconstruction/package.json apps/quikconstruction/
COPY apps/_template/package.json apps/_template/
COPY packages/auth/package.json packages/auth/
COPY packages/database/package.json packages/database/
COPY packages/redis/package.json packages/redis/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/

# packages/database has a postinstall that runs `prisma generate` — the
# schema must exist before `npm ci` triggers it. Copy the schema dir up-front.
COPY packages/database/prisma packages/database/prisma

RUN npm ci --no-audit --no-fund

# ─────────────────────────────────────────────────────────────────────────
# Stage 2 — builder
# Copy source, generate Prisma client, build the target app with Turbo.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /repo
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/quikit/node_modules ./apps/quikit/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client against the shared schema
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build just this app (Turbo respects its own dep graph)
RUN npx turbo run build --filter=quikit

# ─────────────────────────────────────────────────────────────────────────
# Stage 3 — runner
# Minimal image: only the standalone server + static + public.
# Cloud Run injects $PORT; standalone server reads it from env.
# ─────────────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
WORKDIR /app
RUN apt-get update -y && apt-get install -y --no-install-recommends \
      openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 1001 nodejs \
    && useradd  --uid 1001 --gid nodejs --shell /bin/bash --create-home nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Cloud Run sets PORT automatically; this is a fallback for `docker run`.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# Standalone server + Prisma engines + minimal node_modules
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quikit/.next/standalone ./
# Static assets that the standalone server needs to serve
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quikit/.next/static ./apps/quikit/.next/static
# Public folder (favicon, images, etc.)
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quikit/public ./apps/quikit/public

USER nextjs
EXPOSE 8080

# The standalone build emits server.js at apps/<app>/server.js
CMD ["node", "apps/quikit/server.js"]
