-- Prospect email discovery.
--
-- Idempotent (IF NOT EXISTS) so it is safe to apply to the shared DB by hand;
-- the build pipeline does not run `migrate deploy`. Matches the convention of
-- 20260813000000_quikcrm_prospect_linkedin_conversation.
--
-- PURELY ADDITIVE. Two new tables, no change to any existing column, so every
-- existing row stays valid and no backfill is required. A prospect with no
-- discovery row simply means the cascade has never been run for it.
--
-- ── Why a separate table rather than columns on CrmProspect ────────────────
-- A discovered address is not the same thing as a known address.
-- CrmProspect.email is what the CRM will actually mail; CrmProspectEmailDiscovery
-- is the audit trail of how (and how confidently) a value was arrived at, plus
-- the holding pen for suggestions too weak to promote. Only high-confidence
-- provider hits (Hunter/Apollo at >= 0.8) are copied onto the prospect — see
-- lib/services/prospects/email-discovery/cascade.ts::shouldPromote.
--
-- Most prospects arrive with an email already, so these columns would be mostly
-- NULL if widened onto CrmProspect.

-- ── One discovery result per prospect ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmProspectEmailDiscovery" (
    "id"         TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    -- verified | guessed | not_found | domain_not_found | company_invalid
    -- NOTE: "verified" means a data provider returned the address with a score
    -- above threshold, NOT that mail was ever delivered to it. There is no SMTP
    -- verification in the cascade (Vercel blocks outbound port 25), so no
    -- stronger claim is available.
    "status"     TEXT NOT NULL,
    "email"      TEXT,
    -- 0..1. Provider score where one exists, else a fixed per-source value.
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "domain"     TEXT,
    -- One of: firstname.lastname | firstname | firstinitiallastname |
    --         firstlast | firstname_lastname
    "pattern"    TEXT,
    -- hunter | apollo | pattern_memory | public_inference | guess
    "source"     TEXT,
    -- Incremented on every run so a prospect that repeatedly fails can be
    -- excluded from re-runs instead of burning provider credits forever.
    "attempts"   INTEGER NOT NULL DEFAULT 0,
    "lastError"  TEXT,
    "lastRunAt"  TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmProspectEmailDiscovery_pkey" PRIMARY KEY ("id")
);

-- One discovery record per prospect: re-running overwrites in place and
-- increments `attempts` rather than accumulating history rows.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmProspectEmailDiscovery_prospectId_key"
    ON "app_quikcrm"."CrmProspectEmailDiscovery"("prospectId");

CREATE INDEX IF NOT EXISTS "CrmProspectEmailDiscovery_orgId_idx"
    ON "app_quikcrm"."CrmProspectEmailDiscovery"("orgId");

CREATE INDEX IF NOT EXISTS "CrmProspectEmailDiscovery_orgId_status_idx"
    ON "app_quikcrm"."CrmProspectEmailDiscovery"("orgId", "status");

-- CASCADE: the discovery result is meaningless without its prospect, and unlike
-- the Upwork/ICP references on CrmProspect there is nothing here a user has
-- worked on independently that deleting a prospect should preserve.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'CrmProspectEmailDiscovery_prospectId_fkey'
    ) THEN
        ALTER TABLE "app_quikcrm"."CrmProspectEmailDiscovery"
            ADD CONSTRAINT "CrmProspectEmailDiscovery_prospectId_fkey"
            FOREIGN KEY ("prospectId")
            REFERENCES "app_quikcrm"."CrmProspect"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ── Learned email pattern per company domain ───────────────────────────────
-- The Postgres replacement for the source implementation's in-process Map
-- cache. Persisted because the discovery route is serverless: a Map dies with
-- the instance, so every cold start would re-pay for a provider lookup it had
-- already made. The second prospect at the same company then costs no credits.
--
-- Scoped per org, not globally: one tenant's data must never inform another's,
-- consistent with every other table in this schema.
CREATE TABLE IF NOT EXISTS "app_quikcrm"."CrmOrgEmailPattern" (
    "id"        TEXT NOT NULL,
    "orgId"     TEXT NOT NULL,
    "domain"    TEXT NOT NULL,
    "pattern"   TEXT NOT NULL,
    -- hunter | apollo | inferred
    "source"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOrgEmailPattern_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrgEmailPattern_orgId_domain_key"
    ON "app_quikcrm"."CrmOrgEmailPattern"("orgId", "domain");

CREATE INDEX IF NOT EXISTS "CrmOrgEmailPattern_orgId_idx"
    ON "app_quikcrm"."CrmOrgEmailPattern"("orgId");
