/**
 * FR-RE Unit 6b (FR-RE-5/6) — APPLY the decision (impure half).
 *
 * The three seams between the database and the pure engine (6a):
 *   1. loadEvalRules   — Prisma rule/condition/action rows -> EvalRule[].
 *   2. loadEvalContext — lead state + disposition field values -> EvalContext.
 *   3. applyFormRules  — evaluate once (6a), then apply: set_stage -> a single
 *      terminal crmLead.update (status/substatus, name-based per Decision A) +
 *      an audit entry; returns the FULL decision for the UI to render from.
 *
 * One-hop / no-re-trigger (reused from FR-D3, not reinvented): the engine runs
 * EXACTLY once per applyFormRules call, and the lead write is a plain terminal
 * update with no DB hook. applyFormRules never calls itself and is never invoked
 * by a lead write — only explicitly by the disposition-save path. So there is at
 * most one evaluation pass and one lead write end-to-end; no loop.
 */
import { prisma } from "@/lib/db/prisma";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import type { Prisma } from "@quikit/database";
import {
  evaluateFormRules,
  type EvalContext,
  type EvalRule,
  type RuleDecision,
} from "@/lib/services/forms/form-rule-evaluator";

/** Map a stored QcfFieldValue row to its EvalContext value, by valueType. */
function resolveFieldValue(row: {
  valueType: string;
  valueText: string | null;
  valueNumber: Prisma.Decimal | null;
  valueDatetime: Date | null;
  valueFileId: string | null;
  valueUserIds: string[];
}): string | string[] | null {
  switch (row.valueType) {
    case "user_picker":
      return row.valueUserIds;
    case "file_upload":
      return row.valueFileId;
    case "number":
      return row.valueNumber != null ? row.valueNumber.toString() : null;
    case "datetime":
      return row.valueDatetime != null ? row.valueDatetime.toISOString() : null;
    default: // text, dropdown
      return row.valueText;
  }
}

/** Adapter: a version's ACTIVE rules (conditions + actions) -> pure EvalRule[]. */
export async function loadEvalRules(formSetVersionId: string): Promise<EvalRule[]> {
  const rules = await prisma.qcfFormRule.findMany({
    where: { formSetVersionId, isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      conditions: { orderBy: { sortOrder: "asc" } },
      actions: { orderBy: { sortOrder: "asc" } },
    },
  });

  return rules.map((rule) => ({
    matchType: rule.matchType,
    isActive: rule.isActive,
    sortOrder: rule.sortOrder,
    conditions: rule.conditions.map((c) => ({
      subjectKind: c.subjectKind,
      subjectFieldKey: c.subjectFieldKey,
      operator: c.operator,
      valueKeys: Array.isArray(c.valueKeys) ? c.valueKeys.map((v) => String(v)) : null,
    })),
    actions: rule.actions.map((a) => ({
      actionType: a.actionType,
      targetFieldKey: a.targetFieldKey,
      targetTabId: a.targetTabId,
      setStatusId: a.setStatusId, // status NAME (Decision A)
      setSubStatusId: a.setSubStatusId,
      sortOrder: a.sortOrder,
    })),
  }));
}

/** Load the lead's stage/status/sub_stage + disposition field values as EvalContext. */
export async function loadEvalContext(
  leadId: string,
  activityId: string | null,
): Promise<EvalContext> {
  const lead = await prisma.qcfLead.findUnique({
    where: { id: leadId },
    select: { stage: true, status: true, substatus: true },
  });

  const fieldValues: EvalContext["fieldValues"] = {};
  if (activityId) {
    const rows = await prisma.qcfFieldValue.findMany({
      where: { activityId },
      select: {
        fieldKey: true,
        valueType: true,
        valueText: true,
        valueNumber: true,
        valueDatetime: true,
        valueFileId: true,
        valueUserIds: true,
      },
    });
    for (const row of rows) {
      fieldValues[row.fieldKey] = resolveFieldValue(row);
    }
  }

  return {
    fieldValues,
    stage: lead?.stage ?? null,
    status: lead?.status ?? null,
    subStage: lead?.substatus ?? null,
  };
}

