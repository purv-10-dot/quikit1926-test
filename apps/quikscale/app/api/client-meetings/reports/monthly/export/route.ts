import { NextResponse } from "next/server";
import { Packer } from "docx";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { storedMonthlyReportSchema, monthBounds } from "@/lib/reports/monthlyCompose";
import { buildMonthlyReportDocx } from "@/lib/exports/monthlyReportDocx";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  clientId: z.string().min(1),
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be yyyy-mm"),
});

/**
 * POST /api/client-meetings/reports/monthly/export { clientId, period }
 *
 * Download the saved Monthly Report as a Word (.docx) document.
 *
 * READ FROM STORAGE, NEVER FROM THE REQUEST BODY. A caller cannot post
 * arbitrary content and have the server hand it back as an official-looking
 * deliverable — the download can only ever contain what was generated and
 * validated. This mirrors the weekly export deliberately.
 *
 * **No model is called.** Exporting a report costs nothing, however many times
 * it is downloaded.
 */
export const POST = auth.view(async ({ orgId }, req) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const bounds = monthBounds(parsed.data.period);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid period" }, { status: 400 });
  }

  const [saved, org] = await Promise.all([
    db.clientMonthlyReport.findFirst({
      where: {
        orgId,
        clientId: parsed.data.clientId,
        periodStart: bounds.start,
        deletedAt: null,
      },
      select: { report: true, validatedAt: true },
    }),
    db.org.findFirst({ where: { id: orgId }, select: { name: true } }),
  ]);

  if (!saved?.report) {
    return NextResponse.json(
      { success: false, error: "No generated report for this month." },
      { status: 404 },
    );
  }

  const report = storedMonthlyReportSchema.safeParse(saved.report);
  if (!report.success) {
    // A stored report written under an older schema version cannot be rendered
    // by today's exporter. Failing loudly beats emitting a partial document
    // that looks complete.
    return NextResponse.json(
      { success: false, error: "The stored report could not be read for export." },
      { status: 422 },
    );
  }

  const doc = buildMonthlyReportDocx(report.data, {
    orgName: org?.name ?? "QuikScale",
    // An unreviewed report is watermarked DRAFT on its face, so it cannot be
    // circulated as final by accident.
    validated: saved.validatedAt !== null,
  });
  const buffer = await Packer.toBuffer(doc);

  const safeName = `Monthly-Report-${report.data.clientName}-${report.data.period}`
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
