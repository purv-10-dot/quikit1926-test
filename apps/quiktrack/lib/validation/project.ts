import { z } from "zod";
import { isProjectTabPath } from "@/lib/projectTabs";

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
  // Jira-style management style (label only today). Distinct from projectType,
  // which is the template kind. Defaults to "team-managed" when omitted.
  managementStyle: z.enum(["team-managed", "company-managed"]).optional(),
  // Which template the space is created from. Drives runtime behavior
  // (sprints vs Kanban-style Activity Board, renamable backlog). Defaults to
  // "scrum" when omitted. "discovery" provisions a Jira Product Discovery-style
  // space: Idea work items, a scoring field set, and the "All ideas" Table view.
  templateKey: z.enum(["scrum", "functional", "discovery"]).optional(),
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
  // Per-project tab customization (Space Admin only — the PATCH route is gated
  // on Project:update). Ordered array of enabled tab paths; null resets to "all
  // tabs". Must hold ≥1 known path and no duplicates so a project is never left
  // with an empty/garbage tab bar.
  tabConfig: z
    .array(z.string())
    .nullable()
    .optional()
    .refine(
      (v) =>
        v == null ||
        (v.length >= 1 &&
          new Set(v).size === v.length &&
          v.every((p) => isProjectTabPath(p))),
      "tabConfig must be a non-empty list of unique, known tab paths.",
    ),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