export interface ApplyResult {
  decision: RuleDecision;
  stageApplied: boolean;
  /** The lead's Contact Stage (lead.stage) BEFORE this apply — for a from→to
   *  audit/timeline entry at the call site. */
  previousStage: string | null;
}

/**
 * Evaluate a version's rules against a lead's context and apply the decision.
 * Only the set_stage decision mutates state (a single terminal crmLead.update);
 * fieldVisibility/fieldRequirement/tabsToShow are returned for the UI to render.
 *
 * set_stage moves the lead's CONTACT STAGE (lead.stage) — the value the rule
 * builder's "Set Contact Stage to…" picks from the configured pipeline stages.
 * (The action column is still named setStatusId in the schema — a plain String
 * reference we can't rename, packages/ is integration-team owned — but it now
 * carries a STAGE name; see form-rule-action.service.ts validation.)
 */
export async function applyFormRules(input: {
  tenantId: string;
  leadId: string;
  activityId: string | null;
  formSetVersionId: string;
}): Promise<ApplyResult> {
  const [context, rules] = await Promise.all([
    loadEvalContext(input.leadId, input.activityId),
    loadEvalRules(input.formSetVersionId),
  ]);

  // Single evaluation pass (6a). The decision never re-enters the engine.
  const decision = evaluateFormRules(context, rules);

  const previousStage = context.stage ?? null;
  let stageApplied = false;
  if (decision.setStage) {
    const prevStage = previousStage;
    // decision.setStage.status carries the target STAGE name (see note above).
    const newStage = decision.setStage.status;

    // [pipeline-ownership] FR-RE no longer WRITES the Contact Stage. The
    // workflow-automation engine (R1–R21) is now the single owner of
    // stage/status/substatus transitions on a disposition save: the disposition
    // writes the raw status+substatus the agent selected, emits onLeadUpdated,
    // and automation decides the resulting stage. FR-RE keeps everything else —
    // it still EVALUATES rules and returns the full `decision` (so the UI hint
    // "rule will set Contact Stage → X", field visibility, mandatory flags, and
    // tab reveals all keep working), and disposition field VALUES are still
    // persisted (saveDispositionFieldValues, a separate step). Only the lead
    // stage MUTATION is retired here, to remove the multi-engine stage conflict
    // documented in docs/fr-re-followups.md (the Option C end-state).
    //
    // Set FRRE_APPLY_STAGE=1 to restore the legacy behaviour (FR-RE writes the
    // stage) — kept as an escape hatch, off by default.
    if (process.env.FRRE_APPLY_STAGE === "1") {
      // The ONLY mutation — a plain terminal update (no hook -> no re-trigger).
      await prisma.qcfLead.update({
        where: { id: input.leadId, tenantId: input.tenantId },
        data: { stage: newStage },
      });
      // Outbound sync (stage changed). Fire-and-forget.
      triggerOutboundSync({ tenantId: input.tenantId, crmLeadId: input.leadId });

      // Traceability (FR-D5 discipline). Generic actor — 6a stays sealed, so the
      // source rule id is not threaded; add it later only if an audit view needs it.
      await prisma.qcfAuditLog.create({
        data: {
          tenantId: input.tenantId,
          userId: null,
          module: "leads",
          action: "stage_changed",
          resourceId: input.leadId,
          before: { stage: prevStage } as Prisma.InputJsonValue,
          after: { stage: newStage } as Prisma.InputJsonValue,
          metadata: {
            actor: "form-rule",
            activityId: input.activityId,
            formSetVersionId: input.formSetVersionId,
            field: "stage",
          } as Prisma.InputJsonValue,
        },
      });

      stageApplied = true;
    }
  }

  return { decision, stageApplied, previousStage };
}
