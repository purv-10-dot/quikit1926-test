-- QuikFlow: track the outcome of a workflow's most recent run.
--
-- WfStatus (Draft/Active/Paused/Archived) only records whether a workflow is
-- *enabled* — a workflow can fail on every single trigger and stay "Active"
-- forever with nothing but the buried Run History log to show for it. This
-- adds `lastRunStatus` (reuses the existing WfRunStatus enum) so the
-- Workflows list can flag a workflow that's live but broken.
--
-- Idempotent (IF NOT EXISTS) so it is safe to run on databases where the
-- column was already added out-of-band. NULL default = every existing row
-- (no runs yet, or predating this column) shows no status pill.

-- AlterTable
ALTER TABLE "app_quikflow"."WfWorkflow"
  ADD COLUMN IF NOT EXISTS "lastRunStatus" "app_quikflow"."WfRunStatus";
