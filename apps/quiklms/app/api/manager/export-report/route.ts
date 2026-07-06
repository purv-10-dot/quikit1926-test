import { NextResponse } from 'next/server';
import { route } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { exportTeamReport } from '@/lib/services/manager-service';

// GET /api/manager/export-report — MANAGER (JSON download, matches legacy behavior)
export const GET = route(async (req) => {
  const user = await requireAuth(req);
  requireRoles(user, ['MANAGER']);
  const reportData = await exportTeamReport(user.id, user.tenantId as string);
  return new NextResponse(JSON.stringify({ success: true, data: reportData }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename=team-report-${Date.now()}.json` },
  });
});
