/**
 * Reusable workflow TEMPLATES (Jira "Save as new workflow" / "Add existing
 * workflow"). A template is a self-contained, NAME-BASED snapshot of a workflow
 * graph — it does NOT reference any project's QtIssueStatus ids, so it survives
 * even if the source project (or its statuses) change or are deleted.
 *
 * Stored as `QtWorkflow.templateJson` on an org-level workflow (projectId=null).
 * On import into a target project the statuses are materialized BY NAME
 * (create-or-reuse), then the nodes/transitions are recreated with the target
 * project's status ids.
 */
import type { Prisma } from "@prisma/client";
import type { TransitionType } from "./types";
import type { DraftRule } from "./draft";

/** A status node in a template, keyed by NAME (not id). */
export interface TemplateStatus {
  name: string;
  category: string;
  color?: string;
  isInitial: boolean;
}

/** A transition in a template, endpoints keyed by status NAME. */
export interface TemplateTransition {
  name: string;
  type: TransitionType;
  toName: string;
  fromNames: string[];
  rules?: DraftRule[];
}

/** The self-contained template graph persisted in QtWorkflow.templateJson. */
export interface WorkflowTemplate {
  description: string | null;
  statuses: TemplateStatus[];
  transitions: TemplateTransition[];
}

/** Minimal shape-guard for a templateJson read back from the DB. */
export function isWorkflowTemplate(v: unknown): v is WorkflowTemplate {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return Array.isArray(t.statuses) && Array.isArray(t.transitions);
}

/**
 * Build a name-based template snapshot from a live workflow's rows. Called when
 * saving a workflow as a reusable template. `statusNameById` maps the source
 * project's QtIssueStatus ids → { name, category, color }.
 */
export function buildTemplateFromRows(params: {
  description: string | null;
  workflowStatuses: Array<{ statusId: string; isInitial: boolean }>;
  transitions: Array<{
    name: string;
    type: TransitionType;
    toStatusId: string;
    fromStatusIds: string[];
    rules?: DraftRule[];
  }>;
  statusMeta: Map<string, { name: string; category: string; color: string }>;
}): WorkflowTemplate {
  const { description, workflowStatuses, transitions, statusMeta } = params;
  const statuses: TemplateStatus[] = workflowStatuses
    .map((n): TemplateStatus | null => {
      const m = statusMeta.get(n.statusId);
      if (!m) return null;
      return { name: m.name, category: m.category, color: m.color, isInitial: n.isInitial };
    })
    .filter((s): s is TemplateStatus => s !== null);

  const nameOf = (id: string) => statusMeta.get(id)?.name;
  const templateTransitions: TemplateTransition[] = transitions
    .map((t): TemplateTransition | null => {
      const toName = nameOf(t.toStatusId);
      if (!toName) return null;
      const fromNames = t.fromStatusIds
        .map((id) => nameOf(id))
        .filter((n): n is string => Boolean(n));
      return { name: t.name, type: t.type, toName, fromNames, rules: t.rules };
    })
    .filter((t): t is TemplateTransition => t !== null);

  return { description, statuses, transitions: templateTransitions };
}

/**
 * Materialize a template INTO a target project as a DRAFT on the project's
 * workflow scheme. Runs inside a transaction. Steps:
 *   1. Create-or-reuse the target project's statuses BY NAME.
 *   2. Create a new inactive QtWorkflow for the project + its status nodes and
 *      transitions using the LOCAL status ids.
 *   3. Point the scheme's default item (or the given issue types) at it and set
 *      hasDraft so the admin publishes (running the normal migration flow).
 *
 * Returns the created workflow id.
 */
