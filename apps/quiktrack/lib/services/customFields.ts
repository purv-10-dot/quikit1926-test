import { db } from "@/lib/db";
import { fieldConfig, generateFieldKey, type FieldType } from "@/lib/customFields/registry";
import type { CreateCustomFieldInput, UpdateCustomFieldInput } from "@/lib/validation/customField";

/**
 * Custom field DEFINITION service (org-global + space-scoped).
 * Used by both /api/settings/custom-fields (scope=global) and
 * /api/projects/[id]/custom-fields (scope=space). Values live in a sibling
 * service (customFieldValues.ts).
 */

export type FieldScope = "global" | "space";

export interface CustomFieldDTO {
  id: string;
  orgId: string;
  scope: FieldScope;
  projectId: string | null;
  name: string;
  key: string;
  type: FieldType;
  description: string | null;
  status: "active" | "archived";
  isRequired: boolean;
  defaultValue: unknown;
  placeholder: string | null;
  helpText: string | null;
  position: number;
  options: { id: string; label: string; value: string; position: number; isActive: boolean }[];
  createdAt: string;
  updatedAt: string;
}

interface FieldRow {
  id: string;
  orgId: string;
  scope: string;
  projectId: string | null;
  name: string;
  key: string;
  type: string;
  description: string | null;
  status: string;
  isRequired: boolean;
  defaultValue: unknown;
  placeholder: string | null;
  helpText: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  options?: { id: string; label: string; value: string; position: number; isActive: boolean }[];
}

export function serializeField(row: FieldRow): CustomFieldDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    scope: row.scope as FieldScope,
    projectId: row.projectId,
    name: row.name,
    key: row.key,
    type: row.type as FieldType,
    description: row.description,
    status: row.status as "active" | "archived",
    isRequired: row.isRequired,
    defaultValue: row.defaultValue ?? null,
    placeholder: row.placeholder,
    helpText: row.helpText,
    position: row.position,
    options: (row.options ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, label: o.label, value: o.value, position: o.position, isActive: o.isActive })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Scope filter: global fields ignore projectId; space fields are scoped to one project. */
function scopeWhere(orgId: string, scope: FieldScope, projectId: string | null) {
  return scope === "global"
    ? { orgId, scope: "global", isDeleted: false }
    : { orgId, scope: "space", projectId: projectId ?? "", isDeleted: false };
}

