-- =====================================================================
--  CONTACT SUPPORT — CONSOLIDATED SCHEMA MIGRATION
-- =====================================================================
--
--  Feature : Contact Support panel (QuikScale + any app) and the QuikIT
--            Super Admin "Support Status" triage queue.
--  Target  : Postgres `public` schema.
--  Scope   : 3 tables, 1 sequence, 12 indexes, 3 foreign keys.
--
--  Run this by hand in UAT and PRODUCTION. It is standalone and does NOT
--  depend on Prisma migration history — it consolidates these two repo
--  migrations into one script:
--      packages/database/prisma/migrations/20260731120000_add_platform_support_tickets/
--      packages/database/prisma/migrations/20260805120000_add_support_ticket_attachments/
--
--  PROPERTIES
--    * ADDITIVE ONLY — creates new objects; never alters or drops an
--      existing table, column, index, constraint or enum. No backfill,
--      no data migration, no downtime.
--    * IDEMPOTENT — every statement is guarded, so re-running is a no-op.
--      Safe to run twice, or to run after a partial failure.
--    * TRANSACTIONAL — wrapped in a single transaction. Postgres does DDL
--      inside transactions, so a failure anywhere rolls the whole thing
--      back and leaves the database exactly as it was.
--
--  PREREQUISITE
--    `quikit."Org"` must exist (the FK target). The guard in STEP 0 aborts
--    with a clear message if it does not, rather than failing halfway.
--
--  HOW TO RUN
--    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-08-06_contact_support_consolidated.sql
--
--    ON_ERROR_STOP=1 matters: without it psql continues after an error and
--    the COMMIT at the end would commit a partial migration.
--
--  ROLLBACK
--    See the commented block at the foot of this file. It is destructive
--    (drops the tables and all ticket data) — deliberately left commented.
--
--  NOTE ON DATABASES
--    As of writing, these objects exist in the `neondb` database but NOT in
--    `quikit`. Point DATABASE_URL at whichever database the target
--    environment actually uses and verify with the STEP 6 output.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 0 — Preconditions
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('quikit."Org"') IS NULL THEN
    RAISE EXCEPTION
      'Aborting: quikit."Org" not found. SupportTicket.orgId has a FK to it. Are you connected to the right database?';
  END IF;
END
$$;


-- ---------------------------------------------------------------------
-- STEP 1 — Sequence backing SupportTicket.ticketNo
-- ---------------------------------------------------------------------
-- Human-facing ticket id, rendered "TKT-000042" by formatSupportTicketNo().
-- A sequence (not count()+1) makes concurrent submissions race-free.
-- MUST be created before the table that defaults to it.
CREATE SEQUENCE IF NOT EXISTS "public"."SupportTicket_ticketNo_seq";


-- ---------------------------------------------------------------------
-- STEP 2 — Tables
-- ---------------------------------------------------------------------

