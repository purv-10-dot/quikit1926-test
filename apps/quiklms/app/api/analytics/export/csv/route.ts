import { NextResponse } from 'next/server';
import { route } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { exportData, convertToCSV } from '@/lib/services/analytics-service';

// GET /api/analytics/export/csv?type=&dateFrom=&dateTo= — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'school-overview';
  const dateFrom = url.searchParams.get('dateFrom') || undefined;
  const dateTo = url.searchParams.get('dateTo') || undefined;

  const result = await exportData(actor.orgId ?? '', type, dateFrom, dateTo);
  const csvContent = convertToCSV(result.data);
  const fileName = `analytics_${type}_${new Date().toISOString().split('T')[0]}.csv`;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
});
