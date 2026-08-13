/**
 * FR-RE Unit 2 (FR-RE-4) — form structure builder: tabs, sections, field
 * placement, and the protected Call Disposition tab. Defines the builder
 * service surface. RED until lib/services/forms/form-structure.service.ts exists.
 *
 * Mocked Prisma (no real DB). Structure edits must target a DRAFT version —
 * the clone-on-edit behaviour itself is Unit 7; here we only guard that
 * mutations are rejected against a published (frozen) version.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import {
  createFormTab,
  createFormSection,
  placeFormField,
  deleteFormTab,
  seedProtectedDispositionTab,
  PROTECTED_DISPOSITION_TAB_NAME,
  FormStructureError,
} from "@/lib/services/forms/form-structure.service";

const db = mockDb();

const VERSION_ID = "ver_1";
const draftVersion = { id: VERSION_ID, status: "draft" } as never;
const publishedVersion = { id: VERSION_ID, status: "published" } as never;

beforeEach(() => {
  db.qceFormSetVersion.findUnique.mockReset();
  db.qceFormTab.create.mockReset();
  db.qceFormTab.findUnique.mockReset();
  db.qceFormTab.delete.mockReset();
  db.qceFormSection.create.mockReset();
  db.qceFormField.update.mockReset();
  db.qceFormField.create.mockReset();
});

describe("FR-RE-4 — form structure builder", () => {
  it("createFormTab: creates a rule_driven tab on a draft version", async () => {
    db.qceFormSetVersion.findUnique.mockResolvedValue(draftVersion);
    db.qceFormTab.create.mockResolvedValue({ id: "tab_1" } as never);

    await createFormTab({
      formSetVersionId: VERSION_ID,
      name: "Payment Form",
      visibility: "rule_driven",
      sortOrder: 2,
      createdByUserId: "u1",
    });

    expect(db.qceFormTab.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          formSetVersionId: VERSION_ID,
          name: "Payment Form",
          visibility: "rule_driven",
          isProtected: false,
        }),
      }),
    );
  });

  it("createFormTab: rejects a mutation against a PUBLISHED version (draft-only; clone is Unit 7)", async () => {
    db.qceFormSetVersion.findUnique.mockResolvedValue(publishedVersion);

    await expect(
      createFormTab({ formSetVersionId: VERSION_ID, name: "X", visibility: "always", sortOrder: 1 }),
    ).rejects.toBeInstanceOf(FormStructureError);
    expect(db.qceFormTab.create).not.toHaveBeenCalled();
  });

  it("createFormSection: creates a section under a tab", async () => {
    db.qceFormTab.findUnique.mockResolvedValue({ id: "tab_1", formSetVersionId: VERSION_ID } as never);
    db.qceFormSetVersion.findUnique.mockResolvedValue(draftVersion);
    db.qceFormSection.create.mockResolvedValue({ id: "sec_1" } as never);

    await createFormSection({ formTabId: "tab_1", name: "Basic Details", sortOrder: 0 });

    expect(db.qceFormSection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ formTabId: "tab_1", name: "Basic Details" }) }),
    );
  });

  it("placeFormField: sets formTabId + formSectionId on the field", async () => {
    db.qceFormField.update.mockResolvedValue({ id: "fld_1" } as never);

    await placeFormField({ fieldId: "fld_1", formTabId: "tab_1", formSectionId: "sec_1" });

    expect(db.qceFormField.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "fld_1" },
        data: expect.objectContaining({ formTabId: "tab_1", formSectionId: "sec_1" }),
      }),
    );
  });

  it("deleteFormTab: throws FormStructureError for the protected tab (undeletable)", async () => {
    db.qceFormTab.findUnique.mockResolvedValue({ id: "tab_cd", isProtected: true } as never);

    await expect(deleteFormTab("tab_cd")).rejects.toBeInstanceOf(FormStructureError);
    expect(db.qceFormTab.delete).not.toHaveBeenCalled();
  });

  it("deleteFormTab: deletes a non-protected tab", async () => {
    db.qceFormTab.findUnique.mockResolvedValue({ id: "tab_1", isProtected: false } as never);
    db.qceFormTab.delete.mockResolvedValue({ id: "tab_1" } as never);

    await deleteFormTab("tab_1");

    expect(db.qceFormTab.delete).toHaveBeenCalledWith({ where: { id: "tab_1" } });
  });

  it("seedProtectedDispositionTab: creates the protected tab AND seeds its four protected fields (D2: self-contained)", async () => {
    db.qceFormTab.create.mockResolvedValue({ id: "tab_cd" } as never);
    db.qceFormField.create.mockResolvedValue({} as never);

    await seedProtectedDispositionTab(VERSION_ID, "u1");

    // protected, always-visible tab
    expect(db.qceFormTab.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          formSetVersionId: VERSION_ID,
          name: PROTECTED_DISPOSITION_TAB_NAME,
          visibility: "always",
          isProtected: true,
        }),
      }),
    );

    // the four protected fields (FR-FB-5), seeded onto the tab — nothing else seeds them
    expect(db.qceFormField.create).toHaveBeenCalledTimes(4);
    const seeded = db.qceFormField.create.mock.calls.map(
      (c) => (c[0] as { data: { fieldKey: string; isProtected: boolean; formTabId: string } }).data,
    );
    expect(new Set(seeded.map((d) => d.fieldKey))).toEqual(
      new Set(["contact_stage", "status", "sub_stage", "notes"]),
    );
    for (const d of seeded) {
      expect(d.isProtected).toBe(true);
      expect(d.formTabId).toBe("tab_cd");
    }
  });
});