export async function materializeTemplateIntoProject(
  tx: Prisma.TransactionClient,
  params: {
    template: WorkflowTemplate;
    projectId: string;
    orgId: string;
    workflowName: string;
    createdBy: string | null;
    /** Issue type ids to assign; empty → assign as the scheme's default. */
    issueTypeIds: string[];
  },
): Promise<string> {
  const { template, projectId, orgId, workflowName, createdBy, issueTypeIds } = params;

  // 1. Create-or-reuse statuses by name.
  const existing = await tx.qtIssueStatus.findMany({
    where: { projectId, isDeleted: false },
    select: { id: true, name: true, orderIndex: true },
  });
  const idByName = new Map(existing.map((s) => [s.name, s.id]));
  let nextOrder = existing.reduce((m, s) => Math.max(m, s.orderIndex), -1) + 1;
  for (const s of template.statuses) {
    if (idByName.has(s.name)) continue;
    const created = await tx.qtIssueStatus.create({
      data: {
        projectId,
        name: s.name,
        category: s.category,
        color: s.color ?? "#94a3b8",
        orderIndex: nextOrder++,
      },
      select: { id: true },
    });
    idByName.set(s.name, created.id);
  }

  // 2. New inactive workflow + nodes.
  const workflow = await tx.qtWorkflow.create({
    data: {
      orgId,
      projectId,
      name: workflowName,
      description: template.description,
      isActive: false,
      createdBy,
    },
    select: { id: true },
  });

  const initialName = template.statuses.find((s) => s.isInitial)?.name;
  await tx.qtWorkflowStatus.createMany({
    data: template.statuses
      .map((s) => {
        const id = idByName.get(s.name);
        if (!id) return null;
        return { workflowId: workflow.id, statusId: id, isInitial: s.name === initialName };
      })
      .filter((n): n is { workflowId: string; statusId: string; isInitial: boolean } => n !== null),
    skipDuplicates: true,
  });

  // 3. Transitions + from-joins + rules, using local ids.
  let initialTransitionId: string | null = null;
  for (const [i, t] of template.transitions.entries()) {
    const toId = idByName.get(t.toName);
    if (!toId) continue;
    const fromIds = t.fromNames
      .map((n) => idByName.get(n))
      .filter((id): id is string => Boolean(id));
    const created = await tx.qtWorkflowTransition.create({
      data: { workflowId: workflow.id, name: t.name, type: t.type, toStatusId: toId, orderIndex: i },
      select: { id: true },
    });
    if (fromIds.length > 0) {
      await tx.qtWorkflowTransitionFrom.createMany({
        data: fromIds.map((statusId) => ({ transitionId: created.id, statusId })),
        skipDuplicates: true,
      });
    }
    if (t.rules && t.rules.length > 0) {
      await tx.qtWorkflowRule.createMany({
        data: t.rules.map((r, ri) => ({
          transitionId: created.id,
          kind: r.kind,
          type: r.type,
          config: (r.config ?? {}) as object,
          errorMessage: r.errorMessage ?? null,
          groupNo: r.groupNo ?? 0,
          orderNo: r.orderNo ?? ri,
        })),
      });
    }
    if (t.type === "INITIAL") initialTransitionId = created.id;
  }
  if (initialTransitionId) {
    await tx.qtWorkflow.update({ where: { id: workflow.id }, data: { initialTransitionId } });
  }

  // 4. Scheme + items. Ensure a scheme exists; point the requested items at the
  //    new workflow and mark hasDraft so the admin publishes (migration flow).
  const scheme = await tx.qtWorkflowScheme.upsert({
    where: { projectId },
    update: {},
    create: { orgId, projectId, name: "Default Workflow Scheme" },
    select: { id: true },
  });

  if (issueTypeIds.length === 0) {
    // Assign as the scheme default (issueTypeId null).
    await tx.qtWorkflowSchemeItem.deleteMany({ where: { schemeId: scheme.id, issueTypeId: null } });
    await tx.qtWorkflowSchemeItem.create({
      data: { schemeId: scheme.id, issueTypeId: null, workflowId: workflow.id, isDefault: true },
    });
  } else {
    for (const issueTypeId of issueTypeIds) {
      await tx.qtWorkflowSchemeItem.deleteMany({ where: { schemeId: scheme.id, issueTypeId } });
      await tx.qtWorkflowSchemeItem.create({
        data: { schemeId: scheme.id, issueTypeId, workflowId: workflow.id, isDefault: false },
      });
    }
  }

  // Draft mirror so the overview shows "Publish this draft now?" and the publish
  // flow runs the normal status migration for existing items.
  const draftStatuses = template.statuses
    .map((s) => {
      const id = idByName.get(s.name);
      if (!id) return null;
      return { statusId: id, isInitial: s.name === initialName, x: null, y: null };
    })
    .filter((s): s is { statusId: string; isInitial: boolean; x: null; y: null } => s !== null);
  const draftTransitions = template.transitions.map((t) => ({
    id: `${t.name}`,
    name: t.name,
    type: t.type,
    toStatusId: idByName.get(t.toName) ?? "",
    fromStatusIds: t.fromNames.map((n) => idByName.get(n) ?? "").filter(Boolean),
    rules: t.rules ?? [],
  }));
  await tx.qtWorkflowScheme.update({
    where: { projectId },
    data: {
      hasDraft: true,
      draftJson: {
        workflowId: workflow.id,
        name: workflowName,
        description: template.description,
        statuses: draftStatuses,
        transitions: draftTransitions,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  return workflow.id;
}
