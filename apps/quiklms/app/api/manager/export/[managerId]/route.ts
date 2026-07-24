import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { buildTeamReportWorkbook } from '@/lib/services/manager-export-service';

// GET /api/manager/export/:managerId — MANAGER
//
// Returns a real .xlsx workbook, built with exceljs — the same library the
// legacy used, so columns, styling and the TOTAL summary row match. The port
// previously returned CSV: competent CSV, but not the format the endpoint (and
// its .xlsx-expecting caller) promises.
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  if (user.id !== params!.managerId) {
    return json({ success: false, message: 'You can only export reports for your own team' }, 403);
  }

  const { buffer, filename, contentType } = await buildTeamReportWorkbook(params!.managerId, user.orgId as string);
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': body.length.toString(),
      'Cache-Control': 'no-store',
    },
  });
});
