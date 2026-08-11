/**
 * FR-RE Unit 2 (FR-RE-4) — form structure builder.
 *
 * CRUD for tabs / sections / field placement within a form-set VERSION, plus
 * the protected Call Disposition tab (must exist, undeletable, and — per the
 * D2 decision, since FR-FB-5 is not built and nothing else seeds them — holds
 * the four protected fields seeded here so the invariant is self-contained).
 *
 * Versioning (FR-FB-2): structure edits must target a DRAFT version. This unit
 * GUARDS that (rejects mutations against a published/frozen version); Unit 7
 * replaces the guard with clone-on-edit (auto-create a draft, then edit there).
 */
import { prisma } from "@/lib/db/prisma";
import type { QcfFormField, QcfFormSection, QcfFormTab } from "@quikit/database";

export const PROTECTED_DISPOSITION_TAB_NAME = "Call Disposition";

/**
 * The four protected fields (form-builder FR-FB-5 / rule-engine spec §5).
 * Reserved keys; undeletable/unrenameable. Contact Stage -> lead.status_id
 * (agent-read-only, moved by set_stage), Status = the disposition the agent
 * picks (primary rule subject), Sub-Stage -> lead.sub_status_id, Notes ->
 * activity.notes.
 */
export const PROTECTED_FIELDS = [
  { fieldKey: "contact_stage", label: "Contact Stage", fieldType: "dropdown", requiredLevel: "soft" },
  { fieldKey: "status", label: "Status", fieldType: "dropdown", requiredLevel: "hard" },
  { fieldKey: "sub_stage", label: "Sub-Stage", fieldType: "dropdown", requiredLevel: "soft" },
  { fieldKey: "notes", label: "Notes", fieldType: "text", requiredLevel: "soft" },
] as const;

export class FormStructureError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "FormStructureError";
    this.statusCode = statusCode;
  }
}

/**
 * Structure edits are only allowed on a draft version. Published versions are
 * frozen snapshots (records pin to them). To edit a published version, clone it
 * first via cloneVersionToDraft (form-version.service) and edit the draft — this
 * guard stays the invariant; the clone is the explicit escape hatch (Unit 7).
 */
export async function assertDraft(formSetVersionId: string): Promise<void> {
  const version = await prisma.qcfFormSetVersion.findUnique({
    where: { id: formSetVersionId },
    select: { status: true },
  });
  if (!version) throw new FormStructureError("Form set version not found", 404);
  if (version.status !== "draft") {
    throw new FormStructureError(
      "Form structure can only be edited on a draft version. Clone the set to edit a published version.",
      409,
    );
  }
}

