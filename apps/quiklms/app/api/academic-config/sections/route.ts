import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { getSections, getSectionNames, addSection } from '@/lib/services/academic-config-service';

function tenantOf(req: Request, orgId: string | null): string {
  const headerTenant = req.headers.get('x-tenant-id') || undefined;
  const resolved = orgId ?? headerTenant;
  if (!resolved) throw BadRequest('Tenant ID required');
  return resolved;
}

// GET /api/academic-config/sections?grade= — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const orgId = tenantOf(req, actor.orgId);
  const grade = new URL(req.url).searchParams.get('grade') || undefined;
  if (grade) return json(await getSections(orgId, grade));
  return json(await getSectionNames(orgId));
});

// POST /api/academic-config/sections { grade, name }
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const orgId = tenantOf(req, actor.orgId);
  const body = await parseBody(req, z.object({ grade: z.string().optional(), name: z.string() }));
  await addSection(orgId, body.grade || 'all', body.name);
  return json({ success: true });
});
