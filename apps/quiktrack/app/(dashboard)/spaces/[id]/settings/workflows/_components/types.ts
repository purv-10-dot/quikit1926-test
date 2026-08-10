/**
 * Client-side shapes for the Workflows settings UI, mirroring the config API
 * responses (see app/api/projects/[id]/workflow-scheme + app/api/workflows).
 */

export interface SchemeWorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  _count: { workflowStatuses: number; transitions: number };
}

export interface SchemeItem {
  id: string;
  isDefault: boolean;
  issueTypeId: string | null;
  issueType: { id: string; name: string } | null;
  workflow: SchemeWorkflowSummary;
}

export interface WorkflowScheme {
  id: string;
  name: string;
  hasDraft: boolean;
  items: SchemeItem[];
}

export interface ProjectIssueType {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

export interface WorkflowSchemeResponse {
  scheme: WorkflowScheme | null;
  issueTypes: ProjectIssueType[];
}

/** A row in the overview table: one workflow + the issue types assigned to it. */
export interface OverviewRow {
  workflow: SchemeWorkflowSummary;
  /** Issue-type names assigned to this workflow (incl. "All other" for default). */
  workTypes: string[];
  isDefault: boolean;
}

/** Build the overview rows (workflow → assigned work types) from a scheme. */
export function toOverviewRows(scheme: WorkflowScheme): OverviewRow[] {
  const byWorkflow = new Map<string, OverviewRow>();
  for (const item of scheme.items) {
    const existing = byWorkflow.get(item.workflow.id);
    const label = item.isDefault ? "All other types" : (item.issueType?.name ?? "—");
    if (existing) {
      existing.workTypes.push(label);
      existing.isDefault = existing.isDefault || item.isDefault;
    } else {
      byWorkflow.set(item.workflow.id, {
        workflow: item.workflow,
        workTypes: [label],
        isDefault: item.isDefault,
      });
    }
  }
  return [...byWorkflow.values()];
}
