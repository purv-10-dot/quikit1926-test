-- Call Disposition Form Builder — initial schema
-- Spec: quikcrm-disposition-form-builder-spec.md Section 12, Step 1
-- Limits (confirmed): 30 fields/tab · 50 options/field · 25 sets/tenant · 60-char labels
-- Staleness cutoff (confirmed): 30 minutes (enforced at service layer, not DB)

-- ─── Enums ───────────────────────────────────────────────────────────────────

-- surface discriminator: v1 only call_disposition; additive for future surfaces
CREATE TYPE "app_quikcrm"."CrmFormSurface" AS ENUM ('call_disposition');

CREATE TYPE "app_quikcrm"."CrmFormSetVersionStatus" AS ENUM ('draft', 'published', 'retired');

CREATE TYPE "app_quikcrm"."CrmFormFieldTab" AS ENUM ('contact_details', 'call_disposition');

CREATE TYPE "app_quikcrm"."CrmFormFieldType" AS ENUM ('text', 'datetime', 'dropdown', 'number');

CREATE TYPE "app_quikcrm"."CrmFormFieldRequiredLevel" AS ENUM ('none', 'soft', 'hard');

CREATE TYPE "app_quikcrm"."CrmFieldValueType" AS ENUM ('text', 'datetime', 'dropdown', 'number');

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- CrmFormSet: named, tenant-scoped form set with surface discriminator.
-- currentVersionId FK added after CrmFormSetVersion is created (circular ref).
CREATE TABLE "app_quikcrm"."CrmFormSet" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "surface"          "app_quikcrm"."CrmFormSurface" NOT NULL,
  "name"             TEXT NOT NULL,
  "isDefault"        BOOLEAN NOT NULL DEFAULT false,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "currentVersionId" TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmFormSet_pkey" PRIMARY KEY ("id")
);

