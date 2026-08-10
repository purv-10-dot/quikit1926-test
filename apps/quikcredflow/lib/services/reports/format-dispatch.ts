/**
 * Shared dispatcher for the `?format=csv|xlsx` branch on list routes.
 *
 * Each route used to inline this logic per-format; this helper consolidates
 * the permission check, tz read, and choice between `streamCsv` and
 * `streamXlsx` so adding/changing formats is a single-file edit.
 */
import { NextResponse } from "next/server";
import { streamCsv, type CsvColumn } from "./csv-stream";
import { streamXlsx } from "./xlsx-stream";
import { readTzFromCookieHeader } from "./csv-columns";
import { assertExportPermissionResponse, todayIsoForTz } from "./export-helper";
import type { SessionUser } from "@/types/permission";

export type ReportFormat = "csv" | "xlsx";

export function parseReportFormat(searchParams: URLSearchParams): ReportFormat | null {
  const raw = searchParams.get("format");
  if (raw === "csv") return "csv";
  if (raw === "xlsx" || raw === "excel") return "xlsx";
  return null;
}

export async function dispatchExport<T>(opts: {
  format: ReportFormat;
  user: SessionUser;
  cookieHeader: string | null;
  rows: AsyncIterable<T>;
  columns: CsvColumn<T>[];
  /** Filename stem; today's date + extension are appended automatically. */
  filenameStem: string;
}): Promise<NextResponse> {
  const denied = await assertExportPermissionResponse(opts.user);
  if (denied) return denied;

  const tz = readTzFromCookieHeader(opts.cookieHeader);
  const filename = `${opts.filenameStem}-${todayIsoForTz(tz)}`;

  if (opts.format === "xlsx") {
    return streamXlsx(opts.rows, opts.columns, filename);
  }
  return streamCsv(opts.rows, opts.columns, filename);
}
