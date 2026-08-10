/**
 * Screen CRUD service — org-level Screens (an ordered arrangement of fields
 * shown on a workflow transition). DB-touching; every query is scoped by orgId.
 */
import { db } from "@/lib/db";
import { isScreenField, DEFAULT_SCREEN_FIELD_KEYS } from "./field-registry";

export interface ScreenTabInput {
  name: string;
  fieldKeys: string[];
}

/** A screen with its tabs + fields, tabs and fields in order. */
export async function getScreen(orgId: string, id: string) {
  const screen = await db.qtScreen.findFirst({
    where: { id, orgId, isDeleted: false },
    select: {
      id: true, name: true, description: true, isDefault: true,
      tabs: {
        orderBy: { orderNo: "asc" },
        select: {
          id: true, name: true, orderNo: true,
          fields: { orderBy: { orderNo: "asc" }, select: { fieldKey: true } },
        },
      },
    },
  });
  if (!screen) return null;
  return {
    ...screen,
    tabs: screen.tabs.map((t) => ({ id: t.id, name: t.name, fieldKeys: t.fields.map((f) => f.fieldKey) })),
  };
}

/** Screens list with usage counts (workflow "Show a screen" rules referencing each). */
export async function listScreens(orgId: string) {
  const screens = await db.qtScreen.findMany({
    where: { orgId, isDeleted: false },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, description: true, isDefault: true, updatedAt: true },
  });
  return screens;
}

/** Create a screen with a single "Field Tab" holding the given fields (or none). */
export async function createScreen(
  orgId: string,
  userId: string,
  input: { name: string; description?: string; fieldKeys?: string[] },
) {
  const keys = (input.fieldKeys ?? []).filter(isScreenField);
  return db.qtScreen.create({
    data: {
      orgId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      createdBy: userId,
      updatedBy: userId,
      tabs: {
        create: [{
          name: "Field Tab",
          orderNo: 0,
          fields: { create: keys.map((k, i) => ({ fieldKey: k, orderNo: i })) },
        }],
      },
    },
    select: { id: true },
  });
}

/** Rename / re-describe a screen. */
export async function updateScreenMeta(
  orgId: string,
  userId: string,
  id: string,
  patch: { name?: string; description?: string | null },
) {
  const existing = await db.qtScreen.findFirst({ where: { id, orgId, isDeleted: false }, select: { id: true } });
  if (!existing) return null;
  return db.qtScreen.update({
    where: { id },
    data: {
      ...(patch.name != null ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      updatedBy: userId,
    },
    select: { id: true },
  });
}

/** Replace a screen's whole tab/field structure (the Configure page save). */
export async function replaceScreenConfig(
  orgId: string,
  userId: string,
  id: string,
  tabs: ScreenTabInput[],
) {
  const existing = await db.qtScreen.findFirst({ where: { id, orgId, isDeleted: false }, select: { id: true } });
  if (!existing) return null;
  const cleanTabs = tabs.map((t) => ({
    name: t.name.trim() || "Field Tab",
    fieldKeys: t.fieldKeys.filter(isScreenField),
  }));
  await db.$transaction(async (tx) => {
    await tx.qtScreenTab.deleteMany({ where: { screenId: id } }); // cascade drops fields
    for (let i = 0; i < cleanTabs.length; i++) {
      const t = cleanTabs[i];
      // Dedup fieldKeys within a tab (unique [tabId, fieldKey]).
      const seen = new Set<string>();
      const keys = t.fieldKeys.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
      await tx.qtScreenTab.create({
        data: {
          screenId: id,
          name: t.name,
          orderNo: i,
          fields: { create: keys.map((k, j) => ({ fieldKey: k, orderNo: j })) },
        },
      });
    }
    await tx.qtScreen.update({ where: { id }, data: { updatedBy: userId } });
  });
  return { id };
}

/** Duplicate a screen (name + " (copy)"), including tabs/fields. */
export async function copyScreen(orgId: string, userId: string, id: string) {
  const src = await getScreen(orgId, id);
  if (!src) return null;
  // Find a free name.
  let name = `${src.name} (copy)`;
  for (let n = 2; await db.qtScreen.findFirst({ where: { orgId, name, isDeleted: false }, select: { id: true } }); n++) {
    name = `${src.name} (copy ${n})`;
  }
  return db.qtScreen.create({
    data: {
      orgId,
      name,
      description: src.description,
      createdBy: userId,
      updatedBy: userId,
      tabs: {
        create: src.tabs.map((t, i) => ({
          name: t.name,
          orderNo: i,
          fields: { create: t.fieldKeys.map((k, j) => ({ fieldKey: k, orderNo: j })) },
        })),
      },
    },
    select: { id: true },
  });
}

/** Soft-delete a screen. The seeded Default Screen cannot be deleted. */
export async function deleteScreen(orgId: string, id: string): Promise<"ok" | "not_found" | "is_default"> {
  const screen = await db.qtScreen.findFirst({ where: { id, orgId, isDeleted: false }, select: { isDefault: true } });
  if (!screen) return "not_found";
  if (screen.isDefault) return "is_default";
  await db.qtScreen.update({ where: { id }, data: { isDeleted: true } });
  return "ok";
}

/** Ensure the org has a seeded "Default Screen" (all system fields). Idempotent. */
export async function ensureDefaultScreen(orgId: string) {
  const existing = await db.qtScreen.findFirst({
    where: { orgId, isDefault: true, isDeleted: false },
    select: { id: true },
  });
  if (existing) return existing;
  return db.qtScreen.create({
    data: {
      orgId,
      name: "Default Screen",
      description: "Allows to update all system fields.",
      isDefault: true,
      tabs: {
        create: [{
          name: "Field Tab",
          orderNo: 0,
          fields: { create: DEFAULT_SCREEN_FIELD_KEYS.map((k, i) => ({ fieldKey: k, orderNo: i })) },
        }],
      },
    },
    select: { id: true },
  });
}
