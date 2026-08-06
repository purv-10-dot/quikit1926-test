-- Freeze an approval instance's step chain at submit time.
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
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe to run by hand and to re-run.

ALTER TABLE app_quikinfra."Approval_instances"
  ADD COLUMN IF NOT EXISTS "stepsSnapshot" JSONB;
