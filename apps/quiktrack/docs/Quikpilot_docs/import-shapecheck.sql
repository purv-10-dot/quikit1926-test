-- Compare the dump's column lists against THIS database, table by table.
--
-- A table is safely importable only when the live column list matches what the
-- dump's COPY declares. Anything else needs a rewritten INSERT with an explicit
-- column list, or must be skipped.
--
-- Read-only. Nothing is modified.

\pset pager off

\echo '=== live column lists (compare to the dump COPY lines) ==='

SELECT
  table_schema || '.' || table_name AS tbl,
  string_agg(column_name, ', ' ORDER BY ordinal_position) AS live_columns
FROM information_schema.columns
WHERE (table_schema, table_name) IN (
  ('quikit','Org'), ('quikit','App'), ('quikit','User'),
  ('quikit','OrgMember'), ('quikit','UserAppAccess'),
  ('app_quiktrack','QtProject'), ('app_quiktrack','QtProjectMember'),
  ('app_quiktrack','QtProjectRole'), ('app_quiktrack','QtProjectRolePermission'),
  ('app_quiktrack','QtProjectUserRole'), ('app_quiktrack','QtIssue'),
  ('app_quikscale','AppRole'), ('app_quikscale','UserAppRole'),
  ('app_quikscale','RolePermission')
)
GROUP BY table_schema, table_name
ORDER BY 1;

\echo ''
\echo '=== current row counts (what we already have) ==='
SELECT 'quikit.Org'                       AS tbl, count(*) FROM quikit."Org"
UNION ALL SELECT 'quikit.App',                     count(*) FROM quikit."App"
UNION ALL SELECT 'quikit.User',                    count(*) FROM quikit."User"
UNION ALL SELECT 'quikit.OrgMember',               count(*) FROM quikit."OrgMember"
UNION ALL SELECT 'quikit.UserAppAccess',           count(*) FROM quikit."UserAppAccess"
UNION ALL SELECT 'qt.QtProject',                   count(*) FROM app_quiktrack."QtProject"
UNION ALL SELECT 'qt.QtProjectMember',             count(*) FROM app_quiktrack."QtProjectMember"
UNION ALL SELECT 'qt.QtProjectRole',               count(*) FROM app_quiktrack."QtProjectRole"
UNION ALL SELECT 'qt.QtProjectRolePermission',     count(*) FROM app_quiktrack."QtProjectRolePermission"
UNION ALL SELECT 'qt.QtProjectUserRole',           count(*) FROM app_quiktrack."QtProjectUserRole"
UNION ALL SELECT 'qt.QtIssue',                     count(*) FROM app_quiktrack."QtIssue"
UNION ALL SELECT 'qs.AppRole',                     count(*) FROM app_quikscale."AppRole"
UNION ALL SELECT 'qs.UserAppRole',                 count(*) FROM app_quikscale."UserAppRole"
UNION ALL SELECT 'qs.RolePermission',              count(*) FROM app_quikscale."RolePermission"
ORDER BY 1;

\echo ''
\echo '=== the quiktrack App row we already have (dump uses id cmoraapp_quiktr) ==='
SELECT id, slug, name FROM quikit."App" ORDER BY slug;
