-- QuikTrack: storage for the project header "..." (space actions) menu.
--
-- Adds:
--   1. QtProject.background  — the per-space background chosen in the menu's
--                              "Set space background" picker.
--   2. QtSpaceTemplate       — a reusable snapshot of a space's configuration,
--                              captured by the menu's "Save as template".
--
-- Fully IDEMPOTENT (ADD COLUMN IF NOT EXISTS / CREATE ... IF NOT EXISTS) — safe
-- to run more than once. Follows the conventions of
-- 2026-07-31_quiktrack_missing_tables:
--   id         -> text PRIMARY KEY (cuid generated app-side, no DB default)
--   Org FK     -> REFERENCES quikit."Org"(id) ON DELETE CASCADE
--   timestamps -> timestamp(3) NOT NULL DEFAULT now()
--   Json       -> jsonb

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Column addition on the existing QtProject table
-- ═══════════════════════════════════════════════════════════════════════════
-- Shape: {"type":"color"|"gradient"|"image","value":"<token|url>"}
-- NULL = the default plain surface (every existing space starts there).
ALTER TABLE app_quiktrack."QtProject"
  ADD COLUMN IF NOT EXISTS "background" jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Saved space templates
-- ═══════════════════════════════════════════════════════════════════════════
-- `sourceProjectId` is deliberately NOT a foreign key: a template must outlive
-- the space it was captured from, so deleting that space leaves the template
-- usable with only a dangling provenance id.
CREATE TABLE IF NOT EXISTS app_quiktrack."QtSpaceTemplate" (
  id                text PRIMARY KEY,
  "orgId"           text NOT NULL REFERENCES quikit."Org"(id) ON DELETE CASCADE,
  name              text NOT NULL,
  description       text,
  "sourceProjectId" text,
  "templateKey"     text NOT NULL DEFAULT 'scrum',
  icon              text,
  color             text DEFAULT '#2563eb',
  config            jsonb NOT NULL,
  "isDeleted"       boolean NOT NULL DEFAULT false,
  "createdAt"       timestamp(3) NOT NULL DEFAULT now(),
  "updatedAt"       timestamp(3) NOT NULL DEFAULT now(),
  "createdBy"       text,
  "updatedBy"       text
);

CREATE UNIQUE INDEX IF NOT EXISTS "QtSpaceTemplate_orgId_name_key"
  ON app_quiktrack."QtSpaceTemplate" ("orgId", name);

CREATE INDEX IF NOT EXISTS "QtSpaceTemplate_orgId_isDeleted_idx"
  ON app_quiktrack."QtSpaceTemplate" ("orgId", "isDeleted");
