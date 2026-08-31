import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { listReports, type StoredReportKind } from "@/lib/reports/reportStore";
import {
  BULK_REPORT_KINDS,
  SIGN_OFF_KINDS,
  isTranscriptSourced,
  type BulkReportKind,
} from "@/lib/exports/bulkReportKinds";
import {
  BULK_MAX_REPORTS,
  BulkExportLimitError,
  buildBulkReportZip,
  bulkZipFileName,
  type BulkSourceReport,
} from "@/lib/exports/bulkReportZip";

export const runtime = "nodejs";

/**
 * A PDF render is slow, and forty of them in one request is the point of the
 * cap. Raised from the platform default so the request finishes rather than
 * being cut off mid-zip, which would look like a corrupt download.
 */
export const maxDuration = 300;

/**
 * The SAME gate the single-report exports use. A bulk download is not a new
 * capability - it is the download people already have, done many times at once -
 * so it must not need a permission nobody has been granted.
 */
const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be yyyy-mm-dd");

const selectionSchema = z
  .object({
    clientIds: z.array(z.string().min(1)).min(1, "Pick at least one client").max(20),
    from: isoDate,
    to: isoDate,
    kinds: z
      .array(z.enum([...BULK_REPORT_KINDS] as [BulkReportKind, ...BulkReportKind[]]))
      .min(1, "Pick at least one report type")
      .default([...BULK_REPORT_KINDS]),
    /** Signed-off reports only - the safe default for an external deliverable. */
    validatedOnly: z.boolean().default(false),
  })
  .refine((v) => v.from <= v.to, {
    message: "The start date must not be after the end date",
  });

type Selection = z.infer<typeof selectionSchema>;

/** Query string (GET, for the count preview) to the shape the POST takes. */
function selectionFromQuery(url: URL): unknown {
  const kinds = url.searchParams.getAll("kinds").flatMap((v) => v.split(",")).filter(Boolean);
  const clientIds = url.searchParams
    .getAll("clientIds")
    .flatMap((v) => v.split(","))
    .filter(Boolean);
  return {
    clientIds,
    from: url.searchParams.get("from") ?? "",
    to: url.searchParams.get("to") ?? "",
    ...(kinds.length ? { kinds } : {}),
    validatedOnly: url.searchParams.get("validatedOnly") === "true",
  };
}

