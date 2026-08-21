-- QuikFlow: soft-delete for workflows.
--
-- The Prisma schema added `deletedAt DateTime?` to WfWorkflow so deleting a
-- workflow from the UI is recoverable (matches the master-data soft-delete
-- convention used elsewhere in the monorepo) instead of a permanent
-- `db.wfWorkflow.delete(...)`. All reads (list, matcher, worker scans,
-- internal probes) now filter `deletedAt: null`.
--
-- Idempotent (IF NOT EXISTS) so it is safe to run on databases where the
-- column was already added out-of-band. NULL default = every existing row
-- stays active/undeleted.

-- AlterTable
ALTER TABLE "app_quikflow"."WfWorkflow"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WfWorkflow_orgId_deletedAt_idx"
  ON "app_quikflow"."WfWorkflow"("orgId", "deletedAt");