-- CrmFormSetVersion: immutable snapshots of a set's structure and mapping.
CREATE TABLE "app_quikcrm"."CrmFormSetVersion" (
  "id"            TEXT NOT NULL,
  "formSetId"     TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "status"        "app_quikcrm"."CrmFormSetVersionStatus" NOT NULL DEFAULT 'draft',
  "publishedAt"   TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmFormSetVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmFormSetVersion_formSetId_fkey"
    FOREIGN KEY ("formSetId")
    REFERENCES "app_quikcrm"."CrmFormSet"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Resolve circular reference: CrmFormSet.currentVersionId → CrmFormSetVersion
ALTER TABLE "app_quikcrm"."CrmFormSet"
  ADD CONSTRAINT "CrmFormSet_currentVersionId_fkey"
  FOREIGN KEY ("currentVersionId")
  REFERENCES "app_quikcrm"."CrmFormSetVersion"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CrmFormField: one input on a tab; owned by a version (snapshot).
-- fieldKey is the stable internal identifier — immutable once created.
CREATE TABLE "app_quikcrm"."CrmFormField" (
  "id"               TEXT NOT NULL,
  "formSetVersionId" TEXT NOT NULL,
  "tab"              "app_quikcrm"."CrmFormFieldTab" NOT NULL,
  "fieldKey"         TEXT NOT NULL,
  "label"            TEXT NOT NULL,
  "fieldType"        "app_quikcrm"."CrmFormFieldType" NOT NULL,
  "isProtected"      BOOLEAN NOT NULL DEFAULT false,
  "requiredLevel"    "app_quikcrm"."CrmFormFieldRequiredLevel" NOT NULL DEFAULT 'soft',
  "sortOrder"        INTEGER NOT NULL,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmFormField_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmFormField_formSetVersionId_fkey"
    FOREIGN KEY ("formSetVersionId")
    REFERENCES "app_quikcrm"."CrmFormSetVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CrmFormFieldOption: dropdown options; deactivate-not-delete.
-- valueKey is stable; label is display-only and editable.
CREATE TABLE "app_quikcrm"."CrmFormFieldOption" (
  "id"          TEXT NOT NULL,
  "formFieldId" TEXT NOT NULL,
  "valueKey"    TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "sortOrder"   INTEGER NOT NULL,
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmFormFieldOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmFormFieldOption_formFieldId_fkey"
    FOREIGN KEY ("formFieldId")
    REFERENCES "app_quikcrm"."CrmFormField"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CrmFieldValue: indexed key-value store — one row per field per activity.
-- Never a JSON blob. tenantId denormalized for ACL-filtered queries.
-- activityId stored as plain TEXT (no FK) to avoid modifying CrmActivity model.
CREATE TABLE "app_quikcrm"."CrmFieldValue" (
  "id"               TEXT NOT NULL,
  "tenantId"         TEXT NOT NULL,
  "activityId"       TEXT NOT NULL,
  "formSetVersionId" TEXT NOT NULL,
  "fieldKey"         TEXT NOT NULL,
  "valueType"        "app_quikcrm"."CrmFieldValueType" NOT NULL,
  "valueText"        TEXT,
  "valueNumber"      DECIMAL(18, 4),
  "valueDatetime"    TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmFieldValue_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmFieldValue_formSetVersionId_fkey"
    FOREIGN KEY ("formSetVersionId")
    REFERENCES "app_quikcrm"."CrmFormSetVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CrmSetSelectionLog: audit trail for per-call set selection.
-- leadId/activityId stored as TEXT (no FK) to avoid touching existing models.
CREATE TABLE "app_quikcrm"."CrmSetSelectionLog" (
  "id"             TEXT NOT NULL,
  "tenantId"       TEXT NOT NULL,
  "leadId"         TEXT NOT NULL,
  "activityId"     TEXT,
  "formSetVersionId" TEXT NOT NULL,
  "defaultSetId"   TEXT NOT NULL,
  "chosenSetId"    TEXT NOT NULL,
  "wasOverridden"  BOOLEAN NOT NULL,
  "chosenBy"       TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CrmSetSelectionLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmSetSelectionLog_defaultSetId_fkey"
    FOREIGN KEY ("defaultSetId")
    REFERENCES "app_quikcrm"."CrmFormSet"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmSetSelectionLog_chosenSetId_fkey"
    FOREIGN KEY ("chosenSetId")
    REFERENCES "app_quikcrm"."CrmFormSet"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CrmSetSelectionLog_formSetVersionId_fkey"
    FOREIGN KEY ("formSetVersionId")
    REFERENCES "app_quikcrm"."CrmFormSetVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CrmFormSetMappingRule: per-set, per-version disposition → lead-status rules.
-- Replaces the hardcoded switch in disposition-engine.ts (implemented in Step 6).
-- trigger/action stored as JSONB for indexed querying.
CREATE TABLE "app_quikcrm"."CrmFormSetMappingRule" (
  "id"               TEXT NOT NULL,
  "formSetVersionId" TEXT NOT NULL,
  "trigger"          JSONB NOT NULL,
  "action"           JSONB NOT NULL,
  "sortOrder"        INTEGER NOT NULL,
  "isActive"         BOOLEAN NOT NULL DEFAULT true,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CrmFormSetMappingRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CrmFormSetMappingRule_formSetVersionId_fkey"
    FOREIGN KEY ("formSetVersionId")
    REFERENCES "app_quikcrm"."CrmFormSetVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── Unique Constraints ───────────────────────────────────────────────────────

CREATE UNIQUE INDEX "CrmFormSet_tenantId_surface_name_key"
  ON "app_quikcrm"."CrmFormSet"("tenantId", "surface", "name");

CREATE UNIQUE INDEX "CrmFormSetVersion_formSetId_versionNumber_key"
  ON "app_quikcrm"."CrmFormSetVersion"("formSetId", "versionNumber");

CREATE UNIQUE INDEX "CrmFormField_formSetVersionId_tab_fieldKey_key"
  ON "app_quikcrm"."CrmFormField"("formSetVersionId", "tab", "fieldKey");

-- DB-level case-sensitive unique; service layer enforces case-insensitive (FR-FB-6a)
CREATE UNIQUE INDEX "CrmFormField_formSetVersionId_tab_label_key"
  ON "app_quikcrm"."CrmFormField"("formSetVersionId", "tab", "label");

CREATE UNIQUE INDEX "CrmFormFieldOption_formFieldId_valueKey_key"
  ON "app_quikcrm"."CrmFormFieldOption"("formFieldId", "valueKey");

CREATE UNIQUE INDEX "CrmFieldValue_activityId_fieldKey_key"
  ON "app_quikcrm"."CrmFieldValue"("activityId", "fieldKey");

-- ─── Standard Indexes ─────────────────────────────────────────────────────────

CREATE INDEX "CrmFormSet_tenantId_surface_isDefault_idx"
  ON "app_quikcrm"."CrmFormSet"("tenantId", "surface", "isDefault");

CREATE INDEX "CrmFormSetVersion_formSetId_status_idx"
  ON "app_quikcrm"."CrmFormSetVersion"("formSetId", "status");

CREATE INDEX "CrmFormField_formSetVersionId_tab_sortOrder_idx"
  ON "app_quikcrm"."CrmFormField"("formSetVersionId", "tab", "sortOrder");

CREATE INDEX "CrmFormFieldOption_formFieldId_isActive_sortOrder_idx"
  ON "app_quikcrm"."CrmFormFieldOption"("formFieldId", "isActive", "sortOrder");

-- v1.1 query-ready indexes on CrmFieldValue (ACL filter wraps every query)
CREATE INDEX "CrmFieldValue_tenantId_fieldKey_valueText_idx"
  ON "app_quikcrm"."CrmFieldValue"("tenantId", "fieldKey", "valueText");

CREATE INDEX "CrmFieldValue_tenantId_fieldKey_valueNumber_idx"
  ON "app_quikcrm"."CrmFieldValue"("tenantId", "fieldKey", "valueNumber");

CREATE INDEX "CrmFieldValue_tenantId_fieldKey_valueDatetime_idx"
  ON "app_quikcrm"."CrmFieldValue"("tenantId", "fieldKey", "valueDatetime");

CREATE INDEX "CrmSetSelectionLog_tenantId_leadId_idx"
  ON "app_quikcrm"."CrmSetSelectionLog"("tenantId", "leadId");

CREATE INDEX "CrmSetSelectionLog_tenantId_wasOverridden_idx"
  ON "app_quikcrm"."CrmSetSelectionLog"("tenantId", "wasOverridden");

CREATE INDEX "CrmFormSetMappingRule_formSetVersionId_isActive_sortOrder_idx"
  ON "app_quikcrm"."CrmFormSetMappingRule"("formSetVersionId", "isActive", "sortOrder");
