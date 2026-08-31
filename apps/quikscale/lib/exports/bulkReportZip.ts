/**
 * Bulk report download - many stored reports, one .zip of PDFs.
 *
 * WHY THIS MODULE EXISTS SEPARATELY FROM THE ROUTE
 * ------------------------------------------------
 * Everything decidable without a database lives here: which stored row renders
 * to which document, what the file inside the zip is called, what the manifest
 * says about the ones that could not be rendered, and when a selection is too
 * large to serve in one request. That makes all of it unit-testable without a
 * session, a Prisma mock or an HTTP request, and leaves the route holding only
 * the parts that genuinely need those things.
 *
 * WHY PDF AND NOT WORD
 * --------------------
 * These files are shared with clients, and a PDF is what a client should
 * receive: it looks the same everywhere and nobody edits it by accident. Each
 * document is rendered by the SAME react-pdf component the on-screen `.pdf`
 * button uses, so a file out of the zip and a file downloaded on its own are
 * the same document. The `.docx` builders remain the single-report Word
 * downloads; nothing about them changed.
 *
 * TWO RULES CARRIED OVER FROM THE SINGLE-REPORT EXPORTS
 * ----------------------------------------------------
 *   1. Documents are rendered from STORED reports only. A caller cannot post
 *      content and have the server hand it back as an official-looking
 *      deliverable - the same stance every single-report export route takes.
 *   2. A stored report that does not satisfy today's schema is SKIPPED with a
 *      reason, never rendered half-way. A bulk download hides individual
 *      failures by construction, so every skip is written into `manifest.csv`
 *      and reported back to the caller. Eleven files out of twelve must never
 *      look like twelve.
 *
 * No model is called anywhere in here. Bulk exporting costs nothing, however
 * many reports it covers.
 */

import { createElement, type ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import JSZip from "jszip";

import { storedMeetingReportSchema } from "@/lib/ai/meetingReport";
import { storedWeeklyReportSchema } from "@/lib/ai/weeklyHuddleCompose";
import { storedWmReportSchema } from "@/lib/reports/wmCompose";
import { storedWeekRollupReportSchema } from "@/lib/reports/weekRollupCompose";
import { storedMonthlyReportSchema } from "@/lib/reports/monthlyCompose";
import DailyAdherencePdfDoc from "@/app/(dashboard)/client-meetings/DailyAdherencePdfDoc";
import WeeklyReportPdfDoc from "@/app/(dashboard)/client-meetings/WeeklyReportPdfDoc";
import WeeklyMeetingReportPdfDoc from "@/app/(dashboard)/client-meetings/WeeklyMeetingReportPdfDoc";
import WeekRollupReportPdfDoc from "@/app/(dashboard)/client-meetings/WeekRollupReportPdfDoc";
import MonthlyReportPdfDoc from "@/app/(dashboard)/client-meetings/MonthlyReportPdfDoc";
import {
  BULK_KIND_FILE_PREFIX,
  BULK_KIND_LABEL,
  BULK_REPORT_KINDS,
  type BulkReportKind,
} from "@/lib/exports/bulkReportKinds";

// Re-exported so server callers have one import for the whole feature. The UI
// imports them from `bulkReportKinds` directly - see that file's header.
export { BULK_KIND_LABEL, BULK_REPORT_KINDS };

/**
 * Caps.
 *
 * Lower than a Word equivalent would need, because a PDF render costs markedly
 * more than a .docx write and this request renders every document before it can
 * answer. Exceeding the cap is answered with "narrow the range", which is a far
 * better outcome than a request that dies at the gateway with no explanation.
 */
export const BULK_MAX_REPORTS = 40;
export const BULK_MAX_BYTES = 60 * 1024 * 1024;

/** One stored row, reduced to what rendering and naming actually need. */
export interface BulkSourceReport {
  id: string;
  kind: BulkReportKind;
  /** The stored document JSON, exactly as the database column holds it. */
  report: unknown;
  /** Falls back into the file name when the stored document has no client name. */
  clientName: string;
  /**
   * The period the row covers, as the DB knows it. Used when the document
   * itself carries no date - a per-huddle report keys on its meeting date,
   * which lives on the transcript row rather than inside the report.
   */
  period?: string | null;
  currentVersion: number;
  validated: boolean;
  generatedAt: Date | string | null;
}

export interface BulkZipEntry {
  reportId: string;
  kind: BulkReportKind;
  clientName: string;
  period: string;
  fileName: string;
  bytes: number;
  validated: boolean;
  version: number;
  generatedAt: string;
}

export interface BulkZipSkip {
  reportId: string;
  kind: BulkReportKind;
  clientName: string;
  reason: string;
}

export interface BulkZipResult {
  /**
   * ArrayBuffer rather than Uint8Array: `NextResponse` accepts the former as a
   * body directly, and JSZip reads it back unchanged in tests.
   */
  zip: ArrayBuffer;
  entries: BulkZipEntry[];
  skipped: BulkZipSkip[];
}

/** Thrown when a selection is larger than one request can serve. */
export class BulkExportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BulkExportLimitError";
  }
}

