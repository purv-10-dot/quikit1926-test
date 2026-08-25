import { NextResponse } from "next/server";
import { Packer } from "docx";
import { z } from "zod";
import { db } from "@/lib/db";
import { findReport, scopeKeyFor } from "@/lib/reports/reportStore";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { storedWeeklyReportSchema } from "@/lib/ai/weeklyHuddleCompose";
import { buildWeeklyReportDocx } from "@/lib/exports/weeklyHuddleReportDocx";
import { toWeekStart } from "@/lib/services/weeklyHuddleData";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
});

/**
 * POST /api/client-meetings/reports/weekly/export { clientId, weekStart }
 *
 * Download the saved Daily Huddle Weekly Report as a Word (.docx) document.
 *
 * The report is read from storage rather than accepted in the request body, so
 * the download can only ever contain what was generated and validated — a
 * client cannot post arbitrary content and have the server hand it back as an
 * official-looking deliverable.
 */
export const POST = auth.view(async ({ orgId }, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const weekStart = toWeekStart(new Date(`${parsed.data.weekStart}T00:00:00.000Z`));

  const [saved, org] = await Promise.all([
    findReport(
      orgId,
      "DH_WEEKLY",
      scopeKeyFor({ kind: "DH_WEEKLY", periodStart: weekStart }),
    ),
    db.org.findFirst({ where: { id: orgId }, select: { name: true } }),
  ]);

  if (!saved?.report) {
    return NextResponse.json(
      { success: false, error: "No generated report for this week." },
      { status: 404 },
    );
  }

  const report = storedWeeklyReportSchema.safeParse(saved.report);
  if (!report.success) {
    return NextResponse.json(
      { success: false, error: "The stored report could not be read for export." },
      { status: 422 },
    );
  }

  const doc = buildWeeklyReportDocx(report.data, org?.name ?? "QuikScale");
  const buffer = await Packer.toBuffer(doc);

  const safeName = `Daily-Huddle-Weekly-${report.data.clientName}-${report.data.weekStart}`
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
});
