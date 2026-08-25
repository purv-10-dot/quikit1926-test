import { NextResponse } from "next/server";
import { Packer } from "docx";
import { z } from "zod";

import { db } from "@/lib/db";
import { findReport, scopeKeyFor } from "@/lib/reports/reportStore";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { storedWmReportSchema } from "@/lib/reports/wmCompose";
import { buildWeeklyMeetingReportDocx } from "@/lib/exports/weeklyMeetingReportDocx";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  weeklyMeetingId: z.string().min(1),
});

/**
 * POST /api/client-meetings/reports/weekly-meeting/export { weeklyMeetingId }
 *
 * Download the saved Weekly Meeting Report as a Word (.docx) document.
 *
 * READ FROM STORAGE, NEVER FROM THE REQUEST BODY. A caller cannot post
 * arbitrary content and have the server hand it back as an official-looking
 * deliverable — the download can only ever contain what was generated.
 *
 * **No model is called.** Exporting costs nothing, however many times it
 * happens.
 */
export const POST = auth.view(async ({ orgId }, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const [saved, org] = await Promise.all([
    findReport(
      orgId,
      "WM",
      scopeKeyFor({ kind: "WM", weeklyMeetingId: parsed.data.weeklyMeetingId }),
    ),
    db.org.findFirst({ where: { id: orgId }, select: { name: true } }),
  ]);

  if (!saved?.report) {
    return NextResponse.json(
      { success: false, error: "No generated report for this meeting." },
      { status: 404 },
    );
  }

  const report = storedWmReportSchema.safeParse(saved.report);
  if (!report.success) {
    // A report stored under an older schema version cannot be rendered by
    // today's exporter. Failing loudly beats emitting a partial document that
    // looks complete.
    return NextResponse.json(
      { success: false, error: "The stored report could not be read for export." },
      { status: 422 },
    );
  }

  const doc = buildWeeklyMeetingReportDocx(report.data, {
    orgName: org?.name ?? "QuikScale",
    // An unreviewed report is watermarked DRAFT on its face, so it cannot be
    // circulated as final by accident.
    validated: saved.validatedAt !== null,
  });
  const buffer = await Packer.toBuffer(doc);

  const safeName = `Weekly-Meeting-Report-${report.data.clientName}-${report.data.meetingDate}`
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 80);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${safeName}.docx"`,
    },
  });
});
