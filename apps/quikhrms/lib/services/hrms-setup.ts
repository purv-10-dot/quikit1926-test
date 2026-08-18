import { prisma } from "@/lib/prisma";
import { getOrCreateCompanySettings } from "@/lib/services/settings";

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
  | "roles"
  | "leaveTypes"
  | "leaveGroups"
  | "holidays"
  | "onboardingTemplate"
  | "coreApprovalChains"
  | "emailTemplates"
  | "wfhQuota";

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

/**
 * Per-settings-link completion state for the /settings page (Organization /
 * Users & Roles / Setup & Configuration / Customizations cards). Only covers
 * rows whose underlying checklist item is BLOCKING (mandatory) — this drives
 * the small "Setup" badge shown next to a settings row until that required
 * thing is done. Non-mandatory rows never get the badge, so they simply
 * have no key here (departments/locations/leaveTypes/coreApprovalChains are
 * the blocking keys in ITEM_META; leaveGroups is also blocking but isn't
 * surfaced as a row on this page).
 */
export interface HrmsSettingsChecklist {
  departments: boolean;
  workLocations: boolean;
  approvalChains: boolean;
  leavePolicies: boolean;
}

export interface HrmsSetupProgress {
  /** Every item (blocking + recommended) done. */
  setupCompleted: boolean;
  /** Only the blocking/core items done — controls the app lock overlay. */
  coreCompleted: boolean;
  completedCount: number;
  totalCount: number;
  items: HrmsSetupItem[];
  settingsChecklist: HrmsSettingsChecklist;
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
  coreApprovalChains: {
    title: "Approval chains for every module",
    description: "Activate an approval chain for Leave, Requisition, Engagement, Feedback, Expense, WFH, Offboarding and Payroll.",
    href: "/settings/approval-chains",
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
    blocking: true,
  },
  leaveGroups: {
    title: "Assign employees to leave groups",
    description: "Put every employee in a leave group — that's what gives them their leave entitlements.",
    href: "/leaves/policies?tab=members",
    blocking: true,
  },
  holidays: {
    title: "Set up the holiday calendar",
    description: "Add this year's company holidays.",
    href: "/settings/holiday-calendar",
    blocking: false,
  },
  onboardingTemplate: {
    title: "Set up templates & letter branding",
    description: "Configure pre-onboarding, onboarding, offboarding templates and letter branding (offer, joining, resignation, exit).",
    href: "/settings",
    blocking: false,
  },
  emailTemplates: {
    title: "Customize email templates",
    description: "Personalize the emails HRMS sends for your organisation.",
    href: "/settings/email-templates",
    blocking: false,
  },
  wfhQuota: {
    title: "Assign employees to WFH groups",
    description: "Put every employee under a WFH quota group — directly or via their department.",
    href: "/settings/wfh-quota",
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
    select: {
      hrmsSetupCompleted: true,
      offerLetterBody: true,
      joiningLetterBody: true,
      resignationLetterBody: true,
      relievingLetterBody: true,
      experienceLetterBody: true,
    },
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
    const settingsChecklist: HrmsSettingsChecklist = {
      departments: true, workLocations: true, approvalChains: true, leavePolicies: true,
    };
    return { setupCompleted: true, coreCompleted: true, completedCount: items.length, totalCount: items.length, items, settingsChecklist };
  }

