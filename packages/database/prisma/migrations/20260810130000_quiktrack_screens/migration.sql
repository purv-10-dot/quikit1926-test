-- QuikTrack: Screens (Jira-clone "Screens" admin). An org-level QtScreen owns
-- ordered QtScreenTab rows; each tab owns ordered QtScreenField rows. A
-- workflow's "Show a screen" rule references a QtScreen by id.
-- Idempotent so it is safe to apply to the shared UAT/prod Neon DB by hand
-- (the build pipeline does not run `migrate deploy`).

-- ── QtScreen ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtScreen" (
  id            text PRIMARY KEY,
  "orgId"       text NOT NULL,
  name          text NOT NULL,
  description   text,
  "isDefault"   boolean NOT NULL DEFAULT false,
  "isDeleted"   boolean NOT NULL DEFAULT false,
  "createdAt"   timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"   timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"   text,
  "updatedBy"   text
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtScreen_orgId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtScreen"
      ADD CONSTRAINT "QtScreen_orgId_fkey"
      FOREIGN KEY ("orgId")
      REFERENCES quikit."Org"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtScreen_orgId_name_key"
  ON app_quiktrack."QtScreen" ("orgId", "name");
CREATE INDEX IF NOT EXISTS "QtScreen_orgId_idx"
  ON app_quiktrack."QtScreen" ("orgId");

-- ── QtScreenTab ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtScreenTab" (
  id         text PRIMARY KEY,
  "screenId" text NOT NULL,
  name       text NOT NULL,
  "orderNo"  integer NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtScreenTab_screenId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtScreenTab"
      ADD CONSTRAINT "QtScreenTab_screenId_fkey"
      FOREIGN KEY ("screenId")
      REFERENCES app_quiktrack."QtScreen"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "QtScreenTab_screenId_idx"
  ON app_quiktrack."QtScreenTab" ("screenId");

-- ── QtScreenField ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_quiktrack."QtScreenField" (
  id         text PRIMARY KEY,
  "tabId"    text NOT NULL,
  "fieldKey" text NOT NULL,
  "orderNo"  integer NOT NULL DEFAULT 0
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'QtScreenField_tabId_fkey'
  ) THEN
    ALTER TABLE app_quiktrack."QtScreenField"
      ADD CONSTRAINT "QtScreenField_tabId_fkey"
      FOREIGN KEY ("tabId")
      REFERENCES app_quiktrack."QtScreenTab"(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "QtScreenField_tabId_fieldKey_key"
  ON app_quiktrack."QtScreenField" ("tabId", "fieldKey");
CREATE INDEX IF NOT EXISTS "QtScreenField_tabId_idx"
  ON app_quiktrack."QtScreenField" ("tabId");
