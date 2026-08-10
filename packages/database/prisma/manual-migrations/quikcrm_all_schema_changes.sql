-- =============================================================================
-- QuikCRM — Consolidated schema changes (all migrations in one file)
-- =============================================================================
-- Combines every QuikCRM schema migration into a single, idempotent script,
-- applied in chronological (dependency-safe) order. Safe to run by hand against
-- the shared DB — the build pipeline does not run `prisma migrate deploy`.
--
-- All objects use CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS, so
-- re-running is a no-op. Every table is orgId-scoped with FK orgId ->
-- quikit."Org"(id) ON DELETE CASCADE. Index/constraint names match Prisma's
-- generated names (@@unique / @@index / @id) so the generated client stays in
-- sync with the DB.
--
-- Source migrations (packages/database/prisma/migrations/):
--   1. 20260623120000_quikcrm_activity_types
--   2. 20260623130000_quikcrm_activity_field_values
--   3. 20260703120000_quikcrm_api_keys
--   4. 20260716120000_quikcrm_email_integration
--   5. 20260717120000_quikcrm_email_history_sync
--   6. 20260717130000_quikcrm_mailbox_emails
--   7. 20260723120000_quikcrm_prospects
--   8. 20260723140000_quikcrm_prospect_convert
--   9. 20260803120000_quikcrm_activity_type_targets
--
-- NOTE: CrmActivity (referenced by CrmActivityFieldValue below) must already
-- exist from the base QuikCRM init migration before running section 2.
-- =============================================================================


-- =============================================================================
-- 1. Activity Types + flat custom-field DEFINITIONS  (Phase 1)
--    from 20260623120000_quikcrm_activity_types
-- =============================================================================
-- Admin-configurable activity TYPES (Upwork Connect, LinkedIn DM, …), each with
-- flat custom-field DEFINITIONS. Field VALUES land in CrmActivityFieldValue
-- (section 2) — NOT a JSON blob — so dashboards/digests can aggregate by value.

-- ── Activity types ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityType" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  code        text NOT NULL,
  label       text NOT NULL,
  category    text,
  config      jsonb,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL
);

-- @@unique([orgId, code])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityType_orgId_code_key"
  ON app_quikcrm."CrmActivityType" ("orgId", "code");
-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmActivityType_orgId_idx"
  ON app_quikcrm."CrmActivityType" ("orgId");

-- ── Flat custom-field definitions (cascade with their parent type) ──────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityFieldDefinition" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "activityTypeId" text NOT NULL REFERENCES app_quikcrm."CrmActivityType"(id) ON DELETE CASCADE,
  key              text NOT NULL,
  label            text NOT NULL,
  "fieldType"      text NOT NULL,
  requirement      text NOT NULL DEFAULT 'Optional',
  options          jsonb,
  visible          boolean NOT NULL DEFAULT true,
  "helpText"       text,
  "sortOrder"      integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL
);

-- @@unique([activityTypeId, key])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityFieldDefinition_activityTypeId_key_key"
  ON app_quikcrm."CrmActivityFieldDefinition" ("activityTypeId", "key");
-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldDefinition_orgId_idx"
  ON app_quikcrm."CrmActivityFieldDefinition" ("orgId");
