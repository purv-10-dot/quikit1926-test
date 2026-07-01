/**
 * Self-healing seed for the default activity types + their field definitions.
 *
 * Runs on every activity-types read (cheap: a couple of indexed lookups when
 * nothing is missing). It NEVER short-circuits on a global count — an org that
 * already has *some* types (e.g. admin-created "Linkedin"/"Upwork") must still
 * receive the 12 defaults it is missing. Backfill is keyed on the stable `code`
 * (types) and `key` (fields), so:
 *   • A default type whose code is absent → created.
 *   • A default type whose code exists → left untouched (including admin
 *     renames/reorders/deactivations — we match on code, never label).
 *   • A default type that exists but is missing some default fields → only the
 *     missing field definitions are created; existing fields are never modified.
 *   • Admin-created types (Linkedin, Upwork, …) and admin-added custom fields
 *     are never touched.
 *
 * Concurrency-safe: every write uses skipDuplicates against the relevant unique
 * index ((orgId, code) for types, (activityTypeId, key) for fields), so two
 * parallel requests can't create duplicates and a partial seed self-heals on
 * the next read.
 */
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_ACTIVITY_TYPES } from "@/lib/activities/activity-types-defaults";

export async function ensureDefaultActivityTypes(orgId: string): Promise<void> {
  // 1) Load every existing type for this org (code → id). No count gate.
  const existingTypes = await prisma.crmActivityType.findMany({
    where: { orgId },
    select: { id: true, code: true },
  });
  const idByCode = new Map(existingTypes.map((t) => [t.code, t.id]));

  // 2) Create only the default types whose code is absent. We assign sortOrder
  //    from the default's position, but only for NEW types — existing types keep
  //    whatever order the admin set.
  const missingTypes = DEFAULT_ACTIVITY_TYPES.map((t, index) => ({ t, index })).filter(
    ({ t }) => !idByCode.has(t.code),
  );
  if (missingTypes.length > 0) {
    await prisma.crmActivityType.createMany({
      data: missingTypes.map(({ t, index }) => ({
        orgId,
        code: t.code,
        label: t.label,
        category: t.category ?? null,
        sortOrder: index,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    // Re-resolve ids for the codes we just created so we can attach their fields.
    const created = await prisma.crmActivityType.findMany({
      where: { orgId, code: { in: missingTypes.map(({ t }) => t.code) } },
      select: { id: true, code: true },
    });
    for (const row of created) idByCode.set(row.code, row.id);
  }

  // 3) Backfill missing field definitions for every default type that has any.
  //    Compare against the keys that already exist on each type so admin-added
  //    fields are preserved and existing default fields are never overwritten.
  const typeIds = DEFAULT_ACTIVITY_TYPES.map((t) => idByCode.get(t.code)).filter(
    (id): id is string => Boolean(id),
  );

  const existingFields =
    typeIds.length > 0
      ? await prisma.crmActivityFieldDefinition.findMany({
          where: { orgId, activityTypeId: { in: typeIds } },
          select: { activityTypeId: true, key: true },
        })
      : [];

  // activityTypeId → Set<existing field key>
  const keysByTypeId = new Map<string, Set<string>>();
  for (const f of existingFields) {
    const set = keysByTypeId.get(f.activityTypeId) ?? new Set<string>();
    set.add(f.key);
    keysByTypeId.set(f.activityTypeId, set);
  }

  const fieldRows = DEFAULT_ACTIVITY_TYPES.flatMap((t) => {
    const activityTypeId = idByCode.get(t.code);
    if (!activityTypeId) return [];
    const existingKeys = keysByTypeId.get(activityTypeId) ?? new Set<string>();
    return t.fields
      .map((f, fieldIndex) => ({ f, fieldIndex }))
      .filter(({ f }) => !existingKeys.has(f.key)) // only the missing defaults
      .map(({ f, fieldIndex }) => ({
        orgId,
        activityTypeId,
        key: f.key,
        label: f.label,
        fieldType: f.fieldType,
        requirement: f.requirement,
        // options is a Json? column; string[] for Select/MultiSelect, NULL otherwise.
        options: f.options ?? undefined,
        visible: true,
        helpText: f.helpText ?? null,
        sortOrder: fieldIndex,
      }));
  });

  if (fieldRows.length > 0) {
    await prisma.crmActivityFieldDefinition.createMany({
      data: fieldRows,
      skipDuplicates: true,
    });
  }
}
