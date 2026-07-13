import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

interface AvailabilityRow {
  category: "Sick" | "Parental" | "WFH" | "Holiday";
  label: string;
  count: number;
  avatars: { id: string; firstName: string; lastName: string; profilePhoto: string | null }[];
}

function classify(name: string, code: string): AvailabilityRow["category"] | null {
  const s = `${name} ${code}`.toLowerCase();
  if (/sick|medical/.test(s)) return "Sick";
  if (/parent|matern|patern|child/.test(s)) return "Parental";
  if (/holiday|vacation|annual|paid|earned|casual/.test(s)) return "Holiday";
  return null;
}

export const GET = withServiceAuth(async (_req: NextRequest, { orgId }) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);

    const [leaves, wfh] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: {
          orgId, deletedAt: null, status: "Approved",
          startDate: { lte: todayEnd }, endDate: { gte: today },
        },
        include: {
          leaveType: { select: { name: true, code: true } },
          employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        },
      }),
      prisma.wfhRequest.findMany({
        where: {
          orgId, deletedAt: null, status: "Approved",
          startDate: { lte: todayEnd }, endDate: { gte: today },
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, profilePhoto: true } },
        },
      }),
    ]);

    const buckets = new Map<AvailabilityRow["category"], typeof leaves[number]["employee"][]>();
    for (const cat of ["Sick", "Parental", "Holiday", "WFH"] as const) buckets.set(cat, []);

    for (const r of leaves) {
      const cat = classify(r.leaveType?.name ?? "", r.leaveType?.code ?? "") ?? "Holiday";
      const arr = buckets.get(cat) ?? [];
      if (r.employee) arr.push(r.employee);
      buckets.set(cat, arr);
    }
    for (const w of wfh) {
      const arr = buckets.get("WFH") ?? [];
      if (w.employee) arr.push(w.employee);
      buckets.set("WFH", arr);
    }

    const labels: Record<AvailabilityRow["category"], string> = {
      Sick: "Sick leave",
      Parental: "Parental leave",
      WFH: "Work from home (WFH)",
      Holiday: "On holiday",
    };

    const rows: AvailabilityRow[] = (["Sick", "Parental", "WFH", "Holiday"] as const)
      .map((cat) => {
        const list = (buckets.get(cat) ?? []).filter((e): e is NonNullable<typeof e> => e !== null);
        return {
          category: cat,
          label: labels[cat],
          count: list.length,
          avatars: list.slice(0, 4),
        };
      })
      .filter((r) => r.count > 0);

    return successResponse(rows);
  } catch (e) {
    console.error("GET /leaves/availability-today error:", e);
    return internalError();
  }
});
