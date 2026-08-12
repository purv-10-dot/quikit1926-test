-- QuikTrack: actor attribution on issue-activity tables.
--
-- The Prisma schema added `actorType String @default("user")` to QtIssueComment,
-- QtIssueHistory and QtIssueTransitionLog (marks whether an action came from a
-- person or an MCP-authenticated agent), but no migration ever added the columns
-- to the database. As a result `prisma.qtIssueComment.findMany()` fails on any
-- environment that never got the column ("column QtIssueComment.actorType does
-- not exist"), which 500s the comments/history/transition-log reads.
--
-- Idempotent (IF NOT EXISTS) so it is safe to run on databases where the column
-- was already added out-of-band. Default 'user' backfills every existing row.

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueComment"
  ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueHistory"
  ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueTransitionLog"
  ADD COLUMN IF NOT EXISTS "actorType" TEXT NOT NULL DEFAULT 'user';
