/**
 * Manager report exports — the real ZIP and XLSX builders.
 *
 * Ported from `ManagerService.downloadTeamCertificates` / `exportTeamExcel`
 * (`manager.service.ts:1621-1938`). The port previously returned JSON from the
 * ZIP endpoint and CSV from the Excel one, so neither delivered the format its
 * caller asked for (GAP_REPORT §3.2 manager).
 *
 * Library choices differ from the legacy where the legacy's do not apply here:
 *  - XLSX: `exceljs`, the SAME library the original used, so the workbook is
 *    byte-comparable in structure (columns, styling, summary row).
 *  - ZIP: `jszip` rather than `archiver`. archiver is stream/pipe-oriented and
 *    built for an Express `Response`; Next route handlers return a Response body
 *    instead. jszip is already a dependency (SCORM) and produces the buffer we
 *    need without a second package.
 *
 * DEVIATIONS FROM THE LEGACY — deliberate, both are legacy bugs:
 *  1. Audit action type. The legacy logged `COURSE_COMPLETED` for BOTH a ZIP
 *     download and a report export (`:1721`, `:1928`), which poisons the audit
 *     trail with course completions that never happened. Both now log
 *     `TeamReportExportedByManager`, which is what these actions are.
 *  2. Filename collisions. The legacy stamped date only (`team-report-2026-07-17.xlsx`),
 *     so a second export the same day overwrote the first in the browser's
 *     download folder. Filenames now carry a time component.
 */
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { presignFromUrlOrKey } from '@/lib/s3';
import { tryCreateLog } from '@/lib/services/tenant-audit-service';
import { getTeamCertificates, getTeamReportData } from '@/lib/services/manager-service';
import { NotFound } from '@/lib/http';

/** Derived from the service rather than re-declared, so the two cannot drift. */
type TeamReportRow = Awaited<ReturnType<typeof getTeamReportData>>[number];