-- 2.1 SupportTicket — one row per request raised from any app.
--
-- requestType / priority / status are TEXT, not Postgres enums, matching the
-- house style of this schema (Notification.type, AuditLog.action,
-- BroadcastAnnouncement.severity). The value space lives in @quikit/shared,
-- so adding a request type later is a code change, not a migration.
--   requestType : 'bug' | 'feature' | 'enhancement' | 'general'
--   priority    : 'low' | 'medium' | 'high' | 'urgent'          (super-admin only)
--   status      : 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened'
CREATE TABLE IF NOT EXISTS "public"."SupportTicket" (
    "id"            TEXT NOT NULL,
    "ticketNo"      INTEGER NOT NULL DEFAULT nextval('"public"."SupportTicket_ticketNo_seq"'),
    "orgId"         TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "appId"         TEXT NOT NULL,
    "appSlug"       TEXT NOT NULL,
    "roleName"      TEXT,
    "subject"       TEXT NOT NULL,
    "description"   TEXT NOT NULL,
    "requestType"   TEXT NOT NULL,
    "priority"      TEXT NOT NULL DEFAULT 'medium',
    "status"        TEXT NOT NULL DEFAULT 'open',
    "adminResponse" TEXT,
    "respondedById" TEXT,
    "respondedAt"   TIMESTAMP(3),
    "resolvedAt"    TIMESTAMP(3),
    "closedAt"      TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

-- `subject` is intentionally NOT NULL even though the Raise-a-request form no
-- longer asks for one: the server derives it from the first line of the
-- description (deriveSubject() in @quikit/shared/supportTickets). Relaxing the
-- column would force every reader to handle nulls for no gain.

-- 2.2 SupportTicketMessage — reply thread AND status history.
-- A row carrying statusFrom/statusTo IS the status-history record, so no
-- separate history table is needed.
CREATE TABLE IF NOT EXISTS "public"."SupportTicketMessage" (
    "id"         TEXT NOT NULL,
    "ticketId"   TEXT NOT NULL,
    "authorId"   TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,   -- 'user' | 'super_admin'
    "body"       TEXT NOT NULL,
    "statusFrom" TEXT,
    "statusTo"   TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketMessage_pkey" PRIMARY KEY ("id")
);

-- 2.3 SupportTicketAttachment — screenshots / files attached at submit time.
--
-- Stores the GCS OBJECT KEY, never a URL: bucket objects are private and
-- signed URLs expire in minutes, so a persisted URL would be dead on arrival.
-- Readers mint a fresh signed GET through the app's viewer route.
--
-- `orgId` is denormalized off the parent ticket so the viewer route can check
-- tenant ownership from the KEY ALONE, with no ticket join — the key layout is
-- support/<orgId>/<yyyy-mm>/<random>.<ext>.
CREATE TABLE IF NOT EXISTS "public"."SupportTicketAttachment" (
    "id"        TEXT NOT NULL,
    "ticketId"  TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "fileName"  TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType"  TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketAttachment_pkey" PRIMARY KEY ("id")
);


-- ---------------------------------------------------------------------
-- STEP 3 — Sequence ownership
-- ---------------------------------------------------------------------
-- Tie the sequence to its column so it is dropped with the table and shows up
-- in pg_dump as a dependency rather than a stray global object.
ALTER SEQUENCE "public"."SupportTicket_ticketNo_seq"
  OWNED BY "public"."SupportTicket"."ticketNo";


-- ---------------------------------------------------------------------
-- STEP 4 — Indexes
-- ---------------------------------------------------------------------

-- SupportTicket -------------------------------------------------------
-- Unique human id.
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_ticketNo_key"
  ON "public"."SupportTicket" ("ticketNo");

-- Org scoping — every tenant-facing query filters on this.
CREATE INDEX IF NOT EXISTS "SupportTicket_orgId_idx"
  ON "public"."SupportTicket" ("orgId");

-- The user's own list: WHERE orgId = ? AND userId = ? ORDER BY createdAt DESC.
CREATE INDEX IF NOT EXISTS "SupportTicket_orgId_userId_createdAt_idx"
  ON "public"."SupportTicket" ("orgId", "userId", "createdAt" DESC);

-- Super-admin default view: open tickets, newest first.
CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx"
  ON "public"."SupportTicket" ("status", "createdAt" DESC);

-- App-wise filter in the triage queue.
CREATE INDEX IF NOT EXISTS "SupportTicket_appSlug_status_idx"
  ON "public"."SupportTicket" ("appSlug", "status");

CREATE INDEX IF NOT EXISTS "SupportTicket_appId_idx"
  ON "public"."SupportTicket" ("appId");

-- Org-wise filter in the triage queue.
CREATE INDEX IF NOT EXISTS "SupportTicket_orgId_status_idx"
  ON "public"."SupportTicket" ("orgId", "status");

-- SupportTicketMessage ------------------------------------------------
-- Thread fetch: WHERE ticketId = ? ORDER BY createdAt ASC.
CREATE INDEX IF NOT EXISTS "SupportTicketMessage_ticketId_createdAt_idx"
  ON "public"."SupportTicketMessage" ("ticketId", "createdAt");

-- SupportTicketAttachment ---------------------------------------------
-- Object keys are random, but the constraint turns "collision is unlikely"
-- into "collision is impossible".
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicketAttachment_objectKey_key"
  ON "public"."SupportTicketAttachment" ("objectKey");

CREATE INDEX IF NOT EXISTS "SupportTicketAttachment_ticketId_createdAt_idx"
  ON "public"."SupportTicketAttachment" ("ticketId", "createdAt");

CREATE INDEX IF NOT EXISTS "SupportTicketAttachment_orgId_idx"
  ON "public"."SupportTicketAttachment" ("orgId");


-- ---------------------------------------------------------------------
-- STEP 5 — Foreign keys
-- ---------------------------------------------------------------------
-- ADD CONSTRAINT has no IF NOT EXISTS, so each is guarded by a catalog check.
--
-- Only orgId and ticketId get FKs. userId / appId / respondedById / authorId
-- deliberately do NOT — matching Notification.userId and AuditLog.actorId, so
-- a deleted user or a retired app still resolves historical tickets instead of
-- cascading them away.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicket_orgId_fkey'
  ) THEN
    ALTER TABLE "public"."SupportTicket"
      ADD CONSTRAINT "SupportTicket_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicketMessage_ticketId_fkey'
  ) THEN
    ALTER TABLE "public"."SupportTicketMessage"
      ADD CONSTRAINT "SupportTicketMessage_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SupportTicketAttachment_ticketId_fkey'
  ) THEN
    ALTER TABLE "public"."SupportTicketAttachment"
      ADD CONSTRAINT "SupportTicketAttachment_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;


-- ---------------------------------------------------------------------
-- STEP 6 — Verification (prints inside the transaction, before COMMIT)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_tables  INT;
  v_indexes INT;
  v_fks     INT;
  v_seq     INT;