  const [
    departmentCount, locationCount, activeChains, roleCount, leaveTypeCount, holidayCount,
    onboardingTemplateCount, preOnboardingTemplateCount, offboardingTemplateCount, emailTemplateCount,
  ] = await Promise.all([
    prisma.department.count({ where: { orgId, deletedAt: null } }),
    prisma.officeLocation.count({ where: { orgId, deletedAt: null } }),
    prisma.approvalChain.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      select: { module: true, levels: true },
    }),
    prisma.hrmsAppRole.count({ where: { orgId } }),
    prisma.leaveType.count({ where: { orgId, deletedAt: null } }),
    prisma.companyHoliday.count({ where: { orgId, deletedAt: null } }),
    prisma.onboardingTemplate.count({ where: { orgId, deletedAt: null, kind: "Onboarding" } }),
    prisma.onboardingTemplate.count({ where: { orgId, deletedAt: null, kind: "PreOnboarding" } }),
    prisma.offboardingTemplate.count({ where: { orgId, deletedAt: null } }),
    prisma.emailTemplate.count({ where: { orgId, deletedAt: null } }),
  ]);

  // A "complete" chain is an active chain that has at least one level (approver).
  const chainHasLevels = (m: string) =>
    activeChains.some((c) => String(c.module) === m && Array.isArray(c.levels) && c.levels.length > 0);

  // Every module the Approval Chains settings page supports.
  const CORE_CHAIN_MODULES = ["Leave", "Requisition", "Engagement", "Feedback", "Expense", "WFH", "Offboarding", "Payroll"];

  // Leave groups: complete once EVERY active employee is covered by an active
  // leave group — directly (by employee) or via a role assignment. Vacuously
  // true when there are no active employees yet.
  const [activeEmployees, groupAssignments] = await Promise.all([
    prisma.employee.findMany({
      where: { orgId, deletedAt: null, status: "Active" },
      select: { id: true, appRoles: { select: { roleId: true }, take: 1 } },
    }),
    prisma.leaveGroupAssignment.findMany({
      where: { orgId, leaveGroup: { deletedAt: null, isActive: true } },
      select: { employeeId: true, roleId: true },
    }),
  ]);
  const assignedEmp = new Set(groupAssignments.map((a) => a.employeeId).filter(Boolean) as string[]);
  const assignedRole = new Set(groupAssignments.map((a) => a.roleId).filter(Boolean) as string[]);
  const unassignedActive = activeEmployees.filter((e) => {
    const rid = e.appRoles[0]?.roleId ?? null;
    return !assignedEmp.has(e.id) && !(rid && assignedRole.has(rid));
  });

  // WFH quota: complete once EVERY active employee is covered by an active WFH
  // quota group — either directly (wfhQuotaGroupId) or via their department
  // being listed on a group (mirrors resolveEffectiveWfhQuotaGroup's
  // explicit-then-department priority). Vacuously true with no active employees.
  const [employeesForWfh, activeWfhGroups] = await Promise.all([
    prisma.employee.findMany({
      where: { orgId, deletedAt: null, status: "Active" },
      select: { id: true, departmentId: true, wfhQuotaGroupId: true },
    }),
    prisma.wfhQuotaGroup.findMany({
      where: { orgId, deletedAt: null, isActive: true },
      select: { id: true, departmentIds: true },
    }),
  ]);
  const activeWfhGroupIds = new Set(activeWfhGroups.map((g) => g.id));
  const wfhCoveredDepts = new Set(activeWfhGroups.flatMap((g) => g.departmentIds));
  const wfhUnassigned = employeesForWfh.filter((e) => {
    const explicitOk = e.wfhQuotaGroupId && activeWfhGroupIds.has(e.wfhQuotaGroupId);
    const deptOk = e.departmentId && wfhCoveredDepts.has(e.departmentId);
    return !explicitOk && !deptOk;
  });

  // Templates & letter branding — 7 sub-checks: pre-onboarding, onboarding and
  // offboarding templates, plus offer/joining/resignation/exit letter bodies.
  // Exit letters count as one item but need BOTH the relieving and experience
  // bodies set, since one settings page configures both.
  const templateChecks = [
    preOnboardingTemplateCount > 0,
    onboardingTemplateCount > 0,
    offboardingTemplateCount > 0,
    Boolean(settings?.offerLetterBody?.trim()),
    Boolean(settings?.joiningLetterBody?.trim()),
    Boolean(settings?.resignationLetterBody?.trim()),
    Boolean(settings?.relievingLetterBody?.trim() && settings?.experienceLetterBody?.trim()),
  ];
  const templatesDone = templateChecks.filter(Boolean).length;
  const templatesTotal = templateChecks.length;

  const settingsChecklist: HrmsSettingsChecklist = {
    departments: departmentCount > 0,
    workLocations: locationCount > 0,
    approvalChains: CORE_CHAIN_MODULES.every((m) => chainHasLevels(m)),
    leavePolicies: leaveTypeCount > 0,
  };

  const states: Record<HrmsSetupItemKey, boolean> = {
    departments: departmentCount > 0,
    locations: locationCount > 0,
    roles: roleCount > 0,
    leaveTypes: leaveTypeCount > 0,
    leaveGroups: unassignedActive.length === 0,
    holidays: holidayCount > 0,
    onboardingTemplate: templatesDone === templatesTotal,
    coreApprovalChains: CORE_CHAIN_MODULES.every((m) => chainHasLevels(m)),
    emailTemplates: emailTemplateCount > 0,
    wfhQuota: wfhUnassigned.length === 0,
  };

  const chainModulesDone = CORE_CHAIN_MODULES.filter((m) => chainHasLevels(m)).length;
  const items = buildItems(states, {
    coreApprovalChains: { done: chainModulesDone, total: CORE_CHAIN_MODULES.length },
    onboardingTemplate: { done: templatesDone, total: templatesTotal },
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
    settingsChecklist,
  };
}
