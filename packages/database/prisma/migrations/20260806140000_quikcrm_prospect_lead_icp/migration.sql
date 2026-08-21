-- ICP reference on prospects and leads — app_quikcrm.
--
-- Adds CrmProspect."icpId" and CrmLead."icpId": the ICP selected in the LinkedIn
-- extension before saving a prospect, carried through to the lead on
-- Convert-to-Lead. Reference ONLY — no ICP fields are copied.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS, FK guarded
-- by a catalog check) so it is safe to apply to the shared DB by hand; the build
-- pipeline does not run `migrate deploy`. Index names match Prisma's generated
-- names for @@index so the client stays in sync with the DB.
--
-- Backward compatible: both columns are NULLABLE with no default, so every
-- existing prospect and lead remains valid and untouched. ON DELETE SET NULL
-- means removing an ICP clears the reference instead of deleting the record.

-- ── CrmProspect.icpId ────────────────────────────────────────────────────────
ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "icpId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'app_quikcrm'
      AND constraint_name = 'CrmProspect_icpId_fkey'
  ) THEN
    ALTER TABLE app_quikcrm."CrmProspect"
      ADD CONSTRAINT "CrmProspect_icpId_fkey"
      FOREIGN KEY ("icpId") REFERENCES app_quikcrm."CrmIcpProfile"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- @@index([orgId, icpId]) — "prospects for this ICP" lookups + the Prospects list.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_icpId_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "icpId");

-- ── CrmLead.icpId ────────────────────────────────────────────────────────────
ALTER TABLE app_quikcrm."CrmLead"
  ADD COLUMN IF NOT EXISTS "icpId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'app_quikcrm'
      AND constraint_name = 'CrmLead_icpId_fkey'
  ) THEN
    ALTER TABLE app_quikcrm."CrmLead"
      ADD CONSTRAINT "CrmLead_icpId_fkey"
      FOREIGN KEY ("icpId") REFERENCES app_quikcrm."CrmIcpProfile"(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- @@index([orgId, icpId]) — "leads for this ICP" lookups.
CREATE INDEX IF NOT EXISTS "CrmLead_orgId_icpId_idx"
  ON app_quikcrm."CrmLead" ("orgId", "icpId");
