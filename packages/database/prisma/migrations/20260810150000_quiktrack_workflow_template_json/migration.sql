-- QuikTrack: Reusable Workflows — org-level self-contained templates.
-- Adds QtWorkflow.templateJson: for reusable org-level templates
-- (projectId = null), a self-contained, name-based snapshot of the graph
-- { statuses:[{name,category,isInitial}], transitions:[{name,type,
-- from:[names],to:name,rules}] }. Independent of any project's status rows,
-- so the template survives if the source project (or its statuses) change
-- or are deleted. Materialized BY NAME on import.
-- Idempotent so it is safe to apply to the shared UAT/prod Neon DB by hand
-- (the build pipeline does not run `migrate deploy`).

ALTER TABLE app_quiktrack."QtWorkflow"
  ADD COLUMN IF NOT EXISTS "templateJson" jsonb;
