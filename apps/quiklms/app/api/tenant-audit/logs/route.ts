import type { LmsTenantActionType as TenantActionType } from '@prisma/client';
import { route, json } from '@/lib/http';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTenantLogs, seedIfEmpty } from '@/lib/services/tenant-audit-service';

// GET /api/tenant-audit/logs?startDate=&endDate=&actionType=&page=&limit= — TENANT_ADMIN | SUB_ADMIN
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN']);

  const orgId = actor.orgId;
  if (!orgId) {
    return json({
      success: true,
      data: { logs: [], pagination: { total: 0, page: 1, limit: 50, totalPages: 0 } },
      message: 'No tenant context found',
    });
  }

  // Seed audit logs from existing data if this tenant has no audit history
  await seedIfEmpty(orgId);

  const url = new URL(req.url);
  const startDate = url.searchParams.get('startDate') ? new Date(url.searchParams.get('startDate')!) : undefined;
  const endDate = url.searchParams.get('endDate') ? new Date(url.searchParams.get('endDate')!) : undefined;
  const actionType = (url.searchParams.get('actionType') as TenantActionType | null) || undefined;
  const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
  const limitNum = parseInt(url.searchParams.get('limit') || '50', 10);
  const skip = (pageNum - 1) * limitNum;

  const result = await getTenantLogs(orgId, { startDate, endDate, actionType, limit: limitNum, skip });

  return json({
    success: true,
    data: {
      logs: result.logs,
      pagination: {
        total: result.total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(result.total / limitNum),
      },
    },
    message: 'Tenant audit logs fetched successfully',
  });
});
