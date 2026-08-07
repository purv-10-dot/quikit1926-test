/**
 * Read/write the leadFieldDefinitions array stored on
 * OrgWorkspaceSettings.settings.leadFieldDefinitions.
 *
 * Why JSON-backed instead of a dedicated table:
 *   - Matches legacy MongoDB layout exactly (DO NOT redesign rule).
 *   - Definitions are tiny (<100 rows per org typically) and always read together.
 *   - Avoids a Prisma migration on this iteration.
 *
 * `key` is the natural identifier across endpoints — used as the URL :id segment.
 */

import { prisma } from "@/lib/db/prisma";
import {
  STANDARD_LEAD_FIELDS,
  STANDARD_KEYS,
  isValidFieldKey,
  type LeadFieldDefinition,
} from "@/types/field-definition";

const SETTINGS_PATH = "leadFieldDefinitions" as const;

interface SettingsTree {
  leadFieldDefinitions?: LeadFieldDefinition[];
  [k: string]: unknown;
}

async function readTree(tenantId: string): Promise<SettingsTree> {
  const row = await prisma.qcfOrgWorkspaceSettings.findUnique({ where: { tenantId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(tenantId: string, next: SettingsTree): Promise<void> {
  await prisma.qcfOrgWorkspaceSettings.upsert({
    where: { tenantId },
    create: { tenantId, settings: next as object },
    update: { settings: next as object },
  });
}

/** Returns the union of standard + custom fields, with custom fields appended after standards. */
export async function listLeadFields(tenantId: string): Promise<LeadFieldDefinition[]> {
  const tree = await readTree(tenantId);
  const custom = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as LeadFieldDefinition[]) : [];
  return [...STANDARD_LEAD_FIELDS, ...custom];
}

export async function listCustomFields(tenantId: string): Promise<LeadFieldDefinition[]> {
  const tree = await readTree(tenantId);
  return Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as LeadFieldDefinition[]) : [];
}

export async function getField(tenantId: string, key: string): Promise<LeadFieldDefinition | null> {
  const all = await listLeadFields(tenantId);
  return all.find((f) => f.key === key) ?? null;
}

export class FieldDefError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
  }
}

export async function createCustomField(tenantId: string, def: LeadFieldDefinition): Promise<LeadFieldDefinition> {
  if (!isValidFieldKey(def.key)) {
    throw new FieldDefError("Invalid field key. Use lowercase letters/digits/underscore, ≤41 chars, leading letter.");
  }
  if (STANDARD_KEYS.has(def.key)) {
    throw new FieldDefError(`"${def.key}" is reserved by a standard field.`);
  }
  const tree = await readTree(tenantId);
  const list = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as LeadFieldDefinition[]) : [];
  if (list.some((f) => f.key === def.key)) {
    throw new FieldDefError(`A field with key "${def.key}" already exists.`, 409);
  }
  const next: LeadFieldDefinition = { ...def, isStandard: false };
  await writeTree(tenantId, { ...tree, [SETTINGS_PATH]: [...list, next] });
  return next;
}

export async function updateCustomField(
  tenantId: string,
  key: string,
  patch: Partial<LeadFieldDefinition>,
): Promise<LeadFieldDefinition> {
  if (STANDARD_KEYS.has(key)) {
    // Standard fields can be partially updated (label/visible/showInList) but not retyped or rekeyed
    if (patch.key && patch.key !== key) {
      throw new FieldDefError("Cannot rename a standard field.");
    }
    if (patch.fieldType) {
      throw new FieldDefError("Cannot change the type of a standard field.");
    }
    // Standard updates are stored as overrides in a sibling map for now — but to keep this iteration small,
    // standard-field overrides are out of scope. Surface a clear error.
    throw new FieldDefError("Standard-field overrides not supported in this iteration. Use custom fields.", 422);
  }
  const tree = await readTree(tenantId);
  const list = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as LeadFieldDefinition[]) : [];
  const idx = list.findIndex((f) => f.key === key);
  if (idx === -1) throw new FieldDefError("Field not found.", 404);
  if (patch.key && patch.key !== key) {
    if (!isValidFieldKey(patch.key)) throw new FieldDefError("Invalid new field key.");
    if (STANDARD_KEYS.has(patch.key)) throw new FieldDefError(`"${patch.key}" is reserved.`);
    if (list.some((f) => f.key === patch.key)) throw new FieldDefError("Another field already uses that key.", 409);
  }
  const updated: LeadFieldDefinition = { ...list[idx]!, ...patch, isStandard: false };
  const nextList = [...list];
  nextList[idx] = updated;
  await writeTree(tenantId, { ...tree, [SETTINGS_PATH]: nextList });
  return updated;
}

export async function deleteCustomField(tenantId: string, key: string): Promise<void> {
  if (STANDARD_KEYS.has(key)) {
    throw new FieldDefError("Cannot delete a standard field.");
  }
  const tree = await readTree(tenantId);
  const list = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as LeadFieldDefinition[]) : [];
  const next = list.filter((f) => f.key !== key);
  if (next.length === list.length) throw new FieldDefError("Field not found.", 404);
  await writeTree(tenantId, { ...tree, [SETTINGS_PATH]: next });
}
