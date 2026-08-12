/**
 * FR-RE Unit 7 — versioning / clone-on-edit (Approach A: explicit clone).
 *
 * assertDraft (form-structure.service) stays the mutation invariant — Units
 * 2/4/5 are unchanged. This module adds the two explicit operations the admin UI
 * drives: cloneVersionToDraft (the "Edit a published form" action) and
 * publishVersion (go live). The published version is never mutated; editing it
 * means cloning to a fresh draft first.
 *
 * Clone-on-edit DEEP-COPIES the whole structure a version owns:
 *   tabs -> sections, fields -> options, rules -> conditions + actions, and
 *   mappingRules. It does NOT copy fieldValues / selectionLogs — those are
 *   record/history, pinned to the version they were logged against (immutable;
 *   structure changes apply forward only).
 *
 * Correctness core: clones are written PARENT-BEFORE-CHILD and every intra-
 * version reference is remapped to the new rows (section.formTabId,
 * field.formTabId/formSectionId, option.formFieldId, condition/action.formRuleId,
 * and action.targetTabId). A child created before its parent, or a ref left
 * pointing at the source, would corrupt the clone.
 */
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@quikit/database";
import type { QceFormSetVersion } from "@quikit/database";
import { FormStructureError } from "@/lib/services/forms/form-structure.service";

/** A version's structure can be large-ish; give the deep-copy room to commit. */
const CLONE_TX_TIMEOUT_MS = 20_000;

/** Copy a nullable Json column for a create (null -> SQL NULL). */
function copyJson(v: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  // v is already a stored JSON value; exclude null, then it is a valid input.
  return v == null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
}

/**
 * Deep-copy a version (any status) into a new DRAFT version of the same form set.
 * Returns the new draft. The source is left untouched.
 */
