# syntax=docker/dockerfile:1.7
#
# Production image for QuikHRMS (apps/quikhrms) — Next.js 15 inside the QuikIT
# npm-workspace + Turborepo monorepo, with Prisma 7 (pg driver adapter, no
# native engine) and an embedded BullMQ worker (started via instrumentation.ts).
#
# Pattern (same as apps/quikscale): turbo prune --docker → installer
# (npm ci + prisma generate + turbo build, standalone output) → runner
# (standalone server.js, non-root).
#
# Build from the REPO ROOT:
#   docker build -f apps/quikhrms/Dockerfile -t quikhrms:latest \
#     --build-arg NEXT_PUBLIC_QUIKIT_URL=https://app.quikit.ai \
#     --build-arg NEXT_PUBLIC_AUTH_URL=https://auth.quikit.ai \
#     .
#
# Run (inject secrets at runtime — never bake them into the image):
#   docker run -p 3009:3009 --env-file apps/quikhrms/.env.local quikhrms:latest
#
# Required runtime env: DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET, INTERNAL_SECRET,
#   QUIKIT_URL, NEXT_PUBLIC_QUIKIT_URL, NEXT_PUBLIC_AUTH_URL, REDIS_URL, plus S3/SMTP
#   as used. The app + embedded worker run in one process via the standalone server.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# openssl + ca-certificates: TLS to Postgres (e.g. Neon sslmode=require) and outbound HTTPS.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app


############################ pruner ##########################
# Reduce the monorepo to just quikit-hrms + its workspace dependencies.
FROM base AS pruner
COPY . .
RUN npx -y turbo@^2 prune quikit-hrms --docker

############################ installer #######################
FROM base AS installer
# 1) deps layer — only manifests + lockfile, so it re-uses cache unless deps change.
#    --ignore-scripts: skip @quikit/database's `prisma generate` postinstall (the
#    schema isn't present at the json-only layer). We run generate explicitly below.
COPY --from=pruner /app/out/json/ ./
RUN npm ci --ignore-scripts
# 2) pruned source.
COPY --from=pruner /app/out/full/ ./

# Public env is compiled into the client bundle at build time.
ARG NEXT_PUBLIC_QUIKIT_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_BASE_PATH
# Build-time placeholder so any Prisma init during `next build` (collect page
# data) has a parseable URL. It is NEVER used to connect — real one at runtime.
ARG DATABASE_URL="postgresql://x:x@localhost:5432/x"
ENV DATABASE_URL=$DATABASE_URL \
    NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH \
    NODE_ENV=production

# Generate the shared Prisma client (postinstall was skipped above). HRMS uses
# the shared @quikit/database client — its models live in the app_quikhrms
# schema of packages/database/prisma/schema.prisma, same as the other apps.
RUN cd apps/quikhrms && npx prisma generate --schema=../../packages/database/prisma/schema.prisma

# Turbo filters env vars out of `next build`, so NEXT_PUBLIC_* set only as shell
# ENV can land in the client bundle as `undefined`. Write them to .env.production
# (Next's loadEnv reads it deterministically) — this is the quikscale fix. The
# empty-friendly file also satisfies the package's `dotenv -e .env.local` build wrapper.
RUN printf '%s\n' \
  "NEXT_PUBLIC_QUIKIT_URL=$NEXT_PUBLIC_QUIKIT_URL" \
  "NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL" \
  "NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH" \
  > apps/quikhrms/.env.production \
 && cp apps/quikhrms/.env.production apps/quikhrms/.env.local \
 && cat apps/quikhrms/.env.production

# Bump Node's heap — the full HRMS build exceeds the ~2 GB default and OOMs.
RUN NODE_ENV=production NODE_OPTIONS="--max-old-space-size=4096" npx turbo build --filter=quikit-hrms

############################ runner ##########################
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3009 \
    HOSTNAME="0.0.0.0"
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

# Standalone server bundle (monorepo layout → apps/quikhrms/server.js + root node_modules).
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/.next/standalone ./
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/.next/static      ./apps/quikhrms/.next/static
COPY --from=installer --chown=nextjs:nodejs /app/apps/quikhrms/public            ./apps/quikhrms/public

# Shared Prisma client (@prisma/client + generated .prisma/client in root
# node_modules) — ensure present even if file-tracing misses it.
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/.prisma          ./node_modules/.prisma
COPY --from=installer --chown=nextjs:nodejs /app/node_modules/@prisma          ./node_modules/@prisma

USER nextjs
EXPOSE 3009
# Standalone server boots the web app AND the embedded BullMQ worker (instrumentation).
CMD ["node", "apps/quikhrms/server.js"]
