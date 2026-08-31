-- AI Meeting Rhythm — Phase 4: WWW status history and closure timestamp.
--
-- See docs/17-ai-meeting-rhythm-architecture.md section I.2.
--
-- ADDITIVE, WITH ONE OPTIONAL BACKFILL.
--   * One new table, one nullable column. Nothing existing is dropped,
--     renamed or re-typed.
--   * The backfill at the end is idempotent and can be re-run or skipped.
--   * Rollback is a DROP of the table and the column.
--
-- WHY A DEDICATED TABLE RATHER THAN THE AUDIT TRAIL
-- -------------------------------------------------
-- AuditChange already records `status` edits, and deriving history from it
-- would need no new table. It is the wrong source for one decisive reason:
-- lib/audit/audit.ts swallows its own failures by explicit contract, so a
-- logging glitch silently drops a transition. That is CORRECT for an audit
-- trail — a telemetry problem must never fail a user's edit — and WRONG for the
-- ledger that completion rate, overdue rate and average closure time are
-- computed from. A metric with silently missing rows is worse than no metric.
--
-- The application writes this table inside the same transaction as the WWWItem
-- update, so the history and the status can never disagree.

-- ---------------------------------------------------------------------------
-- 1. WWWItem.completedAt
--
-- Derivable from the history, but denormalised because "average days to close"
-- is a headline Monthly Report metric, and computing it from the history would
-- mean scanning every transition of every item in the period. One subtraction
-- against createdAt instead.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_quikscale"."WWWItem"
  ADD COLUMN "completedAt" TIMESTAMP(3);

-- Existing completed items have no recorded completion moment. `updatedAt` is
-- the closest honest approximation — it is when the row last changed, which for
-- a completed item is usually the completion itself. Only ever applied where
-- the column is still null, so re-running changes nothing.
UPDATE "app_quikscale"."WWWItem"
   SET "completedAt" = "updatedAt"
 WHERE "status" = 'completed'
   AND "completedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- 2. WWWStatusHistory
-- ---------------------------------------------------------------------------
CREATE TABLE "app_quikscale"."WWWStatusHistory" (
  "id"         TEXT NOT NULL,
  "orgId"      TEXT NOT NULL,
  "wwwItemId"  TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus"   TEXT NOT NULL,
  "changedBy"  TEXT NOT NULL,
  "changedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason"     TEXT,
  "source"     TEXT NOT NULL DEFAULT 'web',

  CONSTRAINT "WWWStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WWWStatusHistory_wwwItemId_changedAt_idx"
  ON "app_quikscale"."WWWStatusHistory" ("wwwItemId", "changedAt");
CREATE INDEX "WWWStatusHistory_orgId_toStatus_changedAt_idx"
  ON "app_quikscale"."WWWStatusHistory" ("orgId", "toStatus", "changedAt");
CREATE INDEX "WWWStatusHistory_orgId_idx"
  ON "app_quikscale"."WWWStatusHistory" ("orgId");

ALTER TABLE "app_quikscale"."WWWStatusHistory"
  ADD CONSTRAINT "WWWStatusHistory_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikscale"."WWWStatusHistory"
  ADD CONSTRAINT "WWWStatusHistory_wwwItemId_fkey"
  FOREIGN KEY ("wwwItemId") REFERENCES "app_quikscale"."WWWItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Backfill — OPTIONAL, IDEMPOTENT
--
-- Seeds one creation row per existing item, then replays whatever status
-- transitions the audit trail happens to hold.
--
-- BE CLEAR ABOUT WHAT THIS CAN AND CANNOT RECOVER. AuditChange is best-effort,
-- so backfilled history is as complete as the audit trail was and no more —
-- transitions lost to a swallowed audit failure are gone. Backfilled rows are
-- marked source = 'backfill' so any metric can exclude them, and so nobody
-- later mistakes reconstructed history for recorded history.
--
-- Everything from the application's first write onward is exact, because that
-- path is transactional.
-- ---------------------------------------------------------------------------

-- 3a. One creation row per item.
INSERT INTO "app_quikscale"."WWWStatusHistory"
  ("id", "orgId", "wwwItemId", "fromStatus", "toStatus", "changedBy", "changedAt", "source")
SELECT
  gen_random_uuid()::text,
  w."orgId",
  w."id",
  NULL,
  w."status",
  w."createdBy",
  w."createdAt",
  'backfill'
FROM "app_quikscale"."WWWItem" w
WHERE NOT EXISTS (
  SELECT 1 FROM "app_quikscale"."WWWStatusHistory" h
   WHERE h."wwwItemId" = w."id" AND h."fromStatus" IS NULL
);

-- 3b. Replay recorded status transitions.
INSERT INTO "app_quikscale"."WWWStatusHistory"
  ("id", "orgId", "wwwItemId", "fromStatus", "toStatus", "changedBy", "changedAt", "source")
SELECT
  gen_random_uuid()::text,
  e."orgId",
  e."entityId",
  c."oldValue" #>> '{}',
  c."newValue" #>> '{}',
  e."actorUserId",
  e."createdAt",
  'backfill'
FROM "app_quikscale"."AuditChange" c
JOIN "app_quikscale"."AuditEvent" e ON e."id" = c."auditEventId"
WHERE e."entityType" = 'WWW'
  AND c."fieldName" = 'status'
  AND c."newValue" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "app_quikscale"."WWWItem" w WHERE w."id" = e."entityId")
  AND NOT EXISTS (
    SELECT 1 FROM "app_quikscale"."WWWStatusHistory" h
     WHERE h."wwwItemId" = e."entityId"
       AND h."changedAt" = e."createdAt"
       AND h."toStatus" = c."newValue" #>> '{}'
  );