const dayStart = (d: string) => new Date(`${d}T00:00:00.000Z`);
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999Z`);

/**
 * Every report the selection covers, from BOTH homes.
 *
 * Period and meeting reports live in `ClientMeetingReport`; the report for a
 * single huddle lives on `ClientMeetingTranscript.report`. Both reads are
 * org-scoped, and the client ids are resolved against the org first, so a caller
 * naming another org's client id receives nothing rather than that org's work.
 */
async function collectSources(orgId: string, selection: Selection) {
  const from = dayStart(selection.from);
  const to = dayEnd(selection.to);

  const storedKinds = selection.kinds.filter(
    (k): k is StoredReportKind => !isTranscriptSourced(k),
  );
  const wantsHuddleReports = selection.kinds.some(isTranscriptSourced);

  const clients = await db.client.findMany({
    where: { orgId, id: { in: selection.clientIds }, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const perClient = await Promise.all(
    clients.map(async (client) => {
      const sources: BulkSourceReport[] = [];

      if (storedKinds.length > 0) {
        const rows = await listReports(orgId, client.id, { kinds: storedKinds, from, to });
        for (const r of rows) {
          if (selection.validatedOnly && r.validatedAt === null) continue;
          sources.push({
            id: r.id,
            kind: r.reportKind as BulkReportKind,
            report: r.report,
            clientName: client.name,
            period: r.periodStart?.toISOString().slice(0, 10) ?? null,
            currentVersion: r.currentVersion,
            validated: r.validatedAt !== null,
            generatedAt: r.generatedAt,
          });
        }
      }

      // A per-huddle report carries no sign-off, so "signed-off only" cannot
      // include one. Skipping the query entirely (rather than filtering rows
      // out) keeps that explicit; the dialog says the same thing to the user.
      if (wantsHuddleReports && !selection.validatedOnly) {
        const huddles = await db.clientMeetingTranscript.findMany({
          where: {
            orgId,
            clientId: client.id,
            deletedAt: null,
            type: "DAILY",
            // `DbNull`, not `null`: on a nullable Json column Prisma needs the
            // sentinel to mean "the column is NULL" rather than "the JSON value
            // is the literal null".
            report: { not: Prisma.DbNull },
            meetingDate: { gte: from, lte: to },
          },
          select: {
            id: true,
            report: true,
            meetingDate: true,
            reportGeneratedAt: true,
          },
          orderBy: { meetingDate: "asc" },
        });

        for (const t of huddles) {
          sources.push({
            id: t.id,
            kind: "DH_DAILY",
            report: t.report,
            clientName: client.name,
            period: t.meetingDate?.toISOString().slice(0, 10) ?? null,
            // A transcript report has no version counter and no sign-off. Saying
            // version 1 / not signed off is the honest reading of both.
            currentVersion: 1,
            validated: false,
            generatedAt: t.reportGeneratedAt,
          });
        }
      }

      return sources;
    }),
  );

  // Oldest first across kinds, so a zip reads in the order the month happened.
  const sources = perClient.flat().sort((a, b) => (a.period ?? "").localeCompare(b.period ?? ""));
  return { clients, sources };
}

/**
 * GET /api/client-meetings/reports/bulk-export?clientIds=...&from=...&to=...&kinds=...
 *
 * How many reports the selection covers, per kind - so the download dialog can
 * say "12 reports, 3 not signed off" BEFORE anyone commits to rendering a stack
 * of PDFs. Metadata only; no document is rendered.
 */
export const GET = auth.view(async ({ orgId }, req) => {
  const parsed = selectionSchema.safeParse(selectionFromQuery(new URL(req.url)));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid selection" },
      { status: 400 },
    );
  }

  const { sources } = await collectSources(orgId, parsed.data);

  const byKind: Record<string, number> = {};
  for (const s of sources) byKind[s.kind] = (byKind[s.kind] ?? 0) + 1;

  return NextResponse.json({
    success: true,
    data: {
      total: sources.length,
      // Counted over the kinds that HAVE a sign-off, so a per-huddle report is
      // not reported as "unsigned" when no signature was ever possible.
      unvalidated: sources.filter(
        (s) => SIGN_OFF_KINDS.includes(s.kind) && !s.validated,
      ).length,
      byKind,
      maxReports: BULK_MAX_REPORTS,
      overLimit: sources.length > BULK_MAX_REPORTS,
    },
  });
});

/**
 * POST /api/client-meetings/reports/bulk-export
 *   { clientIds, from, to, kinds, validatedOnly? }
 *
 * Download every matching saved report as one .zip of PDFs, plus a
 * `manifest.csv` listing what went in - and what was left out and why.
 *
 * READ FROM STORAGE, NEVER FROM THE REQUEST BODY, exactly as the single-report
 * exports do: the body selects reports, it never supplies their content, so no
 * caller can have arbitrary text handed back as an official deliverable.
 *
 * **No model is called.** Exporting costs nothing, however many reports and
 * however many times.
 */
export const POST = auth.view(async ({ orgId }, req) => {
  const parsed = selectionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid selection" },
      { status: 400 },
    );
  }

  const [{ sources }, org] = await Promise.all([
    collectSources(orgId, parsed.data),
    db.org.findFirst({ where: { id: orgId }, select: { name: true } }),
  ]);

  if (sources.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No saved reports match that selection. Generate the reports first, or widen the range.",
      },
      { status: 404 },
    );
  }

  let built;
  try {
    built = await buildBulkReportZip(sources, { orgName: org?.name ?? "QuikScale" });
  } catch (e) {
    if (e instanceof BulkExportLimitError) {
      // 413, not 400: the request was well-formed, it just asks for more than
      // one response can carry. The message names the way out.
      return NextResponse.json({ success: false, error: e.message }, { status: 413 });
    }
    throw e;
  }

  if (built.entries.length === 0) {
    // Every candidate was skipped. Handing back a zip holding nothing but a
    // manifest of failures would read as a successful download.
    return NextResponse.json(
      {
        success: false,
        error:
          "None of the matching reports could be rendered - they were stored under an older schema version. Regenerate them and try again.",
      },
      { status: 422 },
    );
  }

  return new NextResponse(built.zip, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${bulkZipFileName(parsed.data)}"`,
      // The dialog reports "10 of 12 included" from these rather than making the
      // user open the manifest to discover a partial download.
      "X-Bulk-Included": String(built.entries.length),
      "X-Bulk-Skipped": String(built.skipped.length),
    },
  });
});