/** Read the full tab/section/field structure of a version, ordered. */
export async function getFormStructure(formSetVersionId: string) {
  return prisma.qcfFormTab.findMany({
    where: { formSetVersionId },
    orderBy: { sortOrder: "asc" },
    include: {
      sections: { orderBy: { sortOrder: "asc" } },
      fields: {
        orderBy: { sortOrder: "asc" },
        include: { options: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
}

export async function createFormTab(input: {
  formSetVersionId: string;
  name: string;
  visibility: "always" | "rule_driven";
  sortOrder: number;
  createdByUserId?: string | null;
}): Promise<QcfFormTab> {
  await assertDraft(input.formSetVersionId);
  return prisma.qcfFormTab.create({
    data: {
      formSetVersionId: input.formSetVersionId,
      name: input.name,
      visibility: input.visibility,
      sortOrder: input.sortOrder,
      isProtected: false,
      createdByUserId: input.createdByUserId ?? null,
    },
  });
}

export async function createFormSection(input: {
  formTabId: string;
  name?: string | null;
  sortOrder: number;
}): Promise<QcfFormSection> {
  const tab = await prisma.qcfFormTab.findUnique({
    where: { id: input.formTabId },
    select: { formSetVersionId: true },
  });
  if (!tab) throw new FormStructureError("Tab not found", 404);
  await assertDraft(tab.formSetVersionId);
  return prisma.qcfFormSection.create({
    data: { formTabId: input.formTabId, name: input.name ?? null, sortOrder: input.sortOrder },
  });
}

/** Place (or move) a field onto a tab/section. Passing null clears the placement. */
export async function placeFormField(input: {
  fieldId: string;
  formTabId?: string | null;
  formSectionId?: string | null;
}): Promise<QcfFormField> {
  return prisma.qcfFormField.update({
    where: { id: input.fieldId },
    data: { formTabId: input.formTabId ?? null, formSectionId: input.formSectionId ?? null },
  });
}

/** Create a field on a draft version (optionally with dropdown options). */
export async function createFormField(input: {
  formSetVersionId: string;
  fieldKey: string;
  label: string;
  fieldType: "text" | "datetime" | "dropdown" | "number" | "user_picker" | "file_upload";
  tab?: "contact_details" | "call_disposition";
  requiredLevel?: "none" | "soft" | "hard";
  sortOrder: number;
  formTabId?: string | null;
  formSectionId?: string | null;
  userPickerMode?: "single" | "multi" | null;
  userPickerScope?: "all_users" | "team" | "role" | null;
  /** "hidden" => the field is rule-driven (revealed by a show_field action). */
  defaultVisibility?: "visible" | "hidden";
  options?: { valueKey: string; label: string }[];
}): Promise<QcfFormField> {
  await assertDraft(input.formSetVersionId);
  const field = await prisma.qcfFormField.create({
    data: {
      formSetVersionId: input.formSetVersionId,
      tab: input.tab ?? "call_disposition",
      fieldKey: input.fieldKey,
      label: input.label,
      fieldType: input.fieldType,
      requiredLevel: input.requiredLevel ?? "soft",
      sortOrder: input.sortOrder,
      isProtected: false,
      formTabId: input.formTabId ?? null,
      formSectionId: input.formSectionId ?? null,
      userPickerMode: input.userPickerMode ?? null,
      userPickerScope: input.userPickerScope ?? null,
      defaultVisibility: input.defaultVisibility ?? "visible",
    },
  });
  if (input.options?.length) {
    await prisma.qcfFormFieldOption.createMany({
      data: input.options.map((o, i) => ({
        formFieldId: field.id,
        valueKey: o.valueKey,
        label: o.label,
        sortOrder: i,
      })),
    });
  }
  return field;
}

/** Resolve a field's version (and assert it is a draft) for any field edit. */
async function assertFieldDraft(fieldId: string): Promise<QcfFormField> {
  const field = await prisma.qcfFormField.findUnique({ where: { id: fieldId } });
  if (!field) throw new FormStructureError("Field not found", 404);
  await assertDraft(field.formSetVersionId);
  return field;
}

/** Update a field's editable attributes on its (draft) version. */
export async function updateFormField(input: {
  fieldId: string;
  label?: string;
  requiredLevel?: "none" | "soft" | "hard";
  sortOrder?: number;
  userPickerMode?: "single" | "multi" | null;
  userPickerScope?: "all_users" | "team" | "role" | null;
}): Promise<QcfFormField> {
  await assertFieldDraft(input.fieldId);
  return prisma.qcfFormField.update({
    where: { id: input.fieldId },
    data: {
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.requiredLevel !== undefined ? { requiredLevel: input.requiredLevel } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.userPickerMode !== undefined ? { userPickerMode: input.userPickerMode } : {}),
      ...(input.userPickerScope !== undefined ? { userPickerScope: input.userPickerScope } : {}),
    },
  });
}

/** Delete a non-protected field (and its options) from a draft version. */
export async function deleteFormField(fieldId: string): Promise<void> {
  const field = await assertFieldDraft(fieldId);
  if (field.isProtected) {
    throw new FormStructureError("Protected fields cannot be deleted.", 409);
  }
  await prisma.qcfFormFieldOption.deleteMany({ where: { formFieldId: fieldId } });
  await prisma.qcfFormField.delete({ where: { id: fieldId } });
}

export async function deleteFormTab(tabId: string): Promise<void> {
  const tab = await prisma.qcfFormTab.findUnique({
    where: { id: tabId },
    select: { isProtected: true },
  });
  if (!tab) throw new FormStructureError("Tab not found", 404);
  if (tab.isProtected) {
    throw new FormStructureError("The Call Disposition tab is protected and cannot be deleted.", 409);
  }
  await prisma.qcfFormTab.delete({ where: { id: tabId } });
}

/**
 * Seed the protected Call Disposition tab and its four protected fields into a
 * (draft) version. Called by whatever creates a new form-set version (a later
 * form-builder unit). D2: seeds the four fields here so the protected tab is
 * never left empty pending FR-FB-5.
 */
export async function seedProtectedDispositionTab(
  formSetVersionId: string,
  createdByUserId?: string | null,
): Promise<QcfFormTab> {
  const tab = await prisma.qcfFormTab.create({
    data: {
      formSetVersionId,
      name: PROTECTED_DISPOSITION_TAB_NAME,
      visibility: "always",
      sortOrder: 0,
      isProtected: true,
      createdByUserId: createdByUserId ?? null,
    },
  });

  for (let i = 0; i < PROTECTED_FIELDS.length; i++) {
    const f = PROTECTED_FIELDS[i]!;
    await prisma.qcfFormField.create({
      data: {
        formSetVersionId,
        tab: "call_disposition",
        formTabId: tab.id,
        fieldKey: f.fieldKey,
        label: f.label,
        fieldType: f.fieldType,
        isProtected: true,
        requiredLevel: f.requiredLevel,
        sortOrder: i,
        defaultVisibility: "visible",
      },
    });
  }

  return tab;
}
