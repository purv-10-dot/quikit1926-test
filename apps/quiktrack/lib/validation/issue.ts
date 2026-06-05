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
});

export const updateIssueSchema = createIssueSchema
  .partial()
  .omit({ projectId: true })
  .extend({
    statusId: z.string().min(1).optional(),
    sprintId: z.string().min(1).nullable().optional(),
    // Nullable so an issue can be unassigned from the details panel / subtask grid.
    assigneeId: z.string().min(1).nullable().optional(),
  });

export const moveIssueSchema = z.object({
  statusId: z.string().min(1).optional(),
  sprintId: z.string().min(1).nullable().optional(),
  parentId: z.string().min(1).nullable().optional(),
  orderInColumn: z.number().int().min(0).optional(),
});
