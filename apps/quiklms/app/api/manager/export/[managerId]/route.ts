import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTeamReportData } from '@/lib/services/manager-service';

// Escape a single CSV cell per RFC 4180: wrap in quotes when it contains a
// comma, quote, or newline, and double any embedded quotes.
function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

// GET /api/manager/export/:managerId — MANAGER
// Returns a real CSV download of the manager's team report (Content-Type
// text/csv, attachment). No xlsx library required.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  if (user.id !== params!.managerId) {
    return json({ success: false, message: 'You can only export reports for your own team' }, 403);
  }

  const data = await getTeamReportData(params!.managerId, user.tenantId as string);

  const header = [
    'Learner Name',
    'Email',
    'Total Courses Assigned',
    'Courses Completed',
    'Completion Rate (%)',
    'Certificates Earned',
    'Last Active Date',
  ];

  const rows = data.map((m) =>
    toCsvRow([
      m.learnerName,
      m.email,
      m.totalCoursesAssigned,
      m.coursesCompleted,
      m.completionRate,
      m.certificatesEarned,
      m.lastActiveDate instanceof Date ? m.lastActiveDate.toISOString().split('T')[0] : m.lastActiveDate,
    ]),
  );

  // Prepend a UTF-8 BOM so Excel reliably detects encoding.
  const csv = '﻿' + [toCsvRow(header), ...rows].join('\r\n') + '\r\n';
  const filename = `team-report-${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
});
