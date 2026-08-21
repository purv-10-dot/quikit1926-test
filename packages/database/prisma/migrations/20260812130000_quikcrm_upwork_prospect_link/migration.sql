-- Upwork → Prospect conversion link.
--
-- Idempotent (IF NOT EXISTS / guarded DO blocks) so it is safe to apply to the
-- shared DB by hand; the build pipeline does not run `migrate deploy`.
--
-- A REFERENCE ONLY. The Upwork job keeps every one of its own fields; nothing
-- is copied into CrmProspect and nothing is deleted on conversion. Adding a
-- nullable column plus a NULLS-distinct unique index is why this needs no
-- backfill: every existing prospect stays valid with upworkJobId = NULL.

-- Reference from the prospect back to the originating Upwork job.
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "upworkJobId" text;

-- SetNull, not Cascade: deleting an Upwork job must never delete a prospect the
-- user has since worked on — it only clears the back-reference.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CrmProspect_upworkJobId_fkey'
      AND conrelid = 'app_quikcrm."CrmProspect"'::regclass
  ) THEN
    ALTER TABLE app_quikcrm."CrmProspect"
      ADD CONSTRAINT "CrmProspect_upworkJobId_fkey"
      FOREIGN KEY ("upworkJobId")
      REFERENCES app_quikcrm."CrmUpworkJob"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- @@unique([orgId, upworkJobId]) — THE duplicate-conversion guard. The API
-- pre-checks for a friendly message; this constraint is what holds under two
-- concurrent "Convert to Prospect" clicks. Postgres treats NULLs as distinct,
-- so prospects with no Upwork origin are unaffected by it.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProspect_orgId_upworkJobId_key"
  ON app_quikcrm."CrmProspect" ("orgId", "upworkJobId");

-- Lookup support for "which prospect came from this job".
CREATE INDEX IF NOT EXISTS "CrmProspect_upworkJobId_idx"
  ON app_quikcrm."CrmProspect" ("upworkJobId");
