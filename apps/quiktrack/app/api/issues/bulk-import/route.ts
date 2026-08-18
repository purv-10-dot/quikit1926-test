import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { userCanInProject, forbidden } from "@/lib/api/permissions";
import { issuePriorityEnum, issueTypeEnum } from "@/lib/validation/issue";

const rowSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  assigneeEmail: z.string().optional(),
  storyPoints: z.union([z.number(), z.string()]).optional(),
  eta: z.union([z.number(), z.string()]).optional(),
  dueDate: z.string().optional(),
  description: z.string().max(50_000).optional(),
});

const bodySchema = z.object({
  projectId: z.string().min(1),
  rows: z.array(rowSchema).min(1).max(500),
});

interface RowError {
  row: number;
  field: string;
  message: string;
}

function toIntOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return null;
  return Math.trunc(n);
}

/**
 * Bulk-creates issues from a parsed CSV. All-or-nothing: if any row fails
 * validation we return the error list and create nothing. Issue keys are
 * generated sequentially from the project's current count.
 */
export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  // Body projectId may be a cuid OR a project KEY (readable URLs). Resolve
  // either to the real id, org-scoped; project.id is used downstream.
  const project = await db.qtProject.findFirst({
    where: {
      orgId,
      isDeleted: false,
      OR: [{ id: parsed.data.projectId }, { projectKey: parsed.data.projectId }],
    },
    select: { id: true, projectKey: true },
  });
  if (!project) {
    return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
  }

  // Importing creates issues — gate on Issue:create. This resolves the
  // project-scoped role first (so a Viewer, who has no create grant, is denied
  // even though they're a project member) and short-circuits app-admins.
  if (!(await userCanInProject(userId, orgId, project.id, "Issue", "create"))) {
    return forbidden("You don't have permission to import issues.");
  }

  // Resolve foreign references (status names, assignee emails) once per call
  // rather than per-row. Status match is case-insensitive on `name`; assignee
  // match is case-insensitive on `email` and limited to project members so we
  // don't accidentally assign to randoms in the tenant.
  const statuses = await db.qtIssueStatus.findMany({
    where: { projectId: project.id, isDeleted: false },
    select: { id: true, name: true },
  });
  const statusByName = new Map(statuses.map((s) => [s.name.toLowerCase(), s.id]));
  const defaultStatusId = statuses[0]?.id ?? null;

  const memberRows = await db.qtProjectMember.findMany({
    where: { projectId: project.id, isDeleted: false },
    select: { userId: true },
  });
  const memberUserIds = memberRows.map((m) => m.userId);
  const memberUsers = memberUserIds.length
    ? await db.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true, email: true },
      })
    : [];
  const userByEmail = new Map(memberUsers.map((u) => [u.email.toLowerCase(), u.id]));

  const errors: RowError[] = [];
  const validated: Array<{
    title: string;
    type: z.infer<typeof issueTypeEnum>;
    statusId: string;
    priority: z.infer<typeof issuePriorityEnum>;
    assigneeId: string | null;
    storyPoints: number | null;
    eta: number | null;
    dueDate: Date | null;
    description: string | null;
  }> = [];

  parsed.data.rows.forEach((raw, idx) => {
    const rowNum = idx + 1; // 1-based for user-facing messages

    const typeUpper = (raw.type ?? "TASK").toUpperCase();
    const typeParsed = issueTypeEnum.safeParse(typeUpper);
    if (!typeParsed.success) {
      errors.push({ row: rowNum, field: "type", message: `Unknown type "${raw.type}"` });
      return;
    }

    const priorityUpper = (raw.priority ?? "MEDIUM").toUpperCase();
    const priorityParsed = issuePriorityEnum.safeParse(priorityUpper);
    if (!priorityParsed.success) {
      errors.push({ row: rowNum, field: "priority", message: `Unknown priority "${raw.priority}"` });
      return;
    }

    let statusId: string;
    if (raw.status) {
      const found = statusByName.get(raw.status.trim().toLowerCase());
      if (!found) {
        errors.push({ row: rowNum, field: "status", message: `Unknown status "${raw.status}"` });
        return;
      }
      statusId = found;
    } else if (defaultStatusId) {
      statusId = defaultStatusId;
    } else {
      errors.push({ row: rowNum, field: "status", message: "Project has no statuses configured" });
      return;
    }

    let assigneeId: string | null = null;
    if (raw.assigneeEmail && raw.assigneeEmail.trim()) {
      const found = userByEmail.get(raw.assigneeEmail.trim().toLowerCase());
      if (!found) {
        errors.push({
          row: rowNum,
          field: "assigneeEmail",
          message: `"${raw.assigneeEmail}" is not a project member`,
        });
        return;
      }
      assigneeId = found;
    }

    let dueDate: Date | null = null;
    if (raw.dueDate && raw.dueDate.trim()) {
      const d = new Date(raw.dueDate);
      if (Number.isNaN(d.getTime())) {
        errors.push({ row: rowNum, field: "dueDate", message: `Invalid date "${raw.dueDate}"` });
        return;
      }
      dueDate = d;
    }

    validated.push({
      title: raw.title.trim(),
      type: typeParsed.data,
      statusId,
      priority: priorityParsed.data,
      assigneeId,
      storyPoints: toIntOrNull(raw.storyPoints),
      eta: toIntOrNull(raw.eta),
      dueDate,
      description: raw.description?.trim() || null,
    });
  });

  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors, created: 0 }, { status: 400 });
  }

  const created = await db.$transaction(async (tx) => {
    const startSeq = await tx.qtIssue.count({ where: { projectId: project.id } });
    const records = validated.map((r, i) => ({
      orgId: orgId,
      projectId: project.id,
      key: `${project.projectKey}-${startSeq + i + 1}`,
      title: r.title,
      type: r.type,
      statusId: r.statusId,
      priority: r.priority,
      assigneeId: r.assigneeId,
      reporterId: userId,
      storyPoints: r.storyPoints,
      eta: r.eta,
      dueDate: r.dueDate,
      description: r.description,
      createdBy: userId,
      updatedBy: userId,
    }));
    const out = await tx.qtIssue.createMany({ data: records });
    return out.count;
  });

  return NextResponse.json({ success: true, created, errors: [] });
});
