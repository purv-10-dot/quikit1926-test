-- Seed one app-wide QuikTrack role so `resolution: "org_fallback"` can return a
-- NON-EMPTY orgPermissions list.
--
-- Why this matters: with UserAppRole and RolePermission both empty, org_fallback
-- returns [] both when a user genuinely holds no app-wide grants AND when the
-- fallback path is simply untested. Those are different facts, and the AI
-- Runtime's pre-filter treats them identically.
--
-- Storage note: QuikTrack's app-wide roles live in `app_quikscale` (shared table,
-- discriminated by AppRole.appId) — see lib/api/permissions.ts. Only the
-- PROJECT roles live in app_quiktrack.
--
-- Idempotent. Safe to re-run. Local demo data only — never ship this.

\set ON_ERROR_STOP on

\echo '=== 0. shape check — column lists, so the inserts below are grounded ==='
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'app_quikscale'
  AND table_name IN ('AppRole', 'UserAppRole', 'RolePermission')
ORDER BY table_name, ordinal_position;

\echo ''
\echo '=== 1. the quiktrack App row (roles are scoped by appId) ==='
SELECT id, slug FROM quikit."App" WHERE slug = 'quiktrack';

\echo ''
\echo '=== 2. existing AppRole rows for quiktrack (expect 0 before seeding) ==='
SELECT r.id, r.name, r."isSystem"
FROM app_quikscale."AppRole" r
JOIN quikit."App" a ON a.id = r."appId"
WHERE a.slug = 'quiktrack';
