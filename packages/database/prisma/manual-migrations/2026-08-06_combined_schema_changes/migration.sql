-- Combined manual migration — 2026-08-06
--
-- Rolls up every manual migration authored after 2026-07-29 into one file so a
-- database can be brought current in a single run:
--
--   2026-07-31_rfq_terms_snapshot
--   2026-08-03_work_order_line_uom_id_to_uom_code
--   2026-08-05_approval_steps_snapshot
--   2026-08-05_recon_conducted_by_name
--   2026-08-05_workflow_master_approver
--
-- Every statement is idempotent — safe to run by hand, safe to re-run, and safe
-- on a database where some of the individual migrations were already applied.
-- Sections are ordered by their original date; they touch different tables, so
-- the order carries no dependency.


-- ---------------------------------------------------------------------------
-- 1. RFQ Terms & Conditions snapshot, plus per-vendor overrides
--    (was: 2026-07-31_rfq_terms_snapshot)
-- ---------------------------------------------------------------------------
--
-- The RFQ create drawer seeds `Rfqs.termsAndConditions` from the picked
-- T&C template and lets the raiser edit it — that edit is stamped on the
-- RFQ only, never written back to the master template
-- (app_quikinfra.cn_terms_conditions).
--
-- Each vendor row on `Rfq_vendors` can additionally override that RFQ
-- default with vendor-specific terms (e.g. a different payment term for
-- one supplier); null/empty means "use the RFQ default". Purchase orders
-- already carry the equivalent header-level column.

ALTER TABLE app_quikinfra."Rfqs"
  ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT;

ALTER TABLE app_quikinfra."Rfq_vendors"
  ADD COLUMN IF NOT EXISTS "termsAndConditions" TEXT,
  ADD COLUMN IF NOT EXISTS "termsTemplateId" TEXT;


-- ---------------------------------------------------------------------------
-- 2. Rename Work_order_lines."uomId" -> "uomCode"
--    (was: 2026-08-03_work_order_line_uom_id_to_uom_code)
-- ---------------------------------------------------------------------------
--
-- The column never held a CnUOM id. Both write paths resolved
-- `it.uomCode ?? it.uomId`, so rows store the UOM *code* — real data shows
-- 'cum.', 'sqm.', 'DAY', 'BAG', plus empty strings on labour lines.
--
-- Because the column was NAMED uomId, readers reasonably treated it as a
-- foreign key and joined `CnUOM.id IN (...)`. That lookup can never match a
-- code, so the UOM cell came out blank. It happened twice, independently:
-- the Work Order preview PDF and the Work Order Excel export. Renaming the
-- column removes the trap rather than papering over each consumer.
--
-- This is a pure rename: PostgreSQL rewrites only the catalog entry, so every
-- value is preserved and the operation is instant. It is NOT a normalisation —
-- values stay as-is, mixed case and trailing dots included ('cum.' vs 'CUM').
-- Converting codes to real ids remains a separate, larger task (writers +
-- readers + backfill must land together or the UI regresses to showing cuids).
--
-- Readers keep matching on code OR id, so a stray id-bearing legacy row still
-- resolves after this rename.
--
-- Deliberately hand-written: `prisma migrate` cannot distinguish a rename from
-- a drop-and-add, and the generated DROP COLUMN + ADD COLUMN would silently
-- discard every UOM value.
--
-- Wrapped in a guard (RENAME COLUMN has no IF EXISTS) so this combined file
-- stays re-runnable and works whether or not the standalone migration ran.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app_quikinfra'
      AND table_name   = 'Work_order_lines'
      AND column_name  = 'uomId'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app_quikinfra'
      AND table_name   = 'Work_order_lines'
      AND column_name  = 'uomCode'
  ) THEN
    ALTER TABLE app_quikinfra."Work_order_lines"
      RENAME COLUMN "uomId" TO "uomCode";
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. Freeze an approval instance's step chain at submit time
--    (was: 2026-08-05_approval_steps_snapshot)
-- ---------------------------------------------------------------------------
--
-- An instance previously stored only (workflowId, currentStepOrder) and read
-- its approvers from the live workflow on every action. Editing a workflow
-- replaces its step rows wholesale, so in-flight instances were retro-changed:
--
--   * workflow shrank  → the instance was left parked on a stepOrder that no
--                        longer existed. The step lookup threw before the actor
--                        check, so the request became unactionable by everyone,
--                        including super admin.
--   * workflow grew    → already-settled instances looked under-approved when
--                        compared against the workflow's current step count.
--
--   app_quikinfra."Approval_instances".stepsSnapshot
--     JSONB array: [{ stepOrder, approverRoleId, approverUserId, approverUserIds }]
--
-- Nullable and backfill-free on purpose. Rows created before this column stay
-- NULL and keep resolving against the live workflow steps, so nothing changes
-- for existing data; only requests submitted from now on are insulated.

ALTER TABLE app_quikinfra."Approval_instances"
  ADD COLUMN IF NOT EXISTS "stepsSnapshot" JSONB;


-- ---------------------------------------------------------------------------
-- 4. Stock Reconciliation — record the free-typed "Conducted By" name
--    (was: 2026-08-05_recon_conducted_by_name)
-- ---------------------------------------------------------------------------
--
-- The create form has always asked for a "Conducted By" name, but the table had
-- nowhere to put it: only `conductedById` existed (a user id, and the create
-- route always writes the calling user into it). The typed string was parsed
-- off the request and then dropped, so the list column — which renders
-- `conductedByName` — was permanently blank.
--
--   app_quikinfra."Stock_reconciliations".conductedByName
--     TEXT: the name typed on the create form.
--
-- A text column rather than a second user FK on purpose: the person who runs a
-- physical count is often not a system user (a contractor's storekeeper, a
-- third-party auditor). `conductedById` keeps its current meaning — the user
-- who created the record — and remains what the approval flow and audit trail
-- read.
--
-- Nullable and backfill-free. Rows created before this column stay NULL, and
-- both the list and detail routes fall back to the display name of the user on
-- `conductedById`, so the column is never empty for existing data.

ALTER TABLE app_quikinfra."Stock_reconciliations"
  ADD COLUMN IF NOT EXISTS "conductedByName" TEXT;


-- ---------------------------------------------------------------------------
-- 5. Master Approver — one optional fallback approver per workflow
--    (was: 2026-08-05_workflow_master_approver)
-- ---------------------------------------------------------------------------
--
-- Every step names its approver by pinned user or by role, and the step gate
-- enforces that strictly: a request pinned to one person can only be actioned
-- by that person. When they are on leave, have left, or simply never act, the
-- request has no legitimate route forward — which is what drove admins to edit
-- live workflows and strand in-flight requests.
--
--   app_quikinfra."Approval_workflows".masterApproverUserId
--     Nullable user id. When set, that user may approve a request under this
--     workflow from any step, with no waiting period. Null = no master
--     approver and the workflow behaves exactly as before.
--
-- No role requirement: a plain USER can be master approver of a workflow whose
-- steps are ADMIN. Scoped to the workflow it is set on, so a project-scoped
-- workflow's master approver only covers that project's requests.

ALTER TABLE app_quikinfra."Approval_workflows"
  ADD COLUMN IF NOT EXISTS "masterApproverUserId" TEXT;
