import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { getSubjects, addSubject } from '@/lib/services/academic-config-service';

function tenantOf(req: Request, orgId: string | null): string {
  const headerTenant = req.headers.get('x-tenant-id') || undefined;
  const resolved = orgId ?? headerTenant;
  if (!resolved) throw BadRequest('Tenant ID required');
  return resolved;
}

// GET /api/academic-config/subjects — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const orgId = tenantOf(req, actor.orgId);
  return json(await getSubjects(orgId));
});

// POST /api/academic-config/subjects { name }
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const orgId = tenantOf(req, actor.orgId);
  const body = await parseBody(req, z.object({ name: z.string() }));
  return json({ name: await addSubject(orgId, body.name) });
});
