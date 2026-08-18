-- QuikTrack: Board Settings — "map statuses to columns" (Jira-style).
-- A QtBoardColumn is a named container that can hold one or more
-- QtIssueStatus rows; a status not mapped to any column is hidden from the
-- board (the "Unmapped" bucket). Opt-in: a project with no QtBoardColumn
-- rows falls back to today's one-column-per-status behaviour.
-- Idempotent so it is safe to apply to the shared UAT/prod Neon DB by hand
-- (the build pipeline does not run `migrate deploy`).

-- ── QtBoardColumn ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtBoardColumn" (
  id           text PRIMARY KEY,
  "projectId"  text NOT NULL,
  name         text NOT NULL,
  "orderIndex" integer NOT NULL DEFAULT 0,
  "createdAt"  timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"  timestamp(3) NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtBoardColumn_projectId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtBoardColumn"
      ADD CONSTRAINT "QtBoardColumn_projectId_fkey"
      FOREIGN KEY ("projectId")
      REFERENCES app_quiktrack."QtProject"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtBoardColumn_projectId_orderIndex_idx"
  ON app_quiktrack."QtBoardColumn" ("projectId", "orderIndex");

-- ── QtBoardColumnStatus ──────────────────────────────────────────────────────
-- A status belongs to at most one column, so statusId IS the primary key.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtBoardColumnStatus" (
  "statusId"   text PRIMARY KEY,
  "columnId"   text NOT NULL,
  "orderIndex" integer NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtBoardColumnStatus_columnId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtBoardColumnStatus"
      ADD CONSTRAINT "QtBoardColumnStatus_columnId_fkey"
      FOREIGN KEY ("columnId")
      REFERENCES app_quiktrack."QtBoardColumn"(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtBoardColumnStatus_statusId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtBoardColumnStatus"
      ADD CONSTRAINT "QtBoardColumnStatus_statusId_fkey"
      FOREIGN KEY ("statusId")
      REFERENCES app_quiktrack."QtIssueStatus"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtBoardColumnStatus_columnId_orderIndex_idx"
  ON app_quiktrack."QtBoardColumnStatus" ("columnId", "orderIndex");