export async function listFields(opts: {
  orgId: string;
  scope: FieldScope;
  projectId?: string | null;
  includeArchived?: boolean;
}): Promise<CustomFieldDTO[]> {
  const where = scopeWhere(opts.orgId, opts.scope, opts.projectId ?? null) as Record<string, unknown>;
  if (!opts.includeArchived) where.status = "active";
  const rows = await db.qtCustomField.findMany({
    where,
    include: { options: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(serializeField);
}

export async function getField(orgId: string, fieldId: string): Promise<CustomFieldDTO | null> {
  const row = await db.qtCustomField.findFirst({
    where: { id: fieldId, orgId, isDeleted: false },
    include: { options: true },
  });
  return row ? serializeField(row) : null;
}

/** Case-insensitive name uniqueness within a scope (FRD §5.1). Returns true if taken. */
async function nameTaken(
  orgId: string,
  scope: FieldScope,
  projectId: string | null,
  name: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await db.qtCustomField.findFirst({
    where: {
      ...(scopeWhere(orgId, scope, projectId) as Record<string, unknown>),
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

/** Generate a key unique within the scope, suffixing _2, _3… on collision. */
async function uniqueKey(orgId: string, scope: FieldScope, projectId: string | null, name: string): Promise<string> {
  const base = generateFieldKey(name);
  let key = base;
  let n = 2;
  // Globals: NULL projectId means DB unique([projectId,key]) won't catch dupes, so check explicitly.
  while (
    await db.qtCustomField.findFirst({
      where: { ...(scopeWhere(orgId, scope, projectId) as Record<string, unknown>), key },
      select: { id: true },
    })
  ) {
    key = `${base}_${n++}`;
  }
  return key;
}

async function writeAudit(
  orgId: string,
  fieldId: string | null,
  action: string,
  actorId: string | null,
  oldValue: unknown,
  newValue: unknown,
) {
  await db.qtCustomFieldAudit.create({
    data: { orgId, fieldId, action, actorId, oldValue: oldValue ?? undefined, newValue: newValue ?? undefined },
  });
}

export async function createField(opts: {
  orgId: string;
  scope: FieldScope;
  projectId: string | null;
  actorId: string;
  input: CreateCustomFieldInput;
}): Promise<{ ok: false; error: string } | { ok: true; field: CustomFieldDTO }> {
  const { orgId, scope, projectId, actorId, input } = opts;

  if (await nameTaken(orgId, scope, projectId, input.name)) {
    return {
      ok: false,
      error:
        scope === "global"
          ? "A global field with this name already exists."
          : "A field with this name already exists in this space.",
    };
  }

  const key = await uniqueKey(orgId, scope, projectId, input.name);
  const cfg = fieldConfig(input.type);

  const created = await db.$transaction(async (tx) => {
    const maxPos = await tx.qtCustomField.aggregate({
      where: scopeWhere(orgId, scope, projectId) as Record<string, unknown>,
      _max: { position: true },
    });
    const field = await tx.qtCustomField.create({
      data: {
        orgId,
        scope,
        projectId: scope === "space" ? projectId : null,
        name: input.name,
        key,
        type: input.type,
        description: input.description ?? null,
        isRequired: input.isRequired ?? false,
        defaultValue: (input.defaultValue ?? undefined) as never,
        placeholder: input.placeholder ?? null,
        helpText: input.helpText ?? null,
        position: (maxPos._max.position ?? -1) + 1,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    if (cfg.hasOptions && input.options?.length) {
      await tx.qtCustomFieldOption.createMany({
        data: input.options.map((o, i) => ({
          fieldId: field.id,
          label: o.label,
          value: generateFieldKey(o.label) || `option_${i + 1}`,
          position: i,
          isActive: o.isActive ?? true,
        })),
      });
    }
    return field;
  });

  await writeAudit(orgId, created.id, "created", actorId, null, { name: input.name, type: input.type, scope });
  const dto = await getField(orgId, created.id);
  return { ok: true, field: dto! };
}

export async function updateField(opts: {
  orgId: string;
  fieldId: string;
  actorId: string;
  input: UpdateCustomFieldInput;
}): Promise<{ ok: false; error: string; status?: number } | { ok: true; field: CustomFieldDTO }> {
  const { orgId, fieldId, actorId, input } = opts;
  const before = await db.qtCustomField.findFirst({
    where: { id: fieldId, orgId, isDeleted: false },
    include: { options: true },
  });
  if (!before) return { ok: false, error: "Field not found", status: 404 };

  if (input.name && input.name.toLowerCase() !== before.name.toLowerCase()) {
    if (await nameTaken(orgId, before.scope as FieldScope, before.projectId, input.name, fieldId)) {
      return { ok: false, error: "A field with this name already exists in this scope.", status: 409 };
    }
  }

  await db.$transaction(async (tx) => {
    await tx.qtCustomField.update({
      where: { id: fieldId },
      data: {
        name: input.name ?? undefined,
        description: input.description === undefined ? undefined : input.description,
        isRequired: input.isRequired ?? undefined,
        defaultValue: input.defaultValue === undefined ? undefined : ((input.defaultValue ?? null) as never),
        placeholder: input.placeholder === undefined ? undefined : input.placeholder,
        helpText: input.helpText === undefined ? undefined : input.helpText,
        position: input.position ?? undefined,
        status: input.status ?? undefined,
        updatedBy: actorId,
      },
    });

    // Reconcile dropdown options: add new (no id), rename/toggle existing (id present).
    if (input.options && fieldConfig(before.type).hasOptions) {
      const existingById = new Map(before.options.map((o) => [o.id, o]));
      let pos = 0;
      for (const opt of input.options) {
        if (opt.id && existingById.has(opt.id)) {
          await tx.qtCustomFieldOption.update({
            where: { id: opt.id },
            data: { label: opt.label, isActive: opt.isActive ?? true, position: pos },
          });
          existingById.delete(opt.id);
        } else {
          await tx.qtCustomFieldOption.create({
            data: {
              fieldId,
              label: opt.label,
              value: generateFieldKey(opt.label) || `option_${pos + 1}`,
              position: pos,
              isActive: opt.isActive ?? true,
            },
          });
        }
        pos++;
      }
      // Options omitted from the payload are deactivated (never hard-deleted —
      // historical values may reference them).
      for (const orphan of existingById.values()) {
        await tx.qtCustomFieldOption.update({ where: { id: orphan.id }, data: { isActive: false } });
      }
    }
  });

  const action = input.status === "archived" ? "archived" : input.status === "active" ? "restored" : "updated";
  await writeAudit(orgId, fieldId, action, actorId, { name: before.name }, { name: input.name ?? before.name });
  const dto = await getField(orgId, fieldId);
  return { ok: true, field: dto! };
}

/**
 * Delete (no stored values) or archive (has values) — FRD §5.5 / UC-05.
 *
 * - 0 values            → hard delete (cascade removes options); key freed.
 * - has values, no flag → returns { needsArchive, issueCount } so the UI can
 *                         show the "archive instead" warning before acting.
 * - has values + confirmArchive → archive (keeps historical values).
 */
export async function deleteOrArchiveField(opts: {
  orgId: string;
  fieldId: string;
  actorId: string;
  confirmArchive?: boolean;
}): Promise<
  | { ok: false; error: string; status?: number }
  | { ok: false; needsArchive: true; issueCount: number; status: 409 }
  | { ok: true; action: "deleted" | "archived"; issueCount: number }
> {
  const { orgId, fieldId, actorId, confirmArchive } = opts;
  const field = await db.qtCustomField.findFirst({
    where: { id: fieldId, orgId, isDeleted: false },
    select: { id: true, name: true },
  });
  if (!field) return { ok: false, error: "Field not found", status: 404 };

  const issueCount = await db.qtIssueFieldValue.count({ where: { fieldId, orgId } });

  if (issueCount > 0) {
    if (!confirmArchive) return { ok: false, needsArchive: true, issueCount, status: 409 };
    await db.qtCustomField.update({ where: { id: fieldId }, data: { status: "archived", updatedBy: actorId } });
    await writeAudit(orgId, fieldId, "archived", actorId, { name: field.name }, { issueCount });
    return { ok: true, action: "archived", issueCount };
  }

  // Hard delete — no values reference it; cascade removes its options.
  await db.qtCustomField.delete({ where: { id: fieldId } });
  await writeAudit(orgId, null, "deleted", actorId, { id: fieldId, name: field.name }, null);
  return { ok: true, action: "deleted", issueCount: 0 };
}
