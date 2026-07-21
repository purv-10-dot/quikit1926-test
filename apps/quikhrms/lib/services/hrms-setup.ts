import { prisma } from "@/lib/prisma";
import { getOrCreateCompanySettings } from "@/lib/services/settings";
import { computeSetupProgress } from "@/lib/services/payroll";

/**
 * First-run org-setup gate for HRMS admins.
 *
 * When the central QuikIT auth invites an org admin, HRMS stays locked behind a
 * checklist until the org has the minimum configuration in place. Completion is
 * auto-detected from existing records (no manual "mark done"); once all items
 * pass, `CompanySettings.hrmsSetupCompleted` is latched true so the app unlocks
 * permanently — deleting a department later never re-locks a working org.
 */

export type HrmsSetupItemKey =
  | "departments"
  | "locations"
  | "approvalChains"
  | "payroll"
  | "roles"
  | "leaveTypes"
  | "holidays"
  | "onboardingTemplate"
  | "coreApprovalChains";

export interface HrmsSetupItem {
  key: HrmsSetupItemKey;
  /** UI label. */
  title: string;
  /** One-line helper text. */
  description: string;
  /** Route the "Set up" button navigates to. */
  href: string;
  completed: boolean;
  /** Blocking (Required) items hard-lock the app until done; others are Recommended. */
  blocking: boolean;
  /** Optional sub-step progress for multi-part items (e.g. Payroll 3/6). */
  progress?: { done: number; total: number };
}

export interface HrmsSetupProgress {
  /** Every item (blocking + recommended) done. */
  setupCompleted: boolean;
  /** Only the blocking/core items done — controls the app lock overlay. */
  coreCompleted: boolean;
  completedCount: number;
  totalCount: number;
  items: HrmsSetupItem[];
}

const ITEM_META: Record<
  HrmsSetupItemKey,
  Pick<HrmsSetupItem, "title" | "description" | "href" | "blocking">
> = {
  departments: {
    title: "Create departments",
    description: "Add at least one department to organise your people.",
    href: "/settings/departments",
    blocking: true,
  },
  locations: {
    title: "Add office locations",
    description: "Add at least one office location or branch.",
    href: "/settings/locations",
    blocking: true,
  },
  approvalChains: {
    title: "Configure an approval chain",
    description: "Set up at least one active approval chain with an approver.",
    href: "/settings/approval-chains",
    blocking: true,
  },
  payroll: {
    title: "Complete payroll setup",
    description: "Finish the payroll setup so you can run payroll.",
    href: "/payroll/setup",
    blocking: true,
  },
  roles: {
    title: "Set up roles & permissions",
    description: "Define who can do what across the app.",
    href: "/settings/roles",
    blocking: false,
  },
  leaveTypes: {
    title: "Add leave types & policies",
    description: "Create the leave types your org offers.",
    href: "/leaves/policies",
    blocking: false,
  },
  holidays: {
    title: "Set up the holiday calendar",
    description: "Add this year's company holidays.",
    href: "/settings/holiday-calendar",
    blocking: false,
  },
  onboardingTemplate: {
    title: "Create an onboarding template",
    description: "Standardise tasks for every new joiner.",
    href: "/onboarding",
    blocking: false,
  },
  coreApprovalChains: {
    title: "Approval chains: Leave, Expense & Requisition",
    description: "Activate an approval chain for each of these modules.",
    href: "/settings/approval-chains",
    blocking: false,
  },
};

const BLOCKING_KEYS = (Object.keys(ITEM_META) as HrmsSetupItemKey[]).filter((k) => ITEM_META[k].blocking);

/**
 * Compute setup progress for an org and latch the completion flag when every
 * item passes. Short-circuits to a fully-complete result once latched so the
 * gate never re-appears.
 */
export async function computeHrmsSetupProgress(
  orgId: string,
  userId?: string,
): Promise<HrmsSetupProgress> {
  const settings = await prisma.companySettings.findUnique({
    where: { orgId },
    select: { hrmsSetupCompleted: true },
  });

  const buildItems = (
    states: Record<HrmsSetupItemKey, boolean>,
    progressMap: Partial<Record<HrmsSetupItemKey, { done: number; total: number }>> = {},
  ): HrmsSetupItem[] =>
    (Object.keys(ITEM_META) as HrmsSetupItemKey[]).map((key) => ({
      key,
      ...ITEM_META[key],
      completed: states[key],
      ...(progressMap[key] ? { progress: progressMap[key] } : {}),
    }));

  if (settings?.hrmsSetupCompleted) {
    const states = Object.fromEntries(
      (Object.keys(ITEM_META) as HrmsSetupItemKey[]).map((k) => [k, true]),
    ) as Record<HrmsSetupItemKey, boolean>;
    const items = buildItems(states);
    return { setupCompleted: true, coreCompleted: true, completedCount: items.length, totalCount: items.length, items };
  }

  const [departmentCount, locationCount, activeChains, payrollProgress, roleCount, leaveTypeCount, holidayCount, onboardingTemplateCount] = await Promise.all([
    prisma.department.count({ where: { orgId, deletedAt: null } }),
    prisma.officeLocation.count({ where: { orgId, deletedAt: null } }),
    prisma.approvalChain.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      select: { module: true, levels: true },
    }),
    computeSetupProgress(orgId),
    prisma.hrmsAppRole.count({ where: { orgId } }),
    prisma.leaveType.count({ where: { orgId, deletedAt: null } }),
    prisma.companyHoliday.count({ where: { orgId, deletedAt: null } }),
    prisma.onboardingTemplate.count({ where: { orgId, deletedAt: null } }),
  ]);

  // A "complete" chain is an active chain that has at least one level (approver).
  const chainHasLevels = (m: string) =>
    activeChains.some((c) => String(c.module) === m && Array.isArray(c.levels) && c.levels.length > 0);
  const hasCompleteChain = activeChains.some((c) => Array.isArray(c.levels) && c.levels.length > 0);

  const states: Record<HrmsSetupItemKey, boolean> = {
    departments: departmentCount > 0,
    locations: locationCount > 0,
    approvalChains: hasCompleteChain,
    payroll: payrollProgress.setupCompleted,
    roles: roleCount > 0,
    leaveTypes: leaveTypeCount > 0,
    holidays: holidayCount > 0,
    onboardingTemplate: onboardingTemplateCount > 0,
    coreApprovalChains: chainHasLevels("Leave") && chainHasLevels("Expense") && chainHasLevels("Requisition"),
  };

  const chainModulesDone = ["Leave", "Expense", "Requisition"].filter((m) => chainHasLevels(m)).length;
  const items = buildItems(states, {
    payroll: { done: payrollProgress.completedSteps, total: payrollProgress.totalSteps },
    coreApprovalChains: { done: chainModulesDone, total: 3 },
  });
  const completedCount = items.filter((i) => i.completed).length;
  const allDone = completedCount === items.length;
  const coreCompleted = BLOCKING_KEYS.every((k) => states[k]);

  // Latch only when EVERYTHING (blocking + recommended) passes — the app is
  // already usable once the core items are done (coreCompleted), so latching on
  // full completion just retires the checklist nudge without re-locking anyone.
  if (allDone) {
    await getOrCreateCompanySettings(orgId, userId ?? "system");
    await prisma.companySettings.update({
      where: { orgId },
      data: {
        hrmsSetupCompleted: true,
        hrmsSetupCompletedAt: new Date(),
        ...(userId ? { updatedBy: userId } : {}),
      },
    });
  }

  return {
    setupCompleted: allDone,
    coreCompleted,
    completedCount,
    totalCount: items.length,
    items,
  };
}
