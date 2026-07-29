import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { attendanceDayStart } from "@/lib/attendance/day";
import { publishNotification } from "@/lib/services/realtime";

/**
 * POST /api/v1/hrms/cron/attendance-missed-checkout
 *
 * Daily cron: any attendance record from a PAST day where the employee checked
 * in but never checked out (checkIn set, checkOut null) is flagged
 * `missedCheckout = true` so it surfaces for regularization. We do NOT invent a
 * checkout time — hours stay 0 until the employee/HR regularizes the day.
 *
 * Auth: shared CRON_SECRET header (`x-cron-secret`) — same as the other crons.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  // Anything before today's IST day is a completed day that can be flagged.
  const todayStart = attendanceDayStart();

  const stale = await prisma.attendanceRecord.findMany({
    where: {
      deletedAt: null,
      date: { lt: todayStart },
      checkIn: { not: null },
      checkOut: null,
      missedCheckout: false,
    },
    select: { id: true, orgId: true, employeeId: true, date: true },
  });

  let flagged = 0;
  for (const rec of stale) {
    try {
      await prisma.attendanceRecord.update({
        where: { id: rec.id },
        data: { missedCheckout: true },
      });
      flagged++;
      // Nudge the employee to regularize (best-effort).
      publishNotification(rec.orgId, [rec.employeeId], {
        title: "Missed check-out",
        message: `You checked in on ${new Date(rec.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} but didn't check out. Please regularize that day.`,
        type: "Warning",
        link: "/attendance",
      }).catch(() => {});
    } catch (e) {
      console.error("[cron] missed-checkout flag failed for", rec.id, e);
    }
  }

  return NextResponse.json({ success: true, data: { scanned: stale.length, flagged } });
}
