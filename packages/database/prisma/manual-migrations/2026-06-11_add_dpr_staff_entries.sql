-- ============================================================================
-- Manual DB migration — add DPR Staff entries
-- Schema: app_quikinfra   Table: Dpr_staff_entries   Model: CnDPRStaff
--
-- Reason: the DPR form has always collected Staff (name / designation /
-- present / reason) but there was no table to store it — the create route
-- dropped it and the GET hardcoded staff: []. This adds the table so staff
-- persists and shows on the DPR detail/edit.
--
-- Run on BOTH local and the central (production) databases. Idempotent.
-- `id` has no DB default on purpose (Prisma supplies the cuid app-side, same
-- as the other Dpr_* child tables).
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client knows the new model. This SQL is the actual DB change.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Dpr_staff_entries" (
  "id"          text PRIMARY KEY,
  "dprId"       text    NOT NULL,
  "name"        text    NOT NULL,
  "designation" text,
  "present"     boolean NOT NULL DEFAULT true,
  "reason"      text
);

CREATE INDEX IF NOT EXISTS "Dpr_staff_entries_dprId_idx"
  ON "app_quikinfra"."Dpr_staff_entries" ("dprId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Dpr_staff_entries_dprId_fkey'
  ) THEN
    ALTER TABLE "app_quikinfra"."Dpr_staff_entries"
      ADD CONSTRAINT "Dpr_staff_entries_dprId_fkey"
      FOREIGN KEY ("dprId") REFERENCES "app_quikinfra"."Daily_progress_reports"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
