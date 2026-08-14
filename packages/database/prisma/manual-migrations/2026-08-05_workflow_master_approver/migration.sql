-- Master Approver — one optional fallback approver per workflow.
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
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe to run by hand and to re-run.

ALTER TABLE app_quikinfra."Approval_workflows"
  ADD COLUMN IF NOT EXISTS "masterApproverUserId" TEXT;