import { prisma } from "@/lib/db/prisma";
import {
  STANDARD_PRODUCT_FIELDS,
  STANDARD_PRODUCT_KEYS,
  isValidProductFieldKey,
  type ProductFieldDefinition,
} from "@/types/product-field-definition";

const SETTINGS_PATH = "productFieldDefinitions" as const;

interface SettingsTree {
  productFieldDefinitions?: ProductFieldDefinition[];
  [k: string]: unknown;
}

async function readTree(tenantId: string): Promise<SettingsTree> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { tenantId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(tenantId: string, next: SettingsTree): Promise<void> {
  await prisma.crmOrgWorkspaceSettings.upsert({
    where: { tenantId },
    create: { tenantId, settings: next as object },
    update: { settings: next as object },
  });
}

export async function listProductFields(tenantId: string): Promise<ProductFieldDefinition[]> {
  const tree = await readTree(tenantId);
  const custom = Array.isArray(tree[SETTINGS_PATH])
    ? (tree[SETTINGS_PATH] as ProductFieldDefinition[])
    : [];
  return [...STANDARD_PRODUCT_FIELDS, ...custom];
}

export class ProductFieldDefError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400,
  ) {
    super(message);
  }
}

export async function createCustomProductField(
  tenantId: string,
  def: ProductFieldDefinition,
): Promise<ProductFieldDefinition> {
  if (!isValidProductFieldKey(def.key)) {
    throw new ProductFieldDefError("Invalid field key.");
  }
  if (STANDARD_PRODUCT_KEYS.has(def.key)) {
    throw new ProductFieldDefError(`"${def.key}" is reserved.`);
  }
  const tree = await readTree(tenantId);
  const list = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as ProductFieldDefinition[]) : [];
  if (list.some((f) => f.key === def.key)) {
    throw new ProductFieldDefError(`Field "${def.key}" already exists.`, 409);
  }
  const next = { ...def, isStandard: false };
  await writeTree(tenantId, { ...tree, [SETTINGS_PATH]: [...list, next] });
  return next;
}

export async function updateCustomProductField(
  tenantId: string,
  key: string,
  patch: Partial<ProductFieldDefinition>,
): Promise<ProductFieldDefinition> {
  if (STANDARD_PRODUCT_KEYS.has(key)) {
    throw new ProductFieldDefError("Standard product fields cannot be edited here.", 422);
  }
  const tree = await readTree(tenantId);
  const list = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as ProductFieldDefinition[]) : [];
  const idx = list.findIndex((f) => f.key === key);
  if (idx === -1) throw new ProductFieldDefError("Field not found.", 404);
  const updated = { ...list[idx]!, ...patch, isStandard: false };
  const nextList = [...list];
  nextList[idx] = updated;
  await writeTree(tenantId, { ...tree, [SETTINGS_PATH]: nextList });
  return updated;
}

export async function deleteCustomProductField(tenantId: string, key: string): Promise<void> {
  if (STANDARD_PRODUCT_KEYS.has(key)) {
    throw new ProductFieldDefError("Cannot delete a standard field.");
  }
  const tree = await readTree(tenantId);
  const list = Array.isArray(tree[SETTINGS_PATH]) ? (tree[SETTINGS_PATH] as ProductFieldDefinition[]) : [];
  const next = list.filter((f) => f.key !== key);
  if (next.length === list.length) throw new ProductFieldDefError("Field not found.", 404);
  await writeTree(tenantId, { ...tree, [SETTINGS_PATH]: next });
}
