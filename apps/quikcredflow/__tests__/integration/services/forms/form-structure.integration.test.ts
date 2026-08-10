/**
 * FR-RE Unit 2 (FR-RE-4) — form structure builder, real-DB.
 *
 * version fixture → seed protected tab (+ its 4 fields) → create tab/section →
 * place a field → read back; protected-tab delete is rejected. Local/test DB.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import {
  seedProtectedDispositionTab,
  createFormTab,
  createFormSection,
  placeFormField,
  deleteFormTab,
  getFormStructure,
  PROTECTED_DISPOSITION_TAB_NAME,
  FormStructureError,
} from "@/lib/services/forms/form-structure.service";

const TENANT = `int_frre_u2_${Date.now()}`;
let setId: string;
let versionId: string;

beforeAll(async () => {
  const set = await integrationPrisma.qcfFormSet.create({
    data: { orgId: TENANT, surface: "call_disposition", name: `Set ${Date.now()}` },
  });
  setId = set.id;
  const version = await integrationPrisma.qcfFormSetVersion.create({
    data: { formSetId: setId, versionNumber: 1, status: "draft" },
  });
  versionId = version.id;
});

afterAll(async () => {
  await integrationPrisma.qcfFormField.deleteMany({ where: { formSetVersionId: versionId } });
  await integrationPrisma.qcfFormSection.deleteMany({ where: { tab: { formSetVersionId: versionId } } });
  await integrationPrisma.qcfFormTab.deleteMany({ where: { formSetVersionId: versionId } });
  await integrationPrisma.qcfFormSetVersion.deleteMany({ where: { id: versionId } });
  await integrationPrisma.qcfFormSet.deleteMany({ where: { id: setId } });
  await integrationPrisma.$disconnect();
});

describe("FR-RE-4 — form structure builder (integration)", () => {
  it("seeds the protected Call Disposition tab + its four protected fields", async () => {
    await seedProtectedDispositionTab(versionId, "u_int");

    const structure = await getFormStructure(versionId);
    const protectedTab = structure.find((t) => t.isProtected);
    expect(protectedTab?.name).toBe(PROTECTED_DISPOSITION_TAB_NAME);
    expect(protectedTab?.visibility).toBe("always");

    const keys = (protectedTab?.fields ?? []).map((f) => f.fieldKey).sort();
    expect(keys).toEqual(["contact_stage", "notes", "status", "sub_stage"]);
    expect((protectedTab?.fields ?? []).every((f) => f.isProtected)).toBe(true);
  });

  it("creates a rule_driven tab + section and places a field onto them", async () => {
    const tab = await createFormTab({
      formSetVersionId: versionId,
      name: "Payment Form",
      visibility: "rule_driven",
      sortOrder: 1,
      createdByUserId: "u_int",
    });
    const section = await createFormSection({ formTabId: tab.id, name: "Proof", sortOrder: 0 });

    const field = await integrationPrisma.qcfFormField.create({
      data: {
        formSetVersionId: versionId,
        tab: "call_disposition",
        fieldKey: "payment_proof",
        label: "Payment Proof",
        fieldType: "file_upload",
        sortOrder: 0,
        requiredLevel: "soft",
        defaultVisibility: "hidden",
      },
    });

    const placed = await placeFormField({ fieldId: field.id, formTabId: tab.id, formSectionId: section.id });
    expect(placed.formTabId).toBe(tab.id);
    expect(placed.formSectionId).toBe(section.id);

    const structure = await getFormStructure(versionId);
    const payTab = structure.find((t) => t.id === tab.id);
    expect(payTab?.visibility).toBe("rule_driven");
    expect(payTab?.sections.map((s) => s.name)).toContain("Proof");
    expect(payTab?.fields.map((f) => f.fieldKey)).toContain("payment_proof");
  });

  it("rejects deleting the protected tab; deletes a non-protected empty tab", async () => {
    const structure = await getFormStructure(versionId);
    const protectedTabId = structure.find((t) => t.isProtected)!.id;

    await expect(deleteFormTab(protectedTabId)).rejects.toBeInstanceOf(FormStructureError);
    // still there
    expect((await getFormStructure(versionId)).some((t) => t.id === protectedTabId)).toBe(true);

    // a fresh empty non-protected tab deletes cleanly
    const tmp = await createFormTab({ formSetVersionId: versionId, name: "Temp", visibility: "always", sortOrder: 9 });
    await deleteFormTab(tmp.id);
    expect((await getFormStructure(versionId)).some((t) => t.id === tmp.id)).toBe(false);
  });
});
