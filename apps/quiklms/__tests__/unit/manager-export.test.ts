/**
 * GAP_REPORT §3.2 manager:
 *  - "GET /manager/certificates/download/:managerId returns JSON, not a ZIP."
 *  - "GET /manager/export/:managerId returns CSV, not Excel. Its filename is
 *     date-only, so two same-day exports collide."
 *
 * These assert on the produced BYTES — a real ZIP is opened and its entries
 * listed; a real workbook is re-read and its cells checked — so they fail if
 * either regresses to JSON/CSV or to a structurally broken file.
 *
 * Two legacy behaviours are deliberately NOT reproduced (both are legacy bugs);
 * each has a test below pinning the corrected behaviour:
 *  1. the audit action was `COURSE_COMPLETED` for both endpoints;
 *  2. filenames were date-only and collided.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const h = vi.hoisted(() => ({
  getTeamCertificates: vi.fn(),
  getTeamReportData: vi.fn(),
  presignFromUrlOrKey: vi.fn(),
  tenantLogCreate: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@/lib/env', () => ({ env: { DATABASE_URL: 'x' }, optionalEnv: () => '' }));
vi.mock('@/lib/s3', () => ({ presignFromUrlOrKey: h.presignFromUrlOrKey }));
vi.mock('@/lib/db', () => ({ db: { lmsTenantLog: { create: h.tenantLogCreate } } }));
vi.mock('@/lib/services/manager-service', () => ({
  getTeamCertificates: h.getTeamCertificates,
  getTeamReportData: h.getTeamReportData,
}));

import { buildTeamCertificatesZip, buildTeamReportWorkbook } from '@/lib/services/manager-export-service';

const PDF = Buffer.from('%PDF-1.4 fake certificate bytes');

const cert = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  certificateId: 'CERT-1',
  pdfUrl: 'https://b.s3.ap-south-1.amazonaws.com/certs/1.pdf',
  learnerName: 'Ada Lovelace',
  courseTitle: 'Fire Safety',
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  learnerName: 'Ada Lovelace',
  email: 'ada@test.dev',
  totalCoursesAssigned: 4,
  coursesCompleted: 2,
  completionRate: 50,
  certificatesEarned: 1,
  lastActiveDate: new Date('2026-02-03T00:00:00Z'),
  ...over,
});

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  vi.stubGlobal('fetch', h.fetch);
  h.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array(PDF).buffer });
  h.presignFromUrlOrKey.mockImplementation(async (u: string) => `${u}?signed`);
  h.tenantLogCreate.mockResolvedValue({ id: 'log1' });
  h.getTeamCertificates.mockResolvedValue([cert()]);
  h.getTeamReportData.mockResolvedValue([row()]);
});

describe('buildTeamCertificatesZip — a real archive, not JSON', () => {
  it('produces an openable ZIP containing the certificate PDF', async () => {
    const { buffer, filename, contentType } = await buildTeamCertificatesZip('m1', 'org-1');

    expect(contentType).toBe('application/zip');
    expect(filename).toMatch(/^team-certificates-\d{4}-\d{2}-\d{2}_\d{4}\.zip$/);

    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files);
    // Legacy filename shape: "First-Last" + course title with everything outside
    // [A-Za-z0-9-] stripped, so "Fire Safety" collapses to "FireSafety".
    expect(names).toEqual(['Ada-Lovelace-FireSafety-certificate.pdf']);

    const content = await zip.file(names[0])!.async('nodebuffer');
    expect(content.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('fetches through a presigned url — the bucket is private', async () => {
    await buildTeamCertificatesZip('m1', 'org-1');
    expect(h.fetch).toHaveBeenCalledWith('https://b.s3.ap-south-1.amazonaws.com/certs/1.pdf?signed');
  });

  it('skips a certificate whose PDF is gone rather than failing the whole archive', async () => {
    h.getTeamCertificates.mockResolvedValue([cert(), cert({ certificateId: 'CERT-2', learnerName: 'Grace Hopper' })]);
    h.fetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new Uint8Array(PDF).buffer });

    const { buffer } = await buildTeamCertificatesZip('m1', 'org-1');
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toHaveLength(1); // the survivor
  });

  it('de-duplicates identical filenames instead of clobbering inside the archive', async () => {
    h.getTeamCertificates.mockResolvedValue([cert(), cert({ certificateId: 'CERT-2' })]);
    const { buffer } = await buildTeamCertificatesZip('m1', 'org-1');
    const zip = await JSZip.loadAsync(buffer);
    expect(Object.keys(zip.files)).toHaveLength(2);
  });

  it('404s when every PDF fetch fails — an empty ZIP is not a success', async () => {
    h.fetch.mockResolvedValue({ ok: false });
    await expect(buildTeamCertificatesZip('m1', 'org-1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('logs the download as an export, NOT as a course completion', async () => {
    await buildTeamCertificatesZip('m1', 'org-1');
    const log = h.tenantLogCreate.mock.calls[0][0].data;
    // The legacy logged COURSE_COMPLETED here, inventing completions that never happened.
    expect(log.actionType).toBe('TeamReportExportedByManager');
    expect(log.performedBy).toBe('m1');
    expect(log.description).toBe('Manager downloaded 1 team certificates as ZIP');
  });
});

describe('buildTeamReportWorkbook — a real .xlsx, not CSV', () => {
  it('produces a workbook that re-opens with the expected headers and data', async () => {
    const { buffer, filename, contentType } = await buildTeamReportWorkbook('m1', 'org-1');

    expect(contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(filename).toMatch(/^team-report-\d{4}-\d{2}-\d{2}_\d{4}\.xlsx$/);
    // A real zip-based OOXML file starts with the local file header 'PK'.
    expect(buffer.subarray(0, 2).toString()).toBe('PK');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Team Report')!;
    expect(ws).toBeDefined();

    const header = ws.getRow(1).values as unknown[];
    expect(header).toContain('Learner Name');
    expect(header).toContain('Completion Rate (%)');

    const first = ws.getRow(2);
    expect(first.getCell(1).value).toBe('Ada Lovelace');
    expect(first.getCell(2).value).toBe('ada@test.dev');
    expect(first.getCell(5).value).toBe(50);
  });

  it('appends a bold TOTAL summary row', async () => {
    h.getTeamReportData.mockResolvedValue([row(), row({ learnerName: 'Grace Hopper', totalCoursesAssigned: 2, coursesCompleted: 2, completionRate: 100, certificatesEarned: 3 })]);

    const { buffer } = await buildTeamReportWorkbook('m1', 'org-1');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const ws = wb.getWorksheet('Team Report')!;

    const total = ws.getRow(4); // header + 2 data rows + total
    expect(total.getCell(1).value).toBe('TOTAL');
    expect(total.getCell(3).value).toBe(6); // 4 + 2 assigned
    expect(total.getCell(4).value).toBe(4); // 2 + 2 completed
    expect(total.getCell(5).value).toBe(75); // mean of 50 and 100 — legacy semantics
    expect(total.getCell(6).value).toBe(4); // 1 + 3 certificates
  });

  it('handles an empty team without dividing by zero', async () => {
    h.getTeamReportData.mockResolvedValue([]);
    const { buffer } = await buildTeamReportWorkbook('m1', 'org-1');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as never);
    const total = wb.getWorksheet('Team Report')!.getRow(2);
    expect(total.getCell(1).value).toBe('TOTAL');
    expect(total.getCell(5).value).toBe(0);
  });

  it('logs the export as an export, NOT as a course completion', async () => {
    await buildTeamReportWorkbook('m1', 'org-1');
    const log = h.tenantLogCreate.mock.calls[0][0].data;
    expect(log.actionType).toBe('TeamReportExportedByManager');
    expect(log.description).toBe('Manager exported team report with 1 members');
  });

  it('a failing audit write never costs the manager their export', async () => {
    h.tenantLogCreate.mockRejectedValue(new Error('audit down'));
    const { buffer } = await buildTeamReportWorkbook('m1', 'org-1');
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
  });

  it('filenames carry a time, so two same-day exports do not collide', async () => {
    // The legacy stamped date only; a second export overwrote the first.
    const a = await buildTeamReportWorkbook('m1', 'org-1');
    expect(a.filename).toMatch(/_\d{4}\.xlsx$/);
  });
});