/**
 * Filesystem-safe name, identical to the single-report exports.
 *
 * Kept as one helper rather than five inline copies precisely because those
 * copies have to agree with these: a facilitator who downloads one report and
 * then a zip should see the same file name both times.
 */
export function sanitizeFilePart(value: string): string {
  return value.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
}

/** `Daily-Huddle-Weekly-Moreyeahs-Live-2026-08-24` - no extension. */
export function reportBaseName(
  kind: BulkReportKind,
  clientName: string,
  period: string,
): string {
  return sanitizeFilePart(
    `${BULK_KIND_FILE_PREFIX[kind]}-${clientName}-${period}`,
  ).slice(0, 80);
}

/**
 * Hands out unique names within one zip.
 *
 * Reports CAN legitimately collide on a name: a client renamed mid-quarter, two
 * weekly meetings held on one date (the reason `WM` keys on the meeting id and
 * not the date), or two huddles recorded for one day. A zip with a duplicated
 * entry name silently loses one of them in most unzip tools, which is data loss
 * dressed up as a successful download.
 */
export class ZipNameAllocator {
  private used = new Set<string>();

  allocate(base: string, extension: string): string {
    const safeBase = base || "report";
    let candidate = `${safeBase}.${extension}`;
    let n = 2;
    while (this.used.has(candidate.toLowerCase())) {
      candidate = `${safeBase}-${n}.${extension}`;
      n += 1;
    }
    this.used.add(candidate.toLowerCase());
    return candidate;
  }
}

/** `Meeting-Reports-2026-08-01_2026-08-31.zip` */
export function bulkZipFileName(range: { from: string; to: string }): string {
  return `${sanitizeFilePart(`Meeting-Reports-${range.from}_${range.to}`).slice(0, 80)}.zip`;
}

type RenderOutcome =
  | { ok: true; doc: ReactElement; period: string; clientName: string }
  | { ok: false; reason: string };

const SCHEMA_SKIP = "Stored under an older schema version - could not be rendered";

/**
 * Parse one stored report and build its PDF document element.
 *
 * Each kind is validated by the SAME schema its single-report route uses, and
 * rendered by the SAME component the on-screen `.pdf` button uses. A schema miss
 * returns a reason instead of throwing: one report stored under an older schema
 * version must not cost the caller the other thirty-nine.
 */
export function renderStoredReport(
  source: BulkSourceReport,
  options: { orgName: string },
): RenderOutcome {
  const { orgName } = options;
  const validated = source.validated;

  switch (source.kind) {
    case "DH_DAILY": {
      const parsed = storedMeetingReportSchema.safeParse(source.report);
      if (!parsed.success) return { ok: false, reason: SCHEMA_SKIP };
      // A per-huddle report's date lives on the transcript, not in the document,
      // so the row's own period is the authority here.
      const period = source.period ?? parsed.data.meta?.date ?? "";
      if (!period) {
        return { ok: false, reason: "The huddle has no meeting date to file it under" };
      }
      return {
        ok: true,
        doc: createElement(DailyAdherencePdfDoc, { report: parsed.data, orgName }),
        period: String(period).slice(0, 10),
        clientName: source.clientName,
      };
    }
    case "DH_WEEKLY": {
      const parsed = storedWeeklyReportSchema.safeParse(source.report);
      if (!parsed.success) return { ok: false, reason: SCHEMA_SKIP };
      return {
        ok: true,
        doc: createElement(WeeklyReportPdfDoc, { report: parsed.data, orgName }),
        period: parsed.data.weekStart,
        clientName: parsed.data.clientName || source.clientName,
      };
    }
    case "WM": {
      const parsed = storedWmReportSchema.safeParse(source.report);
      if (!parsed.success) return { ok: false, reason: SCHEMA_SKIP };
      return {
        ok: true,
        doc: createElement(WeeklyMeetingReportPdfDoc, {
          report: parsed.data,
          orgName,
          validated,
        }),
        period: parsed.data.meetingDate,
        clientName: parsed.data.clientName || source.clientName,
      };
    }
    case "WEEK_ROLLUP": {
      const parsed = storedWeekRollupReportSchema.safeParse(source.report);
      if (!parsed.success) return { ok: false, reason: SCHEMA_SKIP };
      return {
        ok: true,
        doc: createElement(WeekRollupReportPdfDoc, {
          report: parsed.data,
          orgName,
          validated,
        }),
        period: parsed.data.weekStart,
        clientName: parsed.data.clientName || source.clientName,
      };
    }
    case "MONTHLY": {
      const parsed = storedMonthlyReportSchema.safeParse(source.report);
      if (!parsed.success) return { ok: false, reason: SCHEMA_SKIP };
      return {
        ok: true,
        doc: createElement(MonthlyReportPdfDoc, {
          report: parsed.data,
          orgName,
          validated,
        }),
        period: parsed.data.period,
        clientName: parsed.data.clientName || source.clientName,
      };
    }
    default: {
      // Unreachable while `BulkReportKind` and this switch agree - the compiler
      // enforces that. Present so a kind added to the union without a renderer
      // is skipped with a reason instead of crashing a whole download.
      const unknownKind: never = source.kind;
      return { ok: false, reason: `No PDF renderer for ${String(unknownKind)}` };
    }
  }
}

