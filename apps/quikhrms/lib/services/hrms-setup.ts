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
  | "payroll";

export interface HrmsSetupItem {
  key: HrmsSetupItemKey;
  /** UI label. */
  title: string;
  /** One-line helper text. */
  description: string;
  /** Route the "Set up" button navigates to. */
  href: string;
  completed: boolean;
}

export interface HrmsSetupProgress {
  setupCompleted: boolean;
  completedCount: number;
  totalCount: number;
  items: HrmsSetupItem[];
}

const ITEM_META: Record<
  HrmsSetupItemKey,
  Pick<HrmsSetupItem, "title" | "description" | "href">
> = {
  departments: {
    title: "Create departments",
    description: "Add at least one department to organise your people.",
    href: "/settings/departments",
  },
  locations: {
    title: "Add office locations",
    description: "Add at least one office location or branch.",
    href: "/settings/locations",
  },
  approvalChains: {
    title: "Configure an approval chain",
    description: "Set up at least one active approval chain with an approver.",
    href: "/settings/approval-chains",
  },
  payroll: {
    title: "Complete payroll setup",
    description: "Finish the payroll setup so you can run payroll.",
    href: "/payroll/setup",
  },
};

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

  const buildItems = (states: Record<HrmsSetupItemKey, boolean>): HrmsSetupItem[] =>
    (Object.keys(ITEM_META) as HrmsSetupItemKey[]).map((key) => ({
      key,
      ...ITEM_META[key],
      completed: states[key],
    }));

  if (settings?.hrmsSetupCompleted) {
    const items = buildItems({
      departments: true,
      locations: true,
      approvalChains: true,
      payroll: true,
    });
    return {
      setupCompleted: true,
      completedCount: items.length,
      totalCount: items.length,
      items,
    };
  }

  const [departmentCount, locationCount, activeChains, payrollProgress] = await Promise.all([
    prisma.department.count({ where: { orgId, deletedAt: null } }),
    prisma.officeLocation.count({ where: { orgId, deletedAt: null } }),
    prisma.approvalChain.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      select: { levels: true },
    }),
    // Use the same data-derived completion the payroll Setup page shows — NOT
    // the raw `setupCompleted` flag. That flag only latches once every per-step
    // flag is set, which misses steps satisfied by data created outside the
    // wizard (company profile, employees), leaving this popup stuck below 4/4.
    computeSetupProgress(orgId),
  ]);

  // A "complete" approval chain is an active chain that actually has at least
  // one level (approver). `levels` is JSON, so validate its shape in JS.
  const hasCompleteChain = activeChains.some(
    (c) => Array.isArray(c.levels) && c.levels.length > 0,
  );

  const states: Record<HrmsSetupItemKey, boolean> = {
    departments: departmentCount > 0,
    locations: locationCount > 0,
    approvalChains: hasCompleteChain,
    payroll: payrollProgress.setupCompleted,
  };

  const items = buildItems(states);
  const completedCount = items.filter((i) => i.completed).length;
  const allDone = completedCount === items.length;

  // Latch the flag the first time everything passes.
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
    completedCount,
    totalCount: items.length,
    items,
  };
}
