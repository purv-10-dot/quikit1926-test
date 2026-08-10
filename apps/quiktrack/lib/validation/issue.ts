import { z } from "zod";

export const issueTypeEnum = z.enum(["EPIC", "TASK", "STORY", "BUG", "SUBTASK"]);
export const issuePriorityEnum = z.enum(["LOWEST", "LOW", "MEDIUM", "HIGH", "HIGHEST"]);

export const createIssueSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(255),
  description: z.string().max(50_000).optional(),
  type: issueTypeEnum.default("TASK"),
  statusId: z.string().min(1).optional(),
  priority: issuePriorityEnum.default("MEDIUM"),
  parentId: z.string().min(1).optional(),
  epicId: z.string().min(1).optional(),
  sprintId: z.string().min(1).optional(),
  assigneeId: z.string().min(1).optional(),
  startDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  eta: z.number().min(0).max(10_000).optional(),
  storyPoints: z.number().int().min(0).max(1000).optional(),
  // Custom field values keyed by fieldId. Validated server-side against the
  // field definitions (see customFieldValues.ts) — shape is type-dependent.
  customFields: z.record(z.unknown()).optional(),
});

export const updateIssueSchema = createIssueSchema
  .partial()
  .omit({ projectId: true })
  .extend({
    statusId: z.string().min(1).optional(),
    sprintId: z.string().min(1).nullable().optional(),
    // Nullable so an issue can be unassigned from the details panel / subtask grid.
    assigneeId: z.string().min(1).nullable().optional(),
    // Nullable so a work item can be removed from its epic / detached from its
    // parent (the "Remove from epic" / "Detach parent" actions send null).
    epicId: z.string().min(1).nullable().optional(),
    parentId: z.string().min(1).nullable().optional(),
    // Nullable so the start/due date can be cleared from the details panel.
    startDate: z.string().datetime().nullable().optional(),
    dueDate: z.string().datetime().nullable().optional(),
    // Nullable so the story-point estimate / ETA can be cleared (badge emptied).
    storyPoints: z.number().int().min(0).max(1000).nullable().optional(),
    eta: z.number().min(0).max(10_000).nullable().optional(),
    customFields: z.record(z.unknown()).optional(),
    // Optimistic-lock guard for a status change (not a persisted column) — the
    // status the client believed the issue was on. Stale → 409. See move route.
    expectedStatusId: z.string().min(1).optional(),
  });

export const moveIssueSchema = z.object({
  statusId: z.string().min(1).optional(),
  sprintId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  orderInColumn: z.number().int().min(0).optional(),
  /**
   * Optimistic-lock guard: the status the client believed the issue was on when
   * it initiated the move. If it no longer matches, the move is stale → 409.
   * Optional for backward compatibility (older clients omit it).
   */
  expectedStatusId: z.string().min(1).optional(),
  /**
   * Field values submitted from a workflow "Show a screen" (Request input) rule.
   * Consumed by the transition-screen gate + post-functions. Keyed by screen
   * field key (e.g. "summary", "description", or a custom "cf:<key>").
   */
  inputs: z.record(z.unknown()).optional(),
});