/** `2026-07-17_1432` — date plus HHmm, so same-day exports do not collide. */
function fileStamp(now = new Date()): string {
  const iso = now.toISOString();
  return `${iso.slice(0, 10)}_${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/** Legacy filename sanitisation: strip anything outside [A-Za-z0-9-]. */
function safeSegment(s: string): string {
  return (s || '').replace(/[^a-zA-Z0-9-]/g, '');
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

/**
 * Build a ZIP of every issued team certificate PDF.
 *
 * Certificates whose PDF cannot be fetched are SKIPPED, not fatal — the legacy
 * did the same (`:1704-1712`): one dead S3 object must not deny the manager the
 * rest of the team's certificates.
 */
export async function buildTeamCertificatesZip(managerId: string, orgId: string): Promise<ExportResult> {
  const certificates = await getTeamCertificates(managerId, orgId);
  if (!certificates.length) throw NotFound('No certificates found for team members');

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let added = 0;

  for (const cert of certificates) {
    const pdfUrl = cert.pdfUrl || '';
    if (!pdfUrl) continue;

    // `getTeamCertificates` already resolved these to strings ("First Last" /
    // the course title), where the legacy read a populated learnerId doc. Spaces
    // become '-' first so the result still reads "First-Last" as it did before
    // sanitisation strips everything outside [A-Za-z0-9-].
    const userName = safeSegment((cert.learnerName || '').trim().replace(/\s+/g, '-')) || 'Unknown';
    const title = cert.courseTitle || '';
    const courseName = title && title !== 'Unknown Course' ? safeSegment(title).substring(0, 50) : 'Unknown';

    // The legacy could emit two identical filenames (same learner, same course
    // title) and silently clobber one inside the archive. De-duplicate instead.
    let certFilename = `${userName}-${courseName}-certificate.pdf`;
    if (usedNames.has(certFilename)) {
      let n = 2;
      while (usedNames.has(`${userName}-${courseName}-certificate-${n}.pdf`)) n++;
      certFilename = `${userName}-${courseName}-certificate-${n}.pdf`;
    }
    usedNames.add(certFilename);

    try {
      const fetchUrl = (await presignFromUrlOrKey(pdfUrl)) || pdfUrl;
      const res = await fetch(fetchUrl);
      if (!res.ok) continue;
      zip.file(certFilename, Buffer.from(await res.arrayBuffer()));
      added++;
    } catch {
      // Skip this certificate; keep going.
    }
  }

  if (added === 0) throw NotFound('No certificates found for team members');

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }, // matches archiver's zlib level 9
  });
  const filename = `team-certificates-${fileStamp()}.zip`;

  await tryCreateLog({
    orgId,
    performedBy: managerId,
    actionType: 'TeamReportExportedByManager',
    description: `Manager downloaded ${added} team certificates as ZIP`,
    metadata: { certificateCount: added, filename },
  });

  return { buffer, filename, contentType: 'application/zip' };
}

const COLUMNS: Array<{ header: string; key: keyof TeamReportRow & string; width: number }> = [
  { header: 'Learner Name', key: 'learnerName', width: 25 },
  { header: 'Email', key: 'email', width: 35 },
  { header: 'Total Courses Assigned', key: 'totalCoursesAssigned', width: 22 },
  { header: 'Courses Completed', key: 'coursesCompleted', width: 18 },
  { header: 'Completion Rate (%)', key: 'completionRate', width: 18 },
  { header: 'Certificates Earned', key: 'certificatesEarned', width: 18 },
  { header: 'Last Active Date', key: 'lastActiveDate', width: 20 },
];

const NUMERIC_KEYS = ['totalCoursesAssigned', 'coursesCompleted', 'completionRate', 'certificatesEarned'] as const;

/** Build the team report as a real .xlsx workbook — port of `exportTeamExcel`. */
export async function buildTeamReportWorkbook(managerId: string, orgId: string): Promise<ExportResult> {
  const data = await getTeamReportData(managerId, orgId);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Quick Skill LMS';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Team Report', {
    headerFooter: { firstHeader: 'Team Progress Report' },
  });
  worksheet.columns = COLUMNS;

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // indigo
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  headerRow.height = 25;

  data.forEach((d, index) => {
    const row = worksheet.addRow({
      learnerName: d.learnerName,
      email: d.email,
      totalCoursesAssigned: d.totalCoursesAssigned,
      coursesCompleted: d.coursesCompleted,
      completionRate: d.completionRate,
      certificatesEarned: d.certificatesEarned,
      lastActiveDate: d.lastActiveDate,
    });
    if (index % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
    }
    for (const key of NUMERIC_KEYS) row.getCell(key).alignment = { horizontal: 'center' };
  });

  worksheet.getColumn('lastActiveDate').numFmt = 'yyyy-mm-dd';

  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
      };
    });
  });

  const summaryRow = worksheet.addRow({
    learnerName: 'TOTAL',
    email: '',
    totalCoursesAssigned: data.reduce((sum, d) => sum + d.totalCoursesAssigned, 0),
    coursesCompleted: data.reduce((sum, d) => sum + d.coursesCompleted, 0),
    // Mean of per-member rates, as in the legacy — NOT completed/assigned overall.
    completionRate: data.length
      ? Math.round(data.reduce((sum, d) => sum + d.completionRate, 0) / data.length)
      : 0,
    certificatesEarned: data.reduce((sum, d) => sum + d.certificatesEarned, 0),
    lastActiveDate: '',
  });
  summaryRow.font = { bold: true };
  summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const filename = `team-report-${fileStamp()}.xlsx`;

  await tryCreateLog({
    orgId,
    performedBy: managerId,
    actionType: 'TeamReportExportedByManager',
    description: `Manager exported team report with ${data.length} members`,
    metadata: { memberCount: data.length, filename },
  });

  return {
    buffer,
    filename,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
