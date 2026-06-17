import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { invalidatePermissionCache } from "@/lib/with-auth";
import { createAuditLog } from "@/lib/utils/audit";

/**
 * POST /api/v1/hrms/cron/preboarding-auto-activate
 *
 * Daily cron: any employee in PreBoarding whose joining date has arrived gets
 * auto-promoted to Active. Mirrors a manual "Confirm Employment" but for the
 * common case where HR forgot to click the button on day-1.
 *
 * Auth: shared CRON_SECRET header (`x-cron-secret`) — same pattern as the
 * other cron endpoints.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Employees whose joining date has arrived and are still in PreBoarding —
  // flip them to Active. Employees with only a tentativeJoiningDate (no
  // committed dateOfJoining) stay PreBoarding; HR must set the real date.
  const candidates = await prisma.employee.findMany({
    where: {
      deletedAt: null,
      status: "PreBoarding",
      dateOfJoining: { lte: now },
    },
    select: { id: true, orgId: true, workEmail: true, dateOfJoining: true },
  });

  let activated = 0;
  for (const e of candidates) {
    try {
      await prisma.employee.update({
        where: { id: e.id },
        data: { status: "Active" },
      });
      await invalidatePermissionCache(e.orgId, e.id);
      await createAuditLog({
        orgId: e.orgId,
        userId: "system",
        action: "Update",
        entityType: "Employee",
        entityId: e.id,
        metadata: {
          action: "preboarding-auto-activate",
          joiningDate: e.dateOfJoining ?? null,
        },
      });
      activated += 1;
    } catch (err) {
      console.error("[cron:preboarding-auto-activate] failed for employee", e.id, err);
    }
  }

  return NextResponse.json({ success: true, data: { scanned: candidates.length, activated } });
}
