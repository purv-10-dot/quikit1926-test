import { prisma } from "@/lib/prisma";
import { generateEmployeeCode } from "@/lib/utils/employee-code";
import { addDays } from "@/lib/services/boarding";
import type { BulkOnboardingRow } from "@/lib/validations/boarding";
import type { SourceOfHire } from "@quikit/database";

export interface BulkImportResult {
  success: number;
  failed: number;
  errors: { row: number; error: string }[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SOURCE_MAP: Record<string, SourceOfHire> = {
  referral: "Referral", referred: "Referral",
  jobportal: "JobPortal", "job portal": "JobPortal", portal: "JobPortal", naukri: "JobPortal", indeed: "JobPortal",
  linkedin: "LinkedIn",
  agency: "Agency", consultant: "Agency",
  campus: "Campus", college: "Campus",
  direct: "Direct",
  other: "Other",
};
function toSource(raw?: string): SourceOfHire | null {
  if (!raw) return null;
  return SOURCE_MAP[raw.trim().toLowerCase()] ?? "Other";
}

function toInt(raw?: string): number | undefined {
  if (!raw) return undefined;
  const n = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : undefined;
}

// Default onboarding tasks (mirrors the single Add-Candidate flow's fallback set).
const DEFAULT_TASKS = [
  { title: "Upload ID proof (PAN/Aadhaar)", assigneeRole: "EmployeeRole", dueInDays: 2, category: "Documentation", isMandatory: true, sortOrder: 1 },
  { title: "Sign offer letter", assigneeRole: "EmployeeRole", dueInDays: 3, category: "Documentation", isMandatory: true, sortOrder: 2 },
  { title: "Provision email + SSO", assigneeRole: "ITRole", dueInDays: 1, category: "ItSetup", isMandatory: true, sortOrder: 3 },
  { title: "Issue laptop", assigneeRole: "ITRole", dueInDays: 1, category: "ItSetup", isMandatory: true, sortOrder: 4 },
  { title: "Orientation session", assigneeRole: "HRRole", dueInDays: 1, category: "Introduction", isMandatory: true, sortOrder: 5 },
] as const;

/**
 * Bulk-create onboarding candidates (PreBoarding employees) from flat rows.
 * Skips duplicate work emails. Each created candidate also gets a default
 * onboarding instance so it appears "InProgress" and is actionable. Role,
 * reporting manager, salary template & CTC are NOT set here (completed manually).
 */
export async function processBulkOnboardingCandidates(
  orgId: string,
  userId: string,
  rows: BulkOnboardingRow[],
  dryRun: boolean,
): Promise<BulkImportResult> {
  const result: BulkImportResult = { success: 0, failed: 0, errors: [] };
  const seen = new Set<string>();

  // Cache department name → id lookups for this org.
  const depts = await prisma.department.findMany({
    where: { orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  const deptByName = new Map(depts.map((d) => [d.name.trim().toLowerCase(), d.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    try {
      const email = row.workEmail.trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new Error(`Invalid official email: "${row.workEmail}"`);
      if (seen.has(email)) throw new Error(`Duplicate official email within the file: ${email}`);
      seen.add(email);

      const dupe = await prisma.employee.findFirst({
        where: { orgId, workEmail: email, deletedAt: null },
        select: { id: true },
      });
      if (dupe) throw new Error("An employee/candidate with this official email already exists. Skipped.");

      if (!dryRun) {
        const employeeCode = await generateEmployeeCode(orgId);
        const startDate = row.dateOfJoining ? new Date(row.dateOfJoining) : new Date();
        const departmentId = row.departmentName ? deptByName.get(row.departmentName.trim().toLowerCase()) ?? null : null;

        // Atomic: employee + onboarding instance are created together so a
        // failure creating the instance never leaves an orphaned employee.
        await prisma.$transaction(async (tx) => {
        const employee = await tx.employee.create({
          data: {
            orgId,
            employeeCode,
            firstName: row.firstName.trim(),
            lastName: row.lastName.trim(),
            workEmail: email,
            personalEmail: row.personalEmail?.trim() || null,
            personalPhone: row.personalPhone?.trim() || null,
            departmentId,
            jobTitle: row.jobTitle?.trim() || null,
            sourceOfHire: toSource(row.sourceOfHire),
            dateOfJoining: startDate,
            panNumber: row.panNumber?.trim().toUpperCase() || null,
            aadhaarNumber: row.aadhaarNumber?.trim() || null,
            uanNumber: row.uanNumber?.trim() || null,
            previousExperience: toInt(row.previousExperienceMonths) ?? 0,
            highestQualification: row.highestQualification?.trim() || null,
            skillSet: row.skillSet?.trim() || null,
            status: "PreBoarding",
            inviteStatus: "NotInvited",
            createdBy: userId,
            updatedBy: userId,
          },
        });

        const instance = await tx.onboardingInstance.create({
          data: {
            orgId,
            employeeId: employee.id,
            startDate,
            status: "InProgress",
            createdBy: userId,
            updatedBy: userId,
            tasks: {
              create: DEFAULT_TASKS.map((t, idx) => ({
                orgId,
                title: t.title,
                assigneeRole: t.assigneeRole as "HRRole",
                category: t.category as "Documentation",
                dueDate: addDays(startDate, t.dueInDays),
                isMandatory: t.isMandatory,
                sortOrder: t.sortOrder ?? idx,
              })),
            },
          },
        });

        // This bulk importer is only reachable from the Pre-Onboarding screen's
        // "Bulk Upload" button, so every row lands in the PreOnboarding phase —
        // same as the single "Add Candidate" wizard (see onboarding/candidates
        // route.ts). Without this, imported candidates silently default to the
        // "Onboarding" phase and never show up on the Pre-Onboarding roster.
        // `phase` is a raw-SQL column (Prisma client wasn't regenerated for it).
        await tx.$executeRaw`
          UPDATE "app_quikhrms"."OnboardingInstance" SET phase = 'PreOnboarding' WHERE id = ${instance.id}`;
        await tx.$executeRaw`
          UPDATE "app_quikhrms"."OnboardingTask" SET phase = 'PreOnboarding' WHERE "instanceId" = ${instance.id}`;
        });
      }
      result.success++;
    } catch (err) {
      result.failed++;
      result.errors.push({ row: rowNum, error: err instanceof Error ? err.message : "Failed to import row" });
    }
  }

  return result;
}
