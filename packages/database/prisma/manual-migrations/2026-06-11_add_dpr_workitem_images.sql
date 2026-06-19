-- ============================================================================
-- Manual DB migration — add `images` to DPR work items
-- Schema: app_quikinfra   Table: Dpr_work_items   Model: CnDPRWorkItem
--
-- Reason: schema.prisma now has CnDPRWorkItem.images (String[]). DPR work-item
-- site photos are uploaded to S3 on save and the object KEYS are stored in this
-- column (not the image bytes). On read the keys are turned into short-lived
-- signed view URLs. Previously there was no column, so attached photos were
-- dropped and never showed up when editing a DPR.
--
-- Run on BOTH local and the central (production) databases. Idempotent.
-- A text[] column defaulting to empty — no FK, no index. Existing work-item
-- rows get '{}' (no photos), which is correct (older DPRs never stored any).
--
-- NOTE: after deploying the code, `prisma generate` must run (DB-free) so the
-- client knows the new field. This SQL is the actual DB change.
-- ============================================================================

ALTER TABLE "app_quikinfra"."Dpr_work_items"
  ADD COLUMN IF NOT EXISTS "images" text[] NOT NULL DEFAULT '{}';
