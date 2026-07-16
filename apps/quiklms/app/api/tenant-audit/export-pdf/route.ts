import type { LmsTenantActionType as TenantActionType } from '@prisma/client';
import { route, json, ApiError } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getLogsForPDF } from '@/lib/services/tenant-audit-service';

// GET /api/tenant-audit/export-pdf?startDate=&endDate=&actionType= — TENANT_ADMIN | SUB_ADMIN
//
// STUB: the legacy handler streams a PDF generated with `pdfkit`. pdfkit is not a
// dependency of this build (and deps cannot be added in this phase), so PDF
// streaming is deferred. The data-fetch path is ported faithfully; rendering the
// PDF document is left to a follow-up once pdfkit (or a serverless-friendly PDF
// lib) is wired in. We return 501 to make the gap explicit rather than emit a
// non-PDF body under a PDF content-type.
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

  // Data path is preserved (validates filters / scoping) even though we cannot render.
  await getLogsForPDF(orgId, startDate, endDate, actionType);

  throw new ApiError(501, 'PDF export is not yet available in this build (pdfkit dependency pending).', 'Not Implemented');
});
