/**
 * FR-RE Unit 1 — data-model shape (real-DB).
 *
 * Defines what the FR-RE migration must produce. Read-only — queries
 * information_schema / pg_catalog on the LOCAL/test DB. It FAILS until the
 * migration is applied (db push) and passes once the 6 new tables, the
 * form_field / field_value extensions, the extended enums, and the GIN index
 * exist with the specified shape. Uses raw SQL so it does not depend on the
 * Prisma client being regenerated.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterAll } from "vitest";
import { integrationPrisma } from "../helpers/integrationDb";

const SCHEMA = "app_quikcrmexpress"; // constant; interpolated into read-only catalog queries

async function tableNames(): Promise<Set<string>> {
  const rows = await integrationPrisma.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = '${SCHEMA}'`,
  );
  return new Set(rows.map((r) => r.table_name));
}

async function columnsOf(table: string): Promise<Set<string>> {
  const rows = await integrationPrisma.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns
       WHERE table_schema = '${SCHEMA}' AND table_name = '${table}'`,
  );
  return new Set(rows.map((r) => r.column_name));
}

async function enumLabels(typeName: string): Promise<Set<string>> {
  const rows = await integrationPrisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = '${SCHEMA}' AND t.typname = '${typeName}'`,
  );
  return new Set(rows.map((r) => r.enumlabel));
}

afterAll(async () => {
  await integrationPrisma.$disconnect();
});

describe("FR-RE Unit 1 — data-model shape", () => {
  it("creates the 6 FR-RE tables", async () => {
    const tables = await tableNames();
    for (const t of [
      "CrmFormTab",
      "CrmFormSection",
      "CrmFormRule",
      "CrmFormRuleCondition",
      "CrmFormRuleAction",
      "CrmFileAttachment",
    ]) {
      expect(tables.has(t), `table ${t} should exist`).toBe(true);
    }
  });

  it("extends CrmFormField with FR-RE columns (tab/section FK, user-picker, default visibility)", async () => {
    const cols = await columnsOf("CrmFormField");
    for (const c of [
      "formTabId",
      "formSectionId",
      "userPickerMode",
      "userPickerScope",
      "defaultVisibility",
    ]) {
      expect(cols.has(c), `CrmFormField.${c}`).toBe(true);
    }
  });

  it("extends CrmFieldValue with valueFileId + valueUserIds", async () => {
    const cols = await columnsOf("CrmFieldValue");
    expect(cols.has("valueFileId"), "CrmFieldValue.valueFileId").toBe(true);
    expect(cols.has("valueUserIds"), "CrmFieldValue.valueUserIds").toBe(true);
  });

  it("extends CrmFormFieldType + CrmFieldValueType enums with user_picker + file_upload", async () => {
    const ft = await enumLabels("CrmFormFieldType");
    expect(ft.has("user_picker"), "CrmFormFieldType.user_picker").toBe(true);
    expect(ft.has("file_upload"), "CrmFormFieldType.file_upload").toBe(true);
    const vt = await enumLabels("CrmFieldValueType");
    expect(vt.has("user_picker"), "CrmFieldValueType.user_picker").toBe(true);
    expect(vt.has("file_upload"), "CrmFieldValueType.file_upload").toBe(true);
  });

  it("key shape: CrmFormRule / CrmFormRuleCondition / CrmFormRuleAction columns", async () => {
    const rule = await columnsOf("CrmFormRule");
    for (const c of ["formSetVersionId", "name", "matchType", "sortOrder", "isActive", "createdByUserId"]) {
      expect(rule.has(c), `CrmFormRule.${c}`).toBe(true);
    }
    const cond = await columnsOf("CrmFormRuleCondition");
    for (const c of ["formRuleId", "subjectKind", "subjectFieldKey", "operator", "valueKeys", "sortOrder"]) {
      expect(cond.has(c), `CrmFormRuleCondition.${c}`).toBe(true);
    }
    const action = await columnsOf("CrmFormRuleAction");
    for (const c of ["formRuleId", "actionType", "targetKind", "targetFieldKey", "targetTabId", "setStatusId", "setSubStatusId"]) {
      expect(action.has(c), `CrmFormRuleAction.${c}`).toBe(true);
    }
  });

  it("key shape: CrmFormTab / CrmFormSection / CrmFileAttachment columns", async () => {
    const tab = await columnsOf("CrmFormTab");
    for (const c of ["formSetVersionId", "name", "sortOrder", "visibility", "isProtected", "createdByUserId"]) {
      expect(tab.has(c), `CrmFormTab.${c}`).toBe(true);
    }
    const section = await columnsOf("CrmFormSection");
    for (const c of ["formTabId", "name", "sortOrder"]) {
      expect(section.has(c), `CrmFormSection.${c}`).toBe(true);
    }
    const file = await columnsOf("CrmFileAttachment");
    for (const c of ["orgId", "activityId", "storageKey", "filename", "contentType", "sizeBytes", "uploadedBy"]) {
      expect(file.has(c), `CrmFileAttachment.${c}`).toBe(true);
    }
  });

  it("creates a GIN index covering CrmFieldValue.valueUserIds (FR-RE-3f reporting readiness)", async () => {
    const rows = await integrationPrisma.$queryRawUnsafe<{ indexdef: string }[]>(
      `SELECT indexdef FROM pg_indexes WHERE schemaname = '${SCHEMA}' AND tablename = 'CrmFieldValue'`,
    );
    const hasGin = rows.some((r) => /\bgin\b/i.test(r.indexdef) && /valueUserIds/i.test(r.indexdef));
    expect(hasGin, "expected a GIN index covering valueUserIds").toBe(true);
  });
});
