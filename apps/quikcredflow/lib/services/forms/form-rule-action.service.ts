/**
 * FR-RE Unit 5 (FR-RE-A1..A7) — rule ACTION model & builder.
 *
 * Six action types over targetKind field/tab/stage:
 *   show_field / hide_field / make_mandatory / make_optional  -> targetKind=field
 *   show_tab                                                  -> targetKind=tab
 *   set_stage                                                 -> targetKind=stage
 *
 * Unit 5 STORES + VALIDATES actions only. Applying actions and resolving the
 * FR-RE-A7 "hidden-wins" precedence (when one rule shows and another hides the
 * same field) are Unit 6 — the model keeps show/hide as distinct rows so that
 * resolution is unambiguous.
 *
 * Validate-at-build (consistent with Unit 4's condition field references):
 *   - field actions  -> targetFieldKey must exist in the version.
 *   - show_tab       -> targetTabId must be a tab in the SAME version.
 *   - set_stage      -> target must be a configured Contact Stage (below).
 *
 * set_stage moves the lead's CONTACT STAGE (lead.stage). Its target
 * (setStatusId — a plain String reference, kept named for the schema column we
 * can't rename) must be a configured pipeline stage:
 *   getPipelineConfig(tenant).stages — the SAME source /api/leads/stages feeds
 *   the rule-builder picker, so a rule can never point at a stage the builder
 *   didn't offer. setSubStatusId is unused for set_stage (there is no sub-stage
 *   column; sub-status belongs to status, which set_stage no longer touches).
 */
import { prisma } from "@/lib/db/prisma";
import {
  FormRuleError,
  assertRuleDraft,
  assertFieldExists,
} from "@/lib/services/forms/form-rule.service";
import { getPipelineConfig } from "@/lib/services/workspace/pipeline-config";
import type {
  QcfFormRuleAction,
  QcfFormRuleActionType,
  QcfFormRuleTargetKind,
} from "@quikit/database";

export { FormRuleError };

export interface ActionInput {
  actionType: QcfFormRuleActionType;
  targetKind: QcfFormRuleTargetKind;
  targetFieldKey?: string | null;
  targetTabId?: string | null;
  setStatusId?: string | null;
  setSubStatusId?: string | null;
}

const FIELD_ACTIONS: QcfFormRuleActionType[] = [
  "show_field",
  "hide_field",
  "make_mandatory",
  "make_optional",
];

/**
 * Pure SHAPE validation (no DB): actionType <-> targetKind <-> which target
 * column is populated. Structural existence is checked in assertActionTargets.
 */
export function validateActionInput(input: ActionInput): void {
  const { actionType, targetKind } = input;

  if (targetKind === "section") {
    throw new FormRuleError(
      "Section targets are not supported (no targetSectionId in the model).",
      422,
    );
  }

  if (FIELD_ACTIONS.includes(actionType)) {
    if (targetKind !== "field") {
      throw new FormRuleError(`Action "${actionType}" requires targetKind=field.`, 422);
    }
    if (!input.targetFieldKey || !input.targetFieldKey.trim()) {
      throw new FormRuleError(`Action "${actionType}" requires a targetFieldKey.`, 422);
    }
    return;
  }

  if (actionType === "show_tab") {
    if (targetKind !== "tab") {
      throw new FormRuleError('Action "show_tab" requires targetKind=tab.', 422);
    }
    if (!input.targetTabId || !input.targetTabId.trim()) {
      throw new FormRuleError('Action "show_tab" requires a targetTabId.', 422);
    }
    return;
  }

  if (actionType === "set_stage") {
    if (targetKind !== "stage") {
      throw new FormRuleError('Action "set_stage" requires targetKind=stage.', 422);
    }
    if (!input.setStatusId || !input.setStatusId.trim()) {
      throw new FormRuleError('Action "set_stage" requires a setStatusId (Contact Stage target).', 422);
    }
    return;
  }

  throw new FormRuleError(`Unsupported action type "${actionType}".`, 422);
}

/** Resolve the tenant that owns a (draft) rule's version, via formSet. */
async function resolveTenantId(formSetVersionId: string): Promise<string> {
  const version = await prisma.qcfFormSetVersion.findUnique({
    where: { id: formSetVersionId },
    select: { formSet: { select: { orgId: true } } },
  });
  if (!version) throw new FormRuleError("Form set version not found.", 404);
  return version.formSet.orgId;
}

/**
 * set_stage's target is a CONTACT STAGE (lead.stage): it must be a configured
 * pipeline stage for the tenant. Validated against getPipelineConfig(tenant).stages
 * — the same source /api/leads/stages feeds the rule-builder picker, so a rule can
 * never be saved pointing at a stage the builder didn't offer.
 */
async function assertSetStageTarget(orgId: string, stageName: string): Promise<void> {
  const cfg = await getPipelineConfig(orgId);
  if (!cfg.stages.includes(stageName)) {
    throw new FormRuleError(
      `set_stage references Contact Stage "${stageName}" which is not a configured pipeline ` +
        `stage for this tenant. Add it under Settings > Pipeline stages first.`,
      422,
    );
  }
}

