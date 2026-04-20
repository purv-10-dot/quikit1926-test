# syntax=docker/dockerfile:1.7
#
# QuikIT launcher + super-admin + IdP
# Port: 3000
#
# Build from the monorepo ROOT, not from apps/quikit:
#   docker build -f apps/quikit/Dockerfile -t gcr.io/<project>/quikit:<tag> .
#
# See docs/engineering/GCP_DEPLOYMENT.md for the full deployment guide.

# ------------------------------------------------------------------ base
# node:20-slim is Debian-based so Prisma's default (glibc) engine works
# without extra binaryTargets config. node:20-alpine (musl) would require
# schema.prisma to ship linux-musl engines.
FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates openssl libssl-dev \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# ------------------------------------------------------------------ deps
# Install full monorepo deps using only the package.json manifests.
# Keeping this stage lean maximises Docker layer cache hits when only
# source (not package.json) changes.
FROM base AS deps
WORKDIR /app

# Copy monorepo root manifests
COPY package.json package-lock.json turbo.json ./

# Copy every workspace's package.json so npm ci can resolve the full graph
COPY apps/quikit/package.json       ./apps/quikit/
COPY apps/quikscale/package.json    ./apps/quikscale/
COPY apps/admin/package.json        ./apps/admin/
COPY packages/ui/package.json       ./packages/ui/
COPY packages/auth/package.json     ./packages/auth/
COPY packages/shared/package.json   ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/redis/package.json    ./packages/redis/

# Prisma schema is read by packages/database postinstall (prisma generate)
COPY packages/database/prisma ./packages/database/prisma

# Full install (dev deps included — builder needs tsc/next/turbo)
RUN npm ci --no-audit --no-fund

# ------------------------------------------------------------------ builder
FROM base AS builder
WORKDIR /app

# Re-use the fully-populated node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./

# Copy source (everything not excluded by .dockerignore)
COPY . .

# Regenerate Prisma client into the re-copied node_modules (postinstall
# ran in deps/, but source has since been overlaid). Idempotent.
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma

# Build this app only — turbo resolves workspace dep graph, builds
# @quikit/* packages quikit depends on, then builds quikit itself.
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN npx turbo build --filter=quikit

# ------------------------------------------------------------------ runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Non-root user for runtime
RUN addgroup --system --gid 1001 nodejs \
  && adduser  --system --uid 1001 nextjs

# Next.js standalone bundle contains a traced server.js + traced
# node_modules subset. outputFileTracingRoot in next.config.js ensures
# monorepo packages are traced correctly.
COPY --from=builder --chown=nextjs:nodejs /app/apps/quikit/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/quikit/.next/static ./apps/quikit/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/quikit/public ./apps/quikit/public

# Prisma runtime engine files — include explicitly in case file-tracing
# misses them.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs
EXPOSE 3000

# standalone writes server.js to apps/quikit/ (relative to monorepo root)
CMD ["node", "apps/quikit/server.js"]