export async function cloneVersionToDraft(sourceVersionId: string): Promise<QceFormSetVersion> {
  const source = await prisma.qceFormSetVersion.findUnique({
    where: { id: sourceVersionId },
    select: { id: true, formSetId: true },
  });
  if (!source) throw new FormStructureError("Form set version not found", 404);

  return prisma.$transaction(
    async (tx) => {
      const agg = await tx.qceFormSetVersion.aggregate({
        where: { formSetId: source.formSetId },
        _max: { versionNumber: true },
      });
      const draft = await tx.qceFormSetVersion.create({
        data: {
          formSetId: source.formSetId,
          versionNumber: (agg._max.versionNumber ?? 0) + 1,
          status: "draft",
        },
      });

      // 1. tabs  (parent of sections + fields + target of actions)
      const tabMap = new Map<string, string>();
      const srcTabs = await tx.qceFormTab.findMany({
        where: { formSetVersionId: sourceVersionId },
        orderBy: { sortOrder: "asc" },
      });
      for (const t of srcTabs) {
        const nt = await tx.qceFormTab.create({
          data: {
            formSetVersionId: draft.id,
            name: t.name,
            sortOrder: t.sortOrder,
            visibility: t.visibility,
            isProtected: t.isProtected,
            createdByUserId: t.createdByUserId,
          },
        });
        tabMap.set(t.id, nt.id);
      }

      // 2. sections  (child of tab; parent of fields)
      const sectionMap = new Map<string, string>();
      const srcSections = await tx.qceFormSection.findMany({
        where: { tab: { formSetVersionId: sourceVersionId } },
        orderBy: { sortOrder: "asc" },
      });
      for (const s of srcSections) {
        const ns = await tx.qceFormSection.create({
          data: { formTabId: tabMap.get(s.formTabId)!, name: s.name, sortOrder: s.sortOrder },
        });
        sectionMap.set(s.id, ns.id);
      }

      // 3. fields  (refs tab + section; parent of options)
      const fieldMap = new Map<string, string>();
      const srcFields = await tx.qceFormField.findMany({
        where: { formSetVersionId: sourceVersionId },
        orderBy: { sortOrder: "asc" },
      });
      for (const f of srcFields) {
        const nf = await tx.qceFormField.create({
          data: {
            formSetVersionId: draft.id,
            tab: f.tab,
            fieldKey: f.fieldKey,
            label: f.label,
            fieldType: f.fieldType,
            isProtected: f.isProtected,
            requiredLevel: f.requiredLevel,
            sortOrder: f.sortOrder,
            isActive: f.isActive,
            formTabId: f.formTabId ? tabMap.get(f.formTabId) ?? null : null,
            formSectionId: f.formSectionId ? sectionMap.get(f.formSectionId) ?? null : null,
            userPickerMode: f.userPickerMode,
            userPickerScope: f.userPickerScope,
            defaultVisibility: f.defaultVisibility,
          },
        });
        fieldMap.set(f.id, nf.id);
      }

      // 4. options  (child of field)
      const srcOptions = await tx.qceFormFieldOption.findMany({
        where: { field: { formSetVersionId: sourceVersionId } },
        orderBy: { sortOrder: "asc" },
      });
      for (const o of srcOptions) {
        await tx.qceFormFieldOption.create({
          data: {
            formFieldId: fieldMap.get(o.formFieldId)!,
            valueKey: o.valueKey,
            label: o.label,
            sortOrder: o.sortOrder,
            isActive: o.isActive,
          },
        });
      }

      // 5. rules  (parent of conditions + actions)
      const ruleMap = new Map<string, string>();
      const srcRules = await tx.qceFormRule.findMany({
        where: { formSetVersionId: sourceVersionId },
        orderBy: { sortOrder: "asc" },
      });
      for (const r of srcRules) {
        const nr = await tx.qceFormRule.create({
          data: {
            formSetVersionId: draft.id,
            name: r.name,
            matchType: r.matchType,
            sortOrder: r.sortOrder,
            isActive: r.isActive,
            createdByUserId: r.createdByUserId,
          },
        });
        ruleMap.set(r.id, nr.id);
      }

      // 6. conditions  (child of rule)
      const srcConditions = await tx.qceFormRuleCondition.findMany({
        where: { rule: { formSetVersionId: sourceVersionId } },
        orderBy: { sortOrder: "asc" },
      });
      for (const c of srcConditions) {
        await tx.qceFormRuleCondition.create({
          data: {
            formRuleId: ruleMap.get(c.formRuleId)!,
            subjectKind: c.subjectKind,
            subjectFieldKey: c.subjectFieldKey,
            operator: c.operator,
            valueKeys: copyJson(c.valueKeys),
            sortOrder: c.sortOrder,
          },
        });
      }

      // 7. actions  (child of rule; targetTabId ref remapped to the new tab)
      const srcActions = await tx.qceFormRuleAction.findMany({
        where: { rule: { formSetVersionId: sourceVersionId } },
        orderBy: { sortOrder: "asc" },
      });
      for (const a of srcActions) {
        await tx.qceFormRuleAction.create({
          data: {
            formRuleId: ruleMap.get(a.formRuleId)!,
            actionType: a.actionType,
            targetKind: a.targetKind,
            targetFieldKey: a.targetFieldKey,
            targetTabId: a.targetTabId ? tabMap.get(a.targetTabId) ?? null : null,
            setStatusId: a.setStatusId,
            setSubStatusId: a.setSubStatusId,
            sortOrder: a.sortOrder,
          },
        });
      }

      // 8. mappingRules  (version-owned JSON rules)
      const srcMapping = await tx.qceFormSetMappingRule.findMany({
        where: { formSetVersionId: sourceVersionId },
        orderBy: { sortOrder: "asc" },
      });
      for (const m of srcMapping) {
        await tx.qceFormSetMappingRule.create({
          data: {
            formSetVersionId: draft.id,
            // trigger/action are NON-null Json columns; copy the stored value
            // verbatim (narrow JsonValue -> InputJsonValue, dropping the null arm).
            trigger: m.trigger as Prisma.InputJsonValue,
            action: m.action as Prisma.InputJsonValue,
            sortOrder: m.sortOrder,
            isActive: m.isActive,
          },
        });
      }

      // fieldValues + selectionLogs are intentionally NOT cloned (pinned history).
      return draft;
    },
    { timeout: CLONE_TX_TIMEOUT_MS },
  );
}

/**
 * Publish a DRAFT version: it becomes the form set's current (live) version and
 * the previously-current version is retired. Records pinned to the old version
 * are unaffected (structure changes apply forward only).
 */
export async function publishVersion(versionId: string): Promise<QceFormSetVersion> {
  return prisma.$transaction(async (tx) => {
    const version = await tx.qceFormSetVersion.findUnique({
      where: { id: versionId },
      select: { id: true, status: true, formSetId: true },
    });
    if (!version) throw new FormStructureError("Form set version not found", 404);
    if (version.status !== "draft") {
      throw new FormStructureError("Only a draft version can be published.", 409);
    }

    const set = await tx.qceFormSet.findUnique({
      where: { id: version.formSetId },
      select: { currentVersionId: true },
    });
    if (set?.currentVersionId && set.currentVersionId !== versionId) {
      await tx.qceFormSetVersion.update({
        where: { id: set.currentVersionId },
        data: { status: "retired" },
      });
    }

    const published = await tx.qceFormSetVersion.update({
      where: { id: versionId },
      data: { status: "published", publishedAt: new Date() },
    });
    await tx.qceFormSet.update({
      where: { id: version.formSetId },
      data: { currentVersionId: versionId },
    });
    return published;
  });
}
