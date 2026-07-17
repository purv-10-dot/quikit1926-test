import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendExitInterviewInvite } from "@/lib/services/exit-interview-service";

/**
 * Daily cron — emails the exit-interview form to every employee whose LAST
 * WORKING DAY is today and who hasn't already submitted it. Runs once per day,
 * so each departing employee is invited on their last day.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET not configured" }, { status: 500 });
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const due = await prisma.offboardingInstance.findMany({
    where: {
      deletedAt: null,
      exitInterviewDone: false,
      lastWorkingDate: { gte: start, lte: end },
    },
    select: { id: true, orgId: true },
  });

  const results = await Promise.all(due.map((d) => sendExitInterviewInvite(d.orgId, d.id)));
  const sent = results.filter((r) => r.sent).length;

  return NextResponse.json({ success: true, data: { candidates: due.length, sent, skipped: due.length - sent } });
}
