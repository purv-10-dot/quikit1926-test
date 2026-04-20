# syntax=docker/dockerfile:1.7
#
# Admin — per-tenant admin UI
# Port: 3005
#
# Build from the monorepo ROOT:
#   docker build -f apps/admin/Dockerfile -t gcr.io/<project>/admin:<tag> .
#
# See docs/engineering/GCP_DEPLOYMENT.md for the full deployment guide.

FROM node:20-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates openssl libssl-dev \
  && rm -rf /var/lib/apt/lists/*
ENV NEXT_TELEMETRY_DISABLED=1

# ------------------------------------------------------------------ deps
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/quikit/package.json       ./apps/quikit/
COPY apps/quikscale/package.json    ./apps/quikscale/
COPY apps/admin/package.json        ./apps/admin/
COPY packages/ui/package.json       ./packages/ui/
COPY packages/auth/package.json     ./packages/auth/
COPY packages/shared/package.json   ./packages/shared/
COPY packages/database/package.json ./packages/database/
COPY packages/redis/package.json    ./packages/redis/
COPY packages/database/prisma ./packages/database/prisma
RUN npm ci --no-audit --no-fund

# ------------------------------------------------------------------ builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package-lock.json ./
COPY . .
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
ARG NEXT_PUBLIC_SENTRY_DSN=""
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
RUN npx turbo build --filter=admin

# ------------------------------------------------------------------ runner
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3005
RUN addgroup --system --gid 1001 nodejs \
  && adduser  --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/public ./apps/admin/public
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client
USER nextjs
EXPOSE 3005
CMD ["node", "apps/admin/server.js"]
