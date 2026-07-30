import { prisma } from "@/lib/prisma";

export type AvailabilityCategory = "Sick" | "Parental" | "WFH" | "Holiday" | "OnLeave";

export interface AvailabilityRow {
  category: AvailabilityCategory;
  label: string;
  count: number;
  avatars: { id: string; firstName: string; lastName: string; profilePhoto: string | null }[];
}

type Emp = { id: string; firstName: string; lastName: string; profilePhoto: string | null };

/** Bucket a leave type by name/code. Sick + Parental are health/family-sensitive. */
function classify(name: string, code: string): "Sick" | "Parental" | "Holiday" {
  const s = `${name} ${code}`.toLowerCase();
  if (/sick|medical/.test(s)) return "Sick";
  if (/parent|matern|patern|child/.test(s)) return "Parental";
  return "Holiday";
}

/**
 * Today's availability (approved leave + WFH), shared by the home dashboard and
 * the standalone availability-today widget so the confidentiality rule lives in
 * ONE place.
 *
 * Health/family-status confidentiality: Sick and Parental leave — both the
 * CATEGORY and the people on it — are disclosed ONLY to callers who can view all
 * leave (`canSeeSensitive`). Everyone else gets those two folded into a single
 * anonymized "On leave" count with NO names/avatars. WFH and general holiday
 * (annual/casual/earned) are not sensitive and keep their avatars.
 */
export async function getTodayAvailability(orgId: string, canSeeSensitive: boolean): Promise<AvailabilityRow[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const [leaves, wfh] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { orgId, deletedAt: null, status: "Approved", startDate: { lte: todayEnd }, endDate: { gte: today } },
      take: 1000,
      select: {
        leaveType: { select: { name: true, code: true } },
        employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
      },
    }),
    prisma.wfhRequest.findMany({
      where: { orgId, deletedAt: null, status: "Approved", startDate: { lte: todayEnd }, endDate: { gte: today } },
      take: 1000,
      select: { employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } } },
    }),
  ]);

  const sick: Emp[] = [], parental: Emp[] = [], holiday: Emp[] = [], wfhList: Emp[] = [];
  for (const r of leaves) {
    if (!r.employee) continue;
    const cat = classify(r.leaveType?.name ?? "", r.leaveType?.code ?? "");
    (cat === "Sick" ? sick : cat === "Parental" ? parental : holiday).push(r.employee);
  }
  for (const w of wfh) if (w.employee) wfhList.push(w.employee);

  const rows: AvailabilityRow[] = [];
  if (canSeeSensitive) {
    if (sick.length) rows.push({ category: "Sick", label: "Sick leave", count: sick.length, avatars: sick.slice(0, 4) });
    if (parental.length) rows.push({ category: "Parental", label: "Parental leave", count: parental.length, avatars: parental.slice(0, 4) });
  } else {
    // Anonymized: fold Sick + Parental into one generic count, no identities.
    const n = sick.length + parental.length;
    if (n) rows.push({ category: "OnLeave", label: "On leave", count: n, avatars: [] });
  }
  if (wfhList.length) rows.push({ category: "WFH", label: "Work from home (WFH)", count: wfhList.length, avatars: wfhList.slice(0, 4) });
  if (holiday.length) rows.push({ category: "Holiday", label: "On holiday", count: holiday.length, avatars: holiday.slice(0, 4) });
  return rows;
}

/** Whether the caller may see the sensitive (Sick/Parental) breakdown with identities. */
export function canSeeSensitiveAvailability(permissions: string[]): boolean {
  return permissions.includes("*") || permissions.includes("hrms.leave.read");
}
