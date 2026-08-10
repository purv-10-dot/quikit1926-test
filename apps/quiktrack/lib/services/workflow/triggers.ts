/**
 * Dev trigger catalog — the GitHub events QuikTrack actually receives (via the
 * first-party GitHub App webhook). A trigger on a transition auto-executes it
 * when its event fires on a linked work item that's in a source status.
 *
 * Crucible "Review *" triggers are intentionally omitted — QuikTrack has no
 * Crucible integration, so they could never fire.
 */
export type TriggerEvent =
  | "pr_created"
  | "pr_merged"
  | "pr_declined"
  | "pr_reopened"
  | "branch_created"
  | "commit_created";

export interface TriggerMeta {
  event: TriggerEvent;
  label: string;
  description: string;
  /** "pr" | "branch" | "commit" — the icon family. */
  family: "pr" | "branch" | "commit";
}

export const TRIGGER_CATALOG: TriggerMeta[] = [
  { event: "pr_created", label: "Pull request created", description: "Automatically transitions the work item when a related pull request is created in a connected repository.", family: "pr" },
  { event: "pr_merged", label: "Pull request merged", description: "Automatically transitions the work item when a related pull request is merged in a connected repository.", family: "pr" },
  { event: "pr_declined", label: "Pull request declined", description: "Automatically transitions the work item when a related pull request is declined in a connected repository.", family: "pr" },
  { event: "pr_reopened", label: "Pull request reopened", description: "Automatically transitions the work item when a related pull request is reopened in a connected repository.", family: "pr" },
  { event: "branch_created", label: "Branch created", description: "Automatically transitions the work item when a related branch is created in a connected repository.", family: "branch" },
  { event: "commit_created", label: "Commit created", description: "Automatically transitions the work item when a related commit is made in a connected repository.", family: "commit" },
];

const VALID = new Set<string>(TRIGGER_CATALOG.map((t) => t.event));
export function isTriggerEvent(s: string): s is TriggerEvent {
  return VALID.has(s);
}
export function triggerLabel(event: string): string {
  return TRIGGER_CATALOG.find((t) => t.event === event)?.label ?? event;
}
