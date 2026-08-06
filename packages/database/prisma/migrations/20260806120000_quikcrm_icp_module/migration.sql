-- ICP (Ideal Customer Profile) module — app_quikcrm.
--
-- Idempotent (CREATE TABLE/INDEX/TYPE IF NOT EXISTS) so it is safe to apply to
-- the shared DB by hand; the build pipeline does not run `migrate deploy`. Index
-- names match Prisma's generated names for @@unique / @@index so the client
-- stays in sync with the DB.
--
-- Reuses existing masters rather than duplicating them:
--   * products AND services  -> app_quikcrm."CrmProduct" (a service is
--                               productType = 'Service'; no CrmService table)
--   * companies              -> app_quikcrm."CrmAccount"
-- Only the three dimensions with no prior master (Industry / Vertical /
-- Technology) get a new table, and they share one polymorphic table keyed by
-- `kind`, following the existing CrmProductTaxonomy precedent.

-- ── Enum ─────────────────────────────────────────────────────────────────────
-- CREATE TYPE has no IF NOT EXISTS in Postgres; guard with a DO block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'CrmIcpTaxonomyKind' AND n.nspname = 'app_quikcrm'
  ) THEN
    CREATE TYPE app_quikcrm."CrmIcpTaxonomyKind" AS ENUM ('Industry', 'Vertical', 'Technology');
  END IF;
END
$$;

-- ── CrmIcpProfile ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfile" (
  id                 text PRIMARY KEY,
  "orgId"            text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name               text NOT NULL,
  description        text,
  "personaNotes"     text,
  segment            app_quikcrm."CrmAccountSegment",
  "employeeCountMin" integer,
  "employeeCountMax" integer,
  "annualRevenueMin" numeric(18, 2),
  "annualRevenueMax" numeric(18, 2),
  "revenueCurrency"  text DEFAULT 'INR',
  "countryCodes"     text[] NOT NULL DEFAULT ARRAY[]::text[],
  regions            text[] NOT NULL DEFAULT ARRAY[]::text[],
  "isActive"         boolean NOT NULL DEFAULT true,
  "deletedAt"        timestamp(3),
  "createdByUserId"  text,
  "updatedByUserId"  text,
  "createdAt"        timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"        timestamp(3) NOT NULL
);

-- @@unique([orgId, name]) — one ICP name per org.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_name_key"
  ON app_quikcrm."CrmIcpProfile" ("orgId", name);
-- @@index([orgId]) — org scoping.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId");
-- @@index([orgId, deletedAt]) — active-vs-trash list queries.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_deletedAt_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId", "deletedAt");
-- @@index([orgId, isActive]) — status filter.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_isActive_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId", "isActive");
-- @@index([orgId, segment]) — segment filter.
CREATE INDEX IF NOT EXISTS "CrmIcpProfile_orgId_segment_idx"
  ON app_quikcrm."CrmIcpProfile" ("orgId", segment);

-- ── CrmIcpTaxonomy ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpTaxonomy" (
  id          text PRIMARY KEY,
  "orgId"     text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  kind        app_quikcrm."CrmIcpTaxonomyKind" NOT NULL,
  name        text NOT NULL,
  code        text,
  "parentId"  text REFERENCES app_quikcrm."CrmIcpTaxonomy"(id) ON DELETE SET NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive"  boolean NOT NULL DEFAULT true,
  "createdAt" timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamp(3) NOT NULL
);

-- @@unique([orgId, kind, name, parentId]) — no duplicate sibling names per kind.
CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_name_parentId_key"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind, name, "parentId");
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind);
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_kind_isActive_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", kind, "isActive");
CREATE INDEX IF NOT EXISTS "CrmIcpTaxonomy_orgId_parentId_idx"
  ON app_quikcrm."CrmIcpTaxonomy" ("orgId", "parentId");

-- ── CrmIcpProfileTaxonomy (ICP <-> industry/vertical/technology) ──────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfileTaxonomy" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "icpProfileId" text NOT NULL REFERENCES app_quikcrm."CrmIcpProfile"(id) ON DELETE CASCADE,
  "taxonomyId"   text NOT NULL REFERENCES app_quikcrm."CrmIcpTaxonomy"(id) ON DELETE CASCADE,
  kind           app_quikcrm."CrmIcpTaxonomyKind" NOT NULL,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_icpProfileId_taxonomyId_key"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId", "icpProfileId", "taxonomyId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_icpProfileId_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId", "icpProfileId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_orgId_icpProfileId_kind_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("orgId", "icpProfileId", kind);
CREATE INDEX IF NOT EXISTS "CrmIcpProfileTaxonomy_taxonomyId_idx"
  ON app_quikcrm."CrmIcpProfileTaxonomy" ("taxonomyId");

-- ── CrmIcpProfileProduct (ICP <-> product/service) ───────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfileProduct" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "icpProfileId" text NOT NULL REFERENCES app_quikcrm."CrmIcpProfile"(id) ON DELETE CASCADE,
  "productId"    text NOT NULL REFERENCES app_quikcrm."CrmProduct"(id) ON DELETE CASCADE,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfileProduct_orgId_icpProfileId_productId_key"
  ON app_quikcrm."CrmIcpProfileProduct" ("orgId", "icpProfileId", "productId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileProduct_orgId_idx"
  ON app_quikcrm."CrmIcpProfileProduct" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileProduct_orgId_icpProfileId_idx"
  ON app_quikcrm."CrmIcpProfileProduct" ("orgId", "icpProfileId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileProduct_productId_idx"
  ON app_quikcrm."CrmIcpProfileProduct" ("productId");

-- ── CrmIcpProfileAccount (ICP <-> example company) ───────────────────────────
CREATE TABLE IF NOT EXISTS app_quikcrm."CrmIcpProfileAccount" (
  id             text PRIMARY KEY,
  "orgId"        text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  "icpProfileId" text NOT NULL REFERENCES app_quikcrm."CrmIcpProfile"(id) ON DELETE CASCADE,
  "accountId"    text NOT NULL REFERENCES app_quikcrm."CrmAccount"(id) ON DELETE CASCADE,
  note           text,
  "createdAt"    timestamp(3) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIcpProfileAccount_orgId_icpProfileId_accountId_key"
  ON app_quikcrm."CrmIcpProfileAccount" ("orgId", "icpProfileId", "accountId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileAccount_orgId_idx"
  ON app_quikcrm."CrmIcpProfileAccount" ("orgId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileAccount_orgId_icpProfileId_idx"
  ON app_quikcrm."CrmIcpProfileAccount" ("orgId", "icpProfileId");
CREATE INDEX IF NOT EXISTS "CrmIcpProfileAccount_accountId_idx"
  ON app_quikcrm."CrmIcpProfileAccount" ("accountId");
