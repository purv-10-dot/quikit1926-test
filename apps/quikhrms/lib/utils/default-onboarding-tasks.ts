import type { Prisma } from "@quikit/database";

interface DefaultTaskSeed {
  title: string;
  description?: string;
  category: "Documentation" | "ItSetup" | "Training" | "Compliance" | "Introduction" | "TaskOther";
  assigneeRole: "ReportingManagerRole" | "HRRole" | "ITRole" | "FinanceRole" | "AdminRole" | "EmployeeRole" | "CustomRole";
  dueOffsetDays: number;
  sortOrder: number;
  isMandatory: boolean;
}

const DEFAULTS: DefaultTaskSeed[] = [
  { title: "Upload ID proof (PAN/Aadhaar)", category: "Documentation", assigneeRole: "EmployeeRole", dueOffsetDays: 2, sortOrder: 1, isMandatory: true, description: "Upload scanned copies of PAN card and Aadhaar card." },
  { title: "Sign offer letter",              category: "Documentation", assigneeRole: "EmployeeRole", dueOffsetDays: 3, sortOrder: 2, isMandatory: true, description: "Review and e-sign the offer letter." },
  { title: "Provision email + SSO",          category: "ItSetup",       assigneeRole: "ITRole",       dueOffsetDays: 1, sortOrder: 3, isMandatory: true, description: "Set up work email and SSO access." },
  { title: "Issue laptop",                    category: "ItSetup",       assigneeRole: "ITRole",       dueOffsetDays: 1, sortOrder: 4, isMandatory: true, description: "Hand over work laptop with standard software." },
  { title: "Orientation session",             category: "Introduction",  assigneeRole: "HRRole",       dueOffsetDays: 1, sortOrder: 5, isMandatory: true, description: "Attend company orientation and meet the team." },
];

/**
 * Seeds default onboarding tasks into an instance.
 * Uses prisma transaction client (or prisma directly).
 */
export async function seedDefaultOnboardingTasks(
  tx: Prisma.TransactionClient | { onboardingTask: { create: (args: unknown) => Promise<unknown> } },
  orgId: string,
  instanceId: string,
  startDate: Date,
): Promise<void> {
  for (const t of DEFAULTS) {
    const due = new Date(startDate);
    due.setDate(due.getDate() + t.dueOffsetDays);
    await tx.onboardingTask.create({
      data: {
        orgId,
        instanceId,
        title: t.title,
        description: t.description,
        category: t.category,
        assigneeRole: t.assigneeRole,
        dueDate: due,
        sortOrder: t.sortOrder,
        isMandatory: t.isMandatory,
      },
    });
  }
}
