import { NextResponse } from 'next/server';
import type { LmsTenantActionType as TenantActionType } from '@prisma/client';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLogsForPDF } from '@/lib/services/tenant-audit-service';
import { buildTenantAuditPdf, type AuditPdfLog } from '@/lib/services/tenant-audit-pdf';

// GET /api/tenant-audit/export-pdf?startDate=&endDate=&actionType= — TENANT_ADMIN | SUB_ADMIN
//
// Returns a real PDF. This previously returned 501 pending a pdfkit dependency;
// it is now rendered with jsPDF, which the app already ships (the certificate
// renderer uses it) and which returns a buffer rather than needing an Express
// stream. Same A4-landscape table the legacy produced.
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);

  const orgId = actor.orgId;
  if (!orgId) {
    return json({ success: false, message: 'No tenant context found' }, 400);
  }

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate') ? new Date(url.searchParams.get('startDate')!) : undefined;
  const endDate = url.searchParams.get('endDate') ? new Date(url.searchParams.get('endDate')!) : undefined;
  const actionType = (url.searchParams.get('actionType') as TenantActionType | null) || undefined;

  const logs = await getLogsForPDF(orgId, startDate, endDate, actionType);
  const buffer = buildTenantAuditPdf(logs as unknown as AuditPdfLog[], { startDate, endDate, actionType });

  const filename = `audit-trail-${new Date().toISOString().split('T')[0]}.pdf`;
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': body.length.toString(),
      'Cache-Control': 'no-store',
    },
  });
});
