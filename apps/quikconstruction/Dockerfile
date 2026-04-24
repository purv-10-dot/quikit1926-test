# QuikConstruction — production Docker image
# Monorepo-aware multi-stage build. Run from repo root:
#   docker build -f apps/quikconstruction/Dockerfile -t quikconstruction:latest .

# ──────────────────────────────────────────────────────────────────────
# Stage 1: deps — install production dependencies + generate prisma client
# ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

# Copy manifests + prisma schema BEFORE install — the database package has a
# postinstall hook that runs `prisma generate` which needs the schema present.
COPY package.json package-lock.json turbo.json ./
COPY packages/database ./packages/database
COPY packages/auth/package.json ./packages/auth/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ui/package.json ./packages/ui/
COPY apps/quikconstruction/package.json ./apps/quikconstruction/

# Install deps; prisma client generates via postinstall inside packages/database
RUN DATABASE_URL="postgresql://build:build@build/build" DATABASE_URL_DIRECT="postgresql://build:build@build/build" \
    npm ci --prefer-offline --no-audit

# ──────────────────────────────────────────────────────────────────────
# Stage 2: build — Next.js production build
# ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages/database ./packages/database
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx turbo build --filter=quikconstruction

# ──────────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal image
# ──────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3007
ENV QC_DOCS_ROOT=/app/uploads

# Non-root user
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy the built app (Next.js standalone output)
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quikconstruction/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quikconstruction/.next/static ./apps/quikconstruction/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/quikconstruction/public ./apps/quikconstruction/public
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules/.prisma ./node_modules/.prisma

RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

USER nextjs
EXPOSE 3007
CMD ["node", "apps/quikconstruction/server.js"]
