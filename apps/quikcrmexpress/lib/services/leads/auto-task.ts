import type { QceLead, QceTaskPriority } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";

export type AutoTaskOverrides = {
  subject?: string;
  dueInDays?: number;
  priority?: QceTaskPriority;
};

const DEFAULT_DUE_IN_DAYS = 1;

function isEnabled(): boolean {
  const raw = process.env.AUTO_TASK_ON_LEAD_CREATE;
  if (raw === undefined) return false;
  return raw.toLowerCase() === "true";
}

export async function createDefaultTaskForLead(
  lead: QceLead,
  overrides: AutoTaskOverrides = {},
): Promise<void> {
  if (!isEnabled()) return;

  try {
    const dueInDays = overrides.dueInDays ?? DEFAULT_DUE_IN_DAYS;
    const dueDate = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);

    // QceLead has no `createdBy` column — only `ownerId`. When ownerId is
    // null the task is left unassigned (assignedToUserId = null).
    const assignedToUserId = lead.ownerId ?? null;

    await prisma.qceTask.create({
      data: {
        orgId: lead.orgId,
        subject: overrides.subject ?? `Follow-up with ${lead.name}`,
        taskType: "To-Do",
        priority: overrides.priority ?? "Medium",
        status: "Open",
        dueDate,
        assignedToUserId,
        relatedKind: "lead",
        relatedObjectId: lead.id,
        leadId: lead.id,
      },
    });
  } catch (err: unknown) {
    console.error("[auto-task] failed", err);
  }
}
