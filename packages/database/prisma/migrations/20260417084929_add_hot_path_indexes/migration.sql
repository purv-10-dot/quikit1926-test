-- P1-3: composite indexes for hot multi-column queries.
-- See docs/plans/P1-3-composite-indexes.md.
--
-- CONCURRENTLY avoids an ACCESS EXCLUSIVE lock on these tables during the
-- index build. Required because Notification in particular is on the hot
-- write path; a few-second lock during deploy would cause customer 5xx's.
--
-- IMPORTANT — this migration is hand-written, not Prisma-generated:
--   - CREATE INDEX CONCURRENTLY cannot run inside a transaction, so each
--     statement must stand alone. Prisma migrate runs each migration
--     file's statements as a batch but does NOT wrap them in a single
--     implicit transaction when the file contains only DDL like this.
--   - IF NOT EXISTS lets us safely retry if a CONCURRENTLY build is
--     interrupted (which would otherwise leave an invalid index behind
--     that must be manually dropped).
--
-- If any CREATE fails with "already exists but is invalid", run:
--   DROP INDEX CONCURRENTLY IF EXISTS "<index_name>";
-- then rerun this migration.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Notification_tenantId_userId_read_idx"
  ON "Notification" ("tenantId", "userId", "read");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "PerformanceReview_tenantId_revieweeId_year_quarter_idx"
  ON "PerformanceReview" ("tenantId", "revieweeId", "year", "quarter");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "HabitAssessment_tenantId_quarter_year_idx"
  ON "HabitAssessment" ("tenantId", "quarter", "year");
