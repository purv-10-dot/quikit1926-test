/**
 * FR-RE Slice 0 — field CRUD on a draft version, real DB.
 *
 * createFormField / updateFormField / deleteFormField. Draft-guarded (shared
 * assertDraft); protected fields cannot be deleted; deleting a field cleans up
 * its options.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma as db } from "../../helpers/integrationDb";
import { createFormSet } from "@/lib/services/forms/form-set.service";
import {
  createFormField,
  updateFormField,
  deleteFormField,
  FormStructureError,
} from "@/lib/services/forms/form-structure.service";
import { publishVersion } from "@/lib/services/forms/form-version.service";

const STAMP = Date.now();
const TENANT = `int_frre_s0fld_${STAMP}`;
let setId: string;
let versionId: string;

beforeAll(async () => {
  const { set, version } = await createFormSet({ tenantId: TENANT, name: `Fld ${STAMP}` });
  setId = set.id;
  versionId = version.id;
});

afterAll(async () => {
  const tabs = await db.crmFormTab.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  const fields = await db.crmFormField.findMany({ where: { formSetVersionId: versionId }, select: { id: true } });
  if (fields.length) await db.crmFormFieldOption.deleteMany({ where: { formFieldId: { in: fields.map((f) => f.id) } } });
  await db.crmFormField.deleteMany({ where: { formSetVersionId: versionId } });
  if (tabs.length) await db.crmFormSection.deleteMany({ where: { formTabId: { in: tabs.map((t) => t.id) } } });
  await db.crmFormTab.deleteMany({ where: { formSetVersionId: versionId } });
  await db.crmFormSet.update({ where: { id: setId }, data: { currentVersionId: null } });
  await db.crmFormSetVersion.deleteMany({ where: { formSetId: setId } });
  await db.crmFormSet.deleteMany({ where: { id: setId } });
});

describe("field CRUD on a draft", () => {
  it("creates a dropdown field with options", async () => {
    const field = await createFormField({
      formSetVersionId: versionId,
      fieldKey: "payment_mode",
      label: "Payment Mode",
      fieldType: "dropdown",
      requiredLevel: "soft",
      sortOrder: 10,
      options: [{ valueKey: "upi", label: "UPI" }, { valueKey: "invoice", label: "Invoice" }],
    });
    expect(field.fieldKey).toBe("payment_mode");
    expect(await db.crmFormFieldOption.count({ where: { formFieldId: field.id } })).toBe(2);
  });

  it("updates a field's label and requirement", async () => {
    const field = await createFormField({
      formSetVersionId: versionId, fieldKey: "verifier", label: "Verifier", fieldType: "user_picker", sortOrder: 11,
    });
    const updated = await updateFormField({ fieldId: field.id, label: "Payment Verifier", requiredLevel: "hard" });
    expect(updated.label).toBe("Payment Verifier");
    expect(updated.requiredLevel).toBe("hard");
  });

  it("deletes a non-protected field (and its options)", async () => {
    const field = await createFormField({
      formSetVersionId: versionId, fieldKey: "scratch", label: "Scratch", fieldType: "text", sortOrder: 12,
    });
    await deleteFormField(field.id);
    expect(await db.crmFormField.findUnique({ where: { id: field.id } })).toBeNull();
  });

  it("refuses to delete a protected field", async () => {
    const prot = await db.crmFormField.findFirst({ where: { formSetVersionId: versionId, isProtected: true } });
    await expect(deleteFormField(prot!.id)).rejects.toBeInstanceOf(FormStructureError);
  });

  it("refuses to create a field on a PUBLISHED version (draft guard)", async () => {
    await publishVersion(versionId);
    await expect(
      createFormField({ formSetVersionId: versionId, fieldKey: "late", label: "Late", fieldType: "text", sortOrder: 99 }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
