import { NextResponse } from "next/server";
import { Packer } from "docx";
import { z } from "zod";

import { db } from "@/lib/db";
import { findReport, scopeKeyFor } from "@/lib/reports/reportStore";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import {
  storedWeekRollupReportSchema,
  weekBounds,
} from "@/lib/reports/weekRollupCompose";
import { buildWeekRollupReportDocx } from "@/lib/exports/weekRollupReportDocx";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const bodySchema = z.object({
  clientId: z.string().min(1),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be yyyy-mm-dd"),
});

/**
 * POST /api/client-meetings/reports/week-rollup/export { clientId, weekStart }
 *
 * Download the saved Week Rollup as a Word (.docx) document.
 *
 * READ FROM STORAGE, NEVER FROM THE REQUEST BODY. A caller cannot post
 * arbitrary content and have the server hand it back as an official-looking
 * deliverable.
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

  const bounds = weekBounds(parsed.data.weekStart);
  if (!bounds) {
    return NextResponse.json({ success: false, error: "Invalid week" }, { status: 400 });
  }

  const [saved, org] = await Promise.all([
    findReport(
      orgId,
      "WEEK_ROLLUP",
      scopeKeyFor({ kind: "WEEK_ROLLUP", periodStart: bounds.start }),
    ),
    db.org.findFirst({ where: { id: orgId }, select: { name: true } }),
  ]);

  if (!saved?.report) {
    return NextResponse.json(
      { success: false, error: "No generated rollup for this week." },
      { status: 404 },
    );
  }

  const report = storedWeekRollupReportSchema.safeParse(saved.report);
  if (!report.success) {
    // A rollup stored under an older schema version cannot be rendered by
    // today's exporter. Failing loudly beats emitting a partial document that
    // looks complete.
    return NextResponse.json(
      { success: false, error: "The stored rollup could not be read for export." },
      { status: 422 },
    );
  }

  const doc = buildWeekRollupReportDocx(report.data, {
    orgName: org?.name ?? "QuikScale",
    validated: saved.validatedAt !== null,
  });
  const buffer = await Packer.toBuffer(doc);

  const safeName = `Week-Rollup-${report.data.clientName}-${report.data.weekStart}`
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
