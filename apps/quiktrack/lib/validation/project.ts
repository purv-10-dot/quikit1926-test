import { z } from "zod";

export const projectKeyRegex = /^[A-Z][A-Z0-9]{1,9}$/;

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  projectKey: z
    .string()
    .min(2)
    .max(10)
    .regex(projectKeyRegex, "Project key must be UPPERCASE letters/digits, start with letter"),
  description: z.string().max(2000).optional(),
  projectType: z.enum(["software", "discovery", "service"]).optional(),
  // Which template the space is created from. Drives runtime behavior
  // (sprints vs Kanban-style Activity Board, renamable backlog). Defaults to
  // "scrum" when omitted.
  templateKey: z.enum(["scrum", "functional"]).optional(),
  icon: z.string().max(50).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  leadUserId: z.string().min(1).optional(),
});

export const updateProjectSchema = createProjectSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
  // Custom backlog heading (functional spaces only). null/empty clears it back
  // to the default "Backlog" label.
  backlogName: z.string().max(120).nullable().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
