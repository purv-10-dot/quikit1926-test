import { NextResponse } from 'next/server';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTemplate } from '@/lib/services/bulk-upload-service';

// GET /api/bulk-upload/template/:type — TENANT_ADMIN | SUB_ADMIN | SUPER_ADMIN
export const GET = route(async (req, { params }) => {
  const user = await requireAuth(req);
  requireRoles(user, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  const type = params!.type as 'teachers' | 'students' | 'parents';
  const csv = getTemplate(type);
  if (!csv) return json({ success: false, message: 'Unknown template type' }, 400);
  return new NextResponse(csv, {
    status: 200,
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename=${type}-template.csv` },
  });
});