-- @@index([activityTypeId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldDefinition_activityTypeId_idx"
  ON app_quikcrm."CrmActivityFieldDefinition" ("activityTypeId");


-- =============================================================================
-- 2. Activity custom-field VALUES — indexed, queryable storage  (Phase 2)
--    from 20260623130000_quikcrm_activity_field_values
-- =============================================================================
-- Dedicated table with TYPED columns (NOT a JSON blob) so dashboards/digests can
-- aggregate/filter BY custom-field value using the per-value indexes below.
-- One row per (activity, field definition). Depends on CrmActivity +
-- CrmActivityFieldDefinition existing first.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityFieldValue" (
  id                  text PRIMARY KEY,
  "orgId"             text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "activityId"        text NOT NULL REFERENCES app_quikcrm."CrmActivity"(id) ON DELETE CASCADE,
  "fieldDefinitionId" text NOT NULL REFERENCES app_quikcrm."CrmActivityFieldDefinition"(id) ON DELETE CASCADE,
  "fieldKey"          text NOT NULL,
  "valueText"         text,
  "valueNumber"       double precision,
  "valueDate"         timestamp(3),
  "valueBoolean"      boolean,
  "valueJson"         jsonb,
  "createdAt"         timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"         timestamp(3) NOT NULL
);

-- @@unique([activityId, fieldDefinitionId]) — one value row per field per activity
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityFieldValue_activityId_fieldDefinitionId_key"
  ON app_quikcrm."CrmActivityFieldValue" ("activityId", "fieldDefinitionId");

-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_orgId_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("orgId");
-- @@index([activityId])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_activityId_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("activityId");

-- Per-value indexes — cheap aggregate/filter BY value.
-- @@index([fieldDefinitionId, valueText])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueText_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueText");
-- @@index([fieldDefinitionId, valueNumber])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueNumber_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueNumber");
-- @@index([fieldDefinitionId, valueDate])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueDate_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueDate");
-- @@index([fieldDefinitionId, valueBoolean])
CREATE INDEX IF NOT EXISTS "CrmActivityFieldValue_fieldDefinitionId_valueBoolean_idx"
  ON app_quikcrm."CrmActivityFieldValue" ("fieldDefinitionId", "valueBoolean");


-- =============================================================================
-- 3. API Secret Keys — public API authentication
--    from 20260703120000_quikcrm_api_keys
-- =============================================================================
-- Auth for the public API layer (/api/public/*). A caller presents a raw secret
-- via Authorization: Bearer <key> / X-Api-Key; we look it up by SHA-256 hash in
-- keyHash (unique). prefix/lastFour render a non-sensitive label.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmApiKey" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name              text NOT NULL,
  "keyHash"         text NOT NULL,
  prefix            text NOT NULL,
  "lastFour"        text NOT NULL,
  "isActive"        boolean NOT NULL DEFAULT true,
  "lastUsedAt"      timestamp(3),
  "revokedAt"       timestamp(3),
  "createdByUserId" text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @unique on keyHash — the lookup key; a raw secret's SHA-256 must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmApiKey_keyHash_key"
  ON app_quikcrm."CrmApiKey" ("keyHash");
-- @@index([orgId])
CREATE INDEX IF NOT EXISTS "CrmApiKey_orgId_idx"
  ON app_quikcrm."CrmApiKey" ("orgId");
-- @@index([orgId, isActive])
CREATE INDEX IF NOT EXISTS "CrmApiKey_orgId_isActive_idx"
  ON app_quikcrm."CrmApiKey" ("orgId", "isActive");


-- =============================================================================
-- 4. Email integration (P1) — connected mailbox + threaded messages
--    from 20260716120000_quikcrm_email_integration
-- =============================================================================
-- Per-user Gmail / Microsoft 365 mailbox via OAuth. Two-way sync. OAuth tokens
-- stored AES-256-GCM encrypted (accessTokenEnc / refreshTokenEnc) — never
-- plaintext, never passwords.

-- ── Connected mailbox (one per user in P1) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmMailboxConnection" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"          text NOT NULL,
  provider          text NOT NULL,
  "emailAddress"    text NOT NULL,
  "accessTokenEnc"  text NOT NULL,
  "refreshTokenEnc" text NOT NULL,
  "tokenExpiresAt"  timestamp(3),
  scope             text,
  status            text NOT NULL DEFAULT 'active',
  "historyId"       text,
  "deltaLink"       text,
  "lastSyncedAt"    timestamp(3),
  "lastError"       text,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL
);

-- @@unique([orgId, userId])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmMailboxConnection_orgId_userId_key"
  ON app_quikcrm."CrmMailboxConnection" ("orgId", "userId");
-- @@index([orgId, status])
CREATE INDEX IF NOT EXISTS "CrmMailboxConnection_orgId_status_idx"
  ON app_quikcrm."CrmMailboxConnection" ("orgId", "status");

-- ── Conversation thread ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmEmailThread" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "mailboxConnectionId" text NOT NULL REFERENCES app_quikcrm."CrmMailboxConnection"(id) ON DELETE CASCADE,
  "providerThreadId"    text NOT NULL,
  subject               text,
  "relatedKind"         text NOT NULL,
  "relatedObjectId"     text NOT NULL,
  "lastMessageAt"       timestamp(3),
  "messageCount"        integer NOT NULL DEFAULT 0,
  "createdAt"           timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"           timestamp(3) NOT NULL
);

-- @@unique([orgId, mailboxConnectionId, providerThreadId])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmEmailThread_orgId_mailboxConnectionId_providerThreadId_key"
  ON app_quikcrm."CrmEmailThread" ("orgId", "mailboxConnectionId", "providerThreadId");
-- @@index([orgId, relatedKind, relatedObjectId])
CREATE INDEX IF NOT EXISTS "CrmEmailThread_orgId_relatedKind_relatedObjectId_idx"
  ON app_quikcrm."CrmEmailThread" ("orgId", "relatedKind", "relatedObjectId");

-- ── Message (sent or received) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmEmailMessage" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "mailboxConnectionId" text NOT NULL REFERENCES app_quikcrm."CrmMailboxConnection"(id) ON DELETE CASCADE,
  "threadId"            text NOT NULL REFERENCES app_quikcrm."CrmEmailThread"(id) ON DELETE CASCADE,
  "providerMessageId"   text NOT NULL,
  "rfcMessageId"        text,
  "inReplyTo"           text,
  direction             text NOT NULL,
  "fromAddress"         text NOT NULL,
  "toAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  "ccAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  subject               text,
  snippet               text,
  "bodyHtml"            text,
  "bodyText"            text,
  "sentAt"              timestamp(3),
  "receivedAt"          timestamp(3),
  "activityId"          text,
  "relatedKind"         text NOT NULL,
  "relatedObjectId"     text NOT NULL,
  "createdAt"           timestamp(3) NOT NULL DEFAULT now()
);

-- @@unique([orgId, mailboxConnectionId, providerMessageId])
CREATE UNIQUE INDEX IF NOT EXISTS "CrmEmailMessage_orgId_mailboxConnectionId_providerMessageId_key"
  ON app_quikcrm."CrmEmailMessage" ("orgId", "mailboxConnectionId", "providerMessageId");
-- @@index([orgId, threadId])
CREATE INDEX IF NOT EXISTS "CrmEmailMessage_orgId_threadId_idx"
  ON app_quikcrm."CrmEmailMessage" ("orgId", "threadId");
-- @@index([orgId, relatedKind, relatedObjectId])
CREATE INDEX IF NOT EXISTS "CrmEmailMessage_orgId_relatedKind_relatedObjectId_idx"
  ON app_quikcrm."CrmEmailMessage" ("orgId", "relatedKind", "relatedObjectId");

-- ── Attachment (metadata; bytes fetched lazily on download) ──────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmEmailAttachment" (
  id                     text PRIMARY KEY,
  "orgId"                text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "messageId"            text NOT NULL REFERENCES app_quikcrm."CrmEmailMessage"(id) ON DELETE CASCADE,
  filename               text NOT NULL,
  "mimeType"             text,
  "sizeBytes"            integer,
  "providerAttachmentId" text,
  "storageUrl"           text,
  "createdAt"            timestamp(3) NOT NULL DEFAULT now()
);

-- @@index([orgId, messageId])
CREATE INDEX IF NOT EXISTS "CrmEmailAttachment_orgId_messageId_idx"
  ON app_quikcrm."CrmEmailAttachment" ("orgId", "messageId");


-- =============================================================================
-- 5. Email full-history sync (P2) — backfill state + per-folder delta cursors
--    from 20260717120000_quikcrm_email_history_sync
-- =============================================================================
-- One-time 90-day backfill of Inbox + Sent, then incremental. Microsoft delta
-- is PER-FOLDER, so inbox/sentitems tracked with separate deltaLinks.
-- Additive only — defaults backfill new columns.

ALTER TABLE app_quikcrm."CrmMailboxConnection"
  ADD COLUMN IF NOT EXISTS "syncState"      text NOT NULL DEFAULT 'initial',
  ADD COLUMN IF NOT EXISTS "backfillCursor" text,
  ADD COLUMN IF NOT EXISTS "backfillSince"  timestamp(3),
  ADD COLUMN IF NOT EXISTS "deltaInbox"     text,
  ADD COLUMN IF NOT EXISTS "deltaSent"      text;


-- =============================================================================
-- 6. Mailbox module (P3) — raw mirror of every email + drafts delta cursor
--    from 20260717130000_quikcrm_mailbox_emails
-- =============================================================================
-- CrmMailboxEmail stores EVERY fetched email (not just CRM-matched), powering
-- the in-CRM Mailbox module (Inbox/Sent/Drafts/All) read entirely from the DB.
-- crmEmailMessageId cross-links a mirror row to its CRM-matched counterpart.

-- Drafts delta cursor (Microsoft Graph is per-folder).
ALTER TABLE app_quikcrm."CrmMailboxConnection"
  ADD COLUMN IF NOT EXISTS "deltaDrafts" text;

-- Raw mailbox mirror.
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmMailboxEmail" (
  id                    text PRIMARY KEY,
  "orgId"               text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "mailboxConnectionId" text NOT NULL REFERENCES app_quikcrm."CrmMailboxConnection"(id) ON DELETE CASCADE,
  provider              text NOT NULL,
  "providerMessageId"   text NOT NULL,
  "providerThreadId"    text,
  folder                text NOT NULL,
  direction             text NOT NULL,
  "fromAddress"         text NOT NULL,
  "fromName"            text,
  "toAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  "ccAddresses"         text[] NOT NULL DEFAULT ARRAY[]::text[],
  "bccAddresses"        text[] NOT NULL DEFAULT ARRAY[]::text[],
  subject               text,
  preview               text,
  "bodyHtml"            text,
  "bodyText"            text,
  "hasAttachments"      boolean NOT NULL DEFAULT false,
  attachments           jsonb,
  "receivedAt"          timestamp(3),
  "sentAt"              timestamp(3),
  "isRead"              boolean NOT NULL DEFAULT false,
  "isStarred"           boolean NOT NULL DEFAULT false,
  labels                text[] NOT NULL DEFAULT ARRAY[]::text[],
  "crmEmailMessageId"   text,
  "matchedKind"         text,
  "matchedObjectId"     text,
  "syncedAt"            timestamp(3) NOT NULL DEFAULT now(),
  "createdAt"           timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"           timestamp(3) NOT NULL
);

-- @@unique([orgId, mailboxConnectionId, providerMessageId]) — dedupe guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_providerMessageId_key"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "providerMessageId");
-- @@index([orgId, mailboxConnectionId, folder, receivedAt]) — list views.
CREATE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_folder_receivedAt_idx"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "folder", "receivedAt");
-- @@index([orgId, mailboxConnectionId, isRead]) — unread badge/filter.
CREATE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_isRead_idx"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "isRead");
-- @@index([orgId, mailboxConnectionId, providerThreadId]) — detail thread.
CREATE INDEX IF NOT EXISTS "CrmMailboxEmail_orgId_mailboxConnectionId_providerThreadId_idx"
  ON app_quikcrm."CrmMailboxEmail" ("orgId", "mailboxConnectionId", "providerThreadId");


-- =============================================================================
-- 7. Prospects module — LinkedIn "Save to CRM" capture table
--    from 20260723120000_quikcrm_prospects
-- =============================================================================
-- Standalone capture table (NOT a CrmLead). The Chrome extension posts the
-- extracted profile to /api/leads/from-linkedin, which upserts one row per
-- (orgId, linkedinUrl).

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmProspect" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text,
  phone            text,
  title            text,
  company          text,
  "linkedinUrl"    text,
  "shortSummary"   text,
  about            text,
  "profilePicture" text,
  posts            jsonb,
  "companyData"    jsonb,
  experiences      jsonb,
  "savedById"      text,
  "savedByName"    text,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL
);

-- @@unique([orgId, linkedinUrl]) — one prospect per LinkedIn profile per org.
-- (Postgres treats NULL linkedinUrl values as distinct, so URL-less captures do
-- not collide — matches Prisma's generated unique index semantics.)
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProspect_orgId_linkedinUrl_key"
  ON app_quikcrm."CrmProspect" ("orgId", "linkedinUrl");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_idx"
  ON app_quikcrm."CrmProspect" ("orgId");
-- @@index([orgId, createdAt]) — list view, newest first.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_createdAt_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "createdAt");


-- =============================================================================
-- 8. Prospect conversion state
--    from 20260723140000_quikcrm_prospect_convert
-- =============================================================================
-- Adds status / convertedLeadId / convertedAt to CrmProspect so a prospect can
-- be converted into a CrmLead. Marked "Converted" (from default "New") once the
-- lead is created, with a pointer back to the created lead.

ALTER TABLE app_quikcrm."CrmProspect"
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS "convertedLeadId" text,
  ADD COLUMN IF NOT EXISTS "convertedAt" timestamp(3);

-- @@index([orgId, status]) — list filtering by conversion state.
CREATE INDEX IF NOT EXISTS "CrmProspect_orgId_status_idx"
  ON app_quikcrm."CrmProspect" ("orgId", "status");

-- =============================================================================
-- 9. Activity Type-wise daily targets
--    from 20260803120000_quikcrm_activity_type_targets
-- =============================================================================
-- Per-salesperson daily target for ONE activity type (user × CrmActivityType).
-- Additive: the OVERALL daily target stays on
-- CrmOrgWorkspaceSettings.settings.activityTargets and is not modified here.
-- Requires section 1 (CrmActivityType) to have been applied first.

CREATE TABLE IF NOT EXISTS app_quikcrm."CrmActivityTypeTarget" (
  id               text PRIMARY KEY,
  "orgId"          text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "userId"         text NOT NULL,
  "activityTypeId" text NOT NULL REFERENCES app_quikcrm."CrmActivityType"(id) ON DELETE CASCADE,
  "dailyTarget"    integer NOT NULL DEFAULT 0,
  "createdAt"      timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"      timestamp(3) NOT NULL
);

-- @@unique([orgId, userId, activityTypeId]) — one target per (user, type).
CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivityTypeTarget_orgId_userId_activityTypeId_key"
  ON app_quikcrm."CrmActivityTypeTarget" ("orgId", "userId", "activityTypeId");
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmActivityTypeTarget_orgId_idx"
  ON app_quikcrm."CrmActivityTypeTarget" ("orgId");
-- @@index([orgId, userId]) — the tracker's per-salesperson lookup.
CREATE INDEX IF NOT EXISTS "CrmActivityTypeTarget_orgId_userId_idx"
  ON app_quikcrm."CrmActivityTypeTarget" ("orgId", "userId");
-- @@index([activityTypeId]) — cascade + "who targets this type" lookups.
CREATE INDEX IF NOT EXISTS "CrmActivityTypeTarget_activityTypeId_idx"
  ON app_quikcrm."CrmActivityTypeTarget" ("activityTypeId");

-- =============================================================================
-- End of QuikCRM consolidated schema changes.
-- =============================================================================