/** CSV cell that survives commas, quotes and newlines in a client name. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export const MANIFEST_FILE_NAME = "manifest.csv";

/**
 * The manifest.
 *
 * The point of it is the skipped rows. A zip is opaque - nobody counts its
 * entries against what they expected - so the file that says "this report was
 * not included, and here is why" is the difference between a partial download
 * and a misleading one.
 */
export function buildManifestCsv(
  entries: BulkZipEntry[],
  skipped: BulkZipSkip[],
): string {
  const header = "Client,Report,Period,Version,Signed off,Generated,File,Status";
  const rows = entries.map((e) =>
    [
      csvCell(e.clientName),
      csvCell(BULK_KIND_LABEL[e.kind]),
      csvCell(e.period),
      String(e.version),
      e.validated ? "Yes" : "No",
      csvCell(e.generatedAt),
      csvCell(e.fileName),
      "Included",
    ].join(","),
  );
  const skips = skipped.map((s) =>
    [
      csvCell(s.clientName),
      csvCell(BULK_KIND_LABEL[s.kind] ?? s.kind),
      "",
      "",
      "",
      "",
      "",
      csvCell(`Skipped - ${s.reason}`),
    ].join(","),
  );
  return [header, ...rows, ...skips].join("\r\n") + "\r\n";
}

const iso = (value: Date | string | null): string => {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * Render every source report into one zip of PDFs.
 *
 * Files are laid out one folder per client (`Moreyeahs-Live/...`) once more than
 * one client is included, and flat for a single client - a facilitator
 * downloading their own client's quarter should not have to open a folder to
 * reach anything.
 */
export async function buildBulkReportZip(
  sources: BulkSourceReport[],
  options: {
    orgName: string;
    maxReports?: number;
    maxBytes?: number;
  },
): Promise<BulkZipResult> {
  const maxReports = options.maxReports ?? BULK_MAX_REPORTS;
  const maxBytes = options.maxBytes ?? BULK_MAX_BYTES;

  if (sources.length > maxReports) {
    throw new BulkExportLimitError(
      `That range covers ${sources.length} reports - the limit for one download is ${maxReports}. Narrow the date range or pick fewer clients.`,
    );
  }

  const clientCount = new Set(sources.map((s) => s.clientName)).size;
  const useFolders = clientCount > 1;

  const zip = new JSZip();
  const names = new ZipNameAllocator();
  const entries: BulkZipEntry[] = [];
  const skipped: BulkZipSkip[] = [];
  let totalBytes = 0;

  for (const source of sources) {
    const outcome = renderStoredReport(source, { orgName: options.orgName });
    if (!outcome.ok) {
      skipped.push({
        reportId: source.id,
        kind: source.kind,
        clientName: source.clientName,
        reason: outcome.reason,
      });
      continue;
    }

    // Sequential on purpose. Rendering forty PDFs concurrently would peak at
    // forty documents held in memory at once, for no wall-clock gain worth it.
    const buffer = await renderToBuffer(outcome.doc);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new BulkExportLimitError(
        `The selected reports exceed the ${Math.round(maxBytes / (1024 * 1024))} MB download limit. Narrow the date range or pick fewer clients.`,
      );
    }

    const fileName = names.allocate(
      reportBaseName(source.kind, outcome.clientName, outcome.period),
      "pdf",
    );
    const path = useFolders
      ? `${sanitizeFilePart(outcome.clientName) || "client"}/${fileName}`
      : fileName;

    zip.file(path, new Uint8Array(buffer));
    entries.push({
      reportId: source.id,
      kind: source.kind,
      clientName: outcome.clientName,
      period: outcome.period,
      fileName: path,
      bytes: buffer.byteLength,
      validated: source.validated,
      version: source.currentVersion,
      generatedAt: iso(source.generatedAt),
    });
  }

  zip.file(MANIFEST_FILE_NAME, buildManifestCsv(entries, skipped));

  const bytes = await zip.generateAsync({
    type: "arraybuffer",
    // A PDF's own streams are already compressed, so re-compressing hard buys
    // almost nothing and costs measurable CPU on a request that has just
    // rendered up to forty documents. Level 1 keeps the manifest small and the
    // rest cheap.
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  });

  return { zip: bytes, entries, skipped };
}
