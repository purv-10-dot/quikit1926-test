-- ============================================================================
-- quikit_dev reset to bare minimum.
-- KEEP: all quikit.App + quikit.OAuthClient (apps stay registered/launchable),
--       super-admin ashwin@moreyeahs.com (cmoqrc5n8000710bd69gs4fgb),
--       his org MoreYeahs/moreyeahs-main (cmpgz253x00019660d7d4qkzq) + his
--       OrgMember / OrgAppAccess / UserAppAccess so login + launcher work.
-- WIPE: every other org/user, all per-app schema data (quikhrms + app_*),
--       central OAuth tokens, and public platform logs.
-- Backup taken first: Downloads/quikit_dev_backup_pre_wipe.dump
-- Runs in one transaction (psql -1). FK triggers disabled for ordering safety.
-- ============================================================================
SET session_replication_role = replica;

-- 1) Wipe ALL data in every per-app schema (structure/columns untouched).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename FROM pg_tables
    WHERE schemaname IN ('quikhrms','app_quikscale','app_quiksocial',
                         'app_quiktrack','app_quikvc','app_quikconstruction')
  LOOP
    EXECUTE format('TRUNCATE TABLE %I.%I CASCADE', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- 2) Wipe public platform logs / tenant tables.
--    KEEP platform config: FeatureFlag, AppModuleFlag, Plan, _prisma_migrations.
TRUNCATE TABLE
  public."ApiCall", public."ApiCallHourlyRollup", public."AppHealthCheck",
  public."AuditLog", public."BroadcastAnnouncement", public."BroadcastDismissal",
  public."Impersonation", public."Invoice", public."Notification",
  public."PlatformAlert", public."SessionEvent", public."Team", public."UserTeam"
  CASCADE;

-- 3) auth schema — keep only ashwin.
DELETE FROM auth."Account";
DELETE FROM auth."Session";
DELETE FROM auth."VerificationToken";
DELETE FROM auth."AgentJwtIssuance";
DELETE FROM auth."User" WHERE id <> 'cmoqrc5n8000710bd69gs4fgb';

-- 4) quikit schema — keep App + OAuthClient (all), ashwin's org/memberships/access.
DELETE FROM quikit."OAuthCode";
DELETE FROM quikit."OAuthRefreshToken";
DELETE FROM quikit."UserAppAccess" WHERE "userId" <> 'cmoqrc5n8000710bd69gs4fgb';
DELETE FROM quikit."OrgMember"     WHERE "userId" <> 'cmoqrc5n8000710bd69gs4fgb';
DELETE FROM quikit."OrgAppAccess"  WHERE "orgId"  <> 'cmpgz253x00019660d7d4qkzq';
DELETE FROM quikit."Org"           WHERE id       <> 'cmpgz253x00019660d7d4qkzq';

SET session_replication_role = DEFAULT;
