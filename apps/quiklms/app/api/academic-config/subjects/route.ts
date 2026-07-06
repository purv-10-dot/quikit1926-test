import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { getSubjects, addSubject } from '@/lib/services/academic-config-service';

function tenantOf(req: Request, tenantId: string | null): string {
  const headerTenant = req.headers.get('x-tenant-id') || undefined;
  const resolved = tenantId ?? headerTenant;
  if (!resolved) throw BadRequest('Tenant ID required');
  return resolved;
}

// GET /api/academic-config/subjects — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const tenantId = tenantOf(req, actor.tenantId);
  return json(await getSubjects(tenantId));
});

// POST /api/academic-config/subjects { name }
export const POST = route(async (req) => {
  const actor = await requireAuth(req);
  const tenantId = tenantOf(req, actor.tenantId);
  const body = await parseBody(req, z.object({ name: z.string() }));
  return json({ name: await addSubject(tenantId, body.name) });
});