BEGIN
  SELECT count(*) INTO v_tables  FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('SupportTicket','SupportTicketMessage','SupportTicketAttachment');

  SELECT count(*) INTO v_indexes FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('SupportTicket','SupportTicketMessage','SupportTicketAttachment');

  SELECT count(*) INTO v_fks     FROM pg_constraint
    WHERE contype = 'f'
      AND conname IN ('SupportTicket_orgId_fkey',
                      'SupportTicketMessage_ticketId_fkey',
                      'SupportTicketAttachment_ticketId_fkey');

  SELECT count(*) INTO v_seq     FROM information_schema.sequences
    WHERE sequence_schema = 'public' AND sequence_name = 'SupportTicket_ticketNo_seq';

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'Contact Support migration verification';
  RAISE NOTICE '  tables   : % of 3',  v_tables;
  RAISE NOTICE '  indexes  : % of 14', v_indexes;   -- 11 explicit + 3 primary keys
  RAISE NOTICE '  FKs      : % of 3',  v_fks;
  RAISE NOTICE '  sequence : % of 1',  v_seq;
  RAISE NOTICE '--------------------------------------------------';

  IF v_tables <> 3 OR v_fks <> 3 OR v_seq <> 1 OR v_indexes <> 14 THEN
    RAISE EXCEPTION 'Verification FAILED — rolling back. Expected 3 tables / 14 indexes / 3 FKs / 1 sequence.';
  END IF;

  RAISE NOTICE 'Verification PASSED.';
END
$$;


-- ---------------------------------------------------------------------
-- STEP 7 — Register in Prisma migration history  [OPTIONAL]
-- ---------------------------------------------------------------------
-- Only relevant if this database is also managed by `prisma migrate deploy`.
-- Without this, Prisma sees these two migrations as PENDING and will try to
-- re-run them, which fails on "relation already exists".
--
-- The checksums below are the real sha256 of the two migration.sql files, so
-- `prisma migrate status` stays consistent. If you edit those files, these
-- values must be recomputed (sha256sum migration.sql) or Prisma reports the
-- migration as "modified after being applied".
--
-- Skipped automatically when _prisma_migrations does not exist.
DO $$
BEGIN
  IF to_regclass('public._prisma_migrations') IS NULL THEN
    RAISE NOTICE 'No _prisma_migrations table — skipping history registration.';
    RETURN;
  END IF;

  INSERT INTO "_prisma_migrations"
    (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
  VALUES
    (gen_random_uuid()::text,
     '44fca25d627f2f65cdd8bb823d9d16e4b993cb286545ff2741234210c0c78d1c',
     now(), '20260731120000_add_platform_support_tickets', NULL, NULL, now(), 1),
    (gen_random_uuid()::text,
     '1b6299259c2b3304d3fb0487a87cbb24a63b615b414327ea70ef0aa6a36e0dfc',
     now(), '20260805120000_add_support_ticket_attachments', NULL, NULL, now(), 1)
  ON CONFLICT DO NOTHING;

  -- ON CONFLICT DO NOTHING only covers a unique violation on id. Guard against
  -- a duplicate NAME (re-run on a DB where these were already recorded) by
  -- deleting all but the earliest row per migration_name.
  DELETE FROM "_prisma_migrations" a
   USING "_prisma_migrations" b
   WHERE a.migration_name = b.migration_name
     AND a.migration_name IN ('20260731120000_add_platform_support_tickets',
                              '20260805120000_add_support_ticket_attachments')
     AND a.started_at > b.started_at;

  RAISE NOTICE 'Prisma migration history registered.';
END
$$;


COMMIT;

-- =====================================================================
--  DATA UPDATES
-- =====================================================================
--  None required. This is a brand-new feature with no predecessor table,
--  so there is nothing to backfill or transform. Tickets are created by
--  users at runtime; `ticketNo` starts at 1 from the sequence.
-- =====================================================================


-- =====================================================================
--  POST-DEPLOY CHECK  (run separately, after COMMIT)
-- =====================================================================
-- SELECT table_name,
--        (SELECT count(*) FROM information_schema.columns c
--          WHERE c.table_schema = 'public' AND c.table_name = t.table_name) AS columns
--   FROM information_schema.tables t
--  WHERE table_schema = 'public'
--    AND table_name LIKE 'Support%'
--  ORDER BY table_name;
--
-- Expected:
--   SupportTicket             19
--   SupportTicketAttachment    8
--   SupportTicketMessage       8
-- =====================================================================


-- =====================================================================
--  ROLLBACK  (destructive — deletes every support ticket and reply)
-- =====================================================================
-- BEGIN;
--   DROP TABLE IF EXISTS "public"."SupportTicketAttachment";
--   DROP TABLE IF EXISTS "public"."SupportTicketMessage";
--   DROP TABLE IF EXISTS "public"."SupportTicket";      -- drops the OWNED sequence too
--   DELETE FROM "_prisma_migrations"
--     WHERE migration_name IN ('20260731120000_add_platform_support_tickets',
--                              '20260805120000_add_support_ticket_attachments');
-- COMMIT;
--
-- Note: dropping these tables does NOT delete the uploaded objects in GCS.
-- Purge the `support/<orgId>/...` prefix separately if required.
-- =====================================================================