/** Validate-at-build existence for whichever target kind this action uses. */
async function assertActionTargets(
  formSetVersionId: string,
  input: ActionInput,
): Promise<void> {
  if (FIELD_ACTIONS.includes(input.actionType)) {
    await assertFieldExists(formSetVersionId, input.targetFieldKey!.trim());
    return;
  }
  if (input.actionType === "show_tab") {
    const tab = await prisma.qcfFormTab.findFirst({
      where: { id: input.targetTabId!.trim(), formSetVersionId },
      select: { id: true },
    });
    if (!tab) {
      throw new FormRuleError("show_tab references a tab that does not exist in this version.", 422);
    }
    return;
  }
  if (input.actionType === "set_stage") {
    const orgId = await resolveTenantId(formSetVersionId);
    await assertSetStageTarget(orgId, input.setStatusId!.trim());
  }
}

/** All actions of a rule, ordered. */
export async function getRuleActions(formRuleId: string) {
  return prisma.qcfFormRuleAction.findMany({
    where: { formRuleId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function addRuleAction(input: {
  formRuleId: string;
  actionType: QcfFormRuleActionType;
  targetKind: QcfFormRuleTargetKind;
  targetFieldKey?: string | null;
  targetTabId?: string | null;
  setStatusId?: string | null;
  setSubStatusId?: string | null;
  sortOrder: number;
}): Promise<QcfFormRuleAction> {
  validateActionInput(input);
  const versionId = await assertRuleDraft(input.formRuleId);
  await assertActionTargets(versionId, input);

  return prisma.qcfFormRuleAction.create({
    data: {
      formRuleId: input.formRuleId,
      actionType: input.actionType,
      targetKind: input.targetKind,
      targetFieldKey: FIELD_ACTIONS.includes(input.actionType)
        ? input.targetFieldKey!.trim()
        : null,
      targetTabId: input.actionType === "show_tab" ? input.targetTabId!.trim() : null,
      setStatusId: input.actionType === "set_stage" ? input.setStatusId!.trim() : null,
      setSubStatusId:
        input.actionType === "set_stage" && input.setSubStatusId?.trim()
          ? input.setSubStatusId.trim()
          : null,
      sortOrder: input.sortOrder,
    },
  });
}

export async function updateRuleAction(input: {
  actionId: string;
  actionType?: QcfFormRuleActionType;
  targetKind?: QcfFormRuleTargetKind;
  targetFieldKey?: string | null;
  targetTabId?: string | null;
  setStatusId?: string | null;
  setSubStatusId?: string | null;
  sortOrder?: number;
}): Promise<QcfFormRuleAction> {
  const existing = await prisma.qcfFormRuleAction.findUnique({
    where: { id: input.actionId },
    select: {
      formRuleId: true,
      actionType: true,
      targetKind: true,
      targetFieldKey: true,
      targetTabId: true,
      setStatusId: true,
      setSubStatusId: true,
    },
  });
  if (!existing) throw new FormRuleError("Action not found.", 404);
  const versionId = await assertRuleDraft(existing.formRuleId);

  // Validate the MERGED state, not the patch in isolation.
  const merged: ActionInput = {
    actionType: input.actionType ?? existing.actionType,
    targetKind: input.targetKind ?? existing.targetKind,
    targetFieldKey:
      input.targetFieldKey !== undefined ? input.targetFieldKey : existing.targetFieldKey,
    targetTabId: input.targetTabId !== undefined ? input.targetTabId : existing.targetTabId,
    setStatusId: input.setStatusId !== undefined ? input.setStatusId : existing.setStatusId,
    setSubStatusId:
      input.setSubStatusId !== undefined ? input.setSubStatusId : existing.setSubStatusId,
  };
  validateActionInput(merged);
  await assertActionTargets(versionId, merged);

  return prisma.qcfFormRuleAction.update({
    where: { id: input.actionId },
    data: {
      actionType: merged.actionType,
      targetKind: merged.targetKind,
      targetFieldKey: FIELD_ACTIONS.includes(merged.actionType)
        ? merged.targetFieldKey!.trim()
        : null,
      targetTabId: merged.actionType === "show_tab" ? merged.targetTabId!.trim() : null,
      setStatusId: merged.actionType === "set_stage" ? merged.setStatusId!.trim() : null,
      setSubStatusId:
        merged.actionType === "set_stage" && merged.setSubStatusId?.trim()
          ? merged.setSubStatusId.trim()
          : null,
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteRuleAction(actionId: string): Promise<void> {
  const existing = await prisma.qcfFormRuleAction.findUnique({
    where: { id: actionId },
    select: { formRuleId: true },
  });
  if (!existing) throw new FormRuleError("Action not found.", 404);
  await assertRuleDraft(existing.formRuleId);
  await prisma.qcfFormRuleAction.delete({ where: { id: actionId } });
}
